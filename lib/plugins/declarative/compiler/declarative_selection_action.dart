import 'package:otzaria/plugins/declarative/commands/declarative_command_registry.dart';
import 'package:otzaria/plugins/declarative/models/declarative_program.dart';

/// תבנית פעולת host על פריט תפריט הקשר: נפתרת בזמן הלחיצה מנתוני הסימון,
/// בלי מנוע JS ובלי תכנית. ההפניה היחידה היא `$selection` (לצד `$literal`
/// ו-`$concat`), כי המידע הדינמי היחיד בלחיצה הוא הסימון עצמו.
class DeclarativeSelectionAction {
  static const int maxNodes = 128;
  static const int maxDepth = 10;

  /// הנתיבים המותרים ב-`$selection` — תת-קבוצה סקלרית של payload הלחיצה.
  static const Set<String> allowedSelectionPaths = {
    'selectedText',
    'currentRef',
    'currentBook',
    'currentBookId',
    'currentIndex',
    'id',
    'type',
    'source',
  };

  /// ולידציה מבנית של התבנית. עם [declaredPermissions] נבדקת גם הצהרת
  /// ההרשאה של הפעולה — בלעדיה (רישום בגשר) הבדיקה נדחית לזמן הלחיצה.
  static void validateTemplate(
    Map<String, dynamic> json, {
    Set<String>? declaredPermissions,
  }) {
    _assertOnlyKeys(json, const {'type', 'args'}, 'action');
    final type = json['type'];
    if (type is! String || type.isEmpty) {
      throw const DeclarativeProgramException(
        'declarative.invalid_action',
        'action.type must be a non-empty string',
      );
    }
    final definition = DeclarativeCommandRegistry.require(type);
    if (definition.phase != DeclarativeCommandPhase.action ||
        definition.requiredPermission == null) {
      throw DeclarativeProgramException(
        'declarative.invalid_phase',
        'Command "$type" is not an action',
      );
    }
    if (declaredPermissions != null &&
        !declaredPermissions.contains(definition.requiredPermission)) {
      throw DeclarativeProgramException(
        'declarative.permission_not_declared',
        'Action "$type" requires permission '
            '"${definition.requiredPermission}"',
      );
    }
    final args = _requiredMap(json['args'], 'action.args');
    _assertOnlyKeys(
      args,
      {...definition.requiredArgs, ...definition.optionalArgs},
      'action.args',
    );
    final missing = definition.requiredArgs
        .where((field) => !args.containsKey(field))
        .toList();
    if (missing.isNotEmpty) {
      throw DeclarativeProgramException(
        'declarative.invalid_args',
        'Action "$type" is missing: ${missing.join(', ')}',
      );
    }
    final budget = _Budget();
    _validateExpression(args, budget, depth: 0);
  }

  /// פותר את הפניות התבנית מול [payload] של הלחיצה. הערכים המוחזרים עדיין
  /// עוברים את הולידציה המלאה של DeclarativeActionCompiler.
  static Map<String, dynamic> resolve(
    Map<String, dynamic> template,
    Map<String, dynamic> payload,
  ) {
    return {
      'type': template['type'],
      'args': _resolveValue(template['args'], payload),
    };
  }

  static Object? _resolveValue(Object? value, Map<String, dynamic> payload) {
    if (value is Map) {
      final map = Map<String, dynamic>.from(value);
      if (map.length == 1) {
        if (map.containsKey(r'$literal')) return _copy(map[r'$literal']);
        if (map.containsKey(r'$selection')) {
          return payload[map[r'$selection'] as String];
        }
        if (map.containsKey(r'$concat')) {
          return (map[r'$concat'] as List<dynamic>)
              .map((part) => _resolveValue(part, payload))
              .map((part) => part?.toString() ?? '')
              .join();
        }
      }
      return {
        for (final entry in map.entries)
          entry.key: _resolveValue(entry.value, payload),
      };
    }
    if (value is List) {
      return [for (final item in value) _resolveValue(item, payload)];
    }
    return value;
  }

  static void _validateExpression(
    Object? value,
    _Budget budget, {
    required int depth,
  }) {
    budget.visit(depth);
    if (value is Map) {
      final map = _requiredMap(value, 'expression');
      final special = map.keys.where((key) => key.startsWith(r'$')).toList();
      if (special.isNotEmpty) {
        if (map.length != 1) {
          throw const DeclarativeProgramException(
            'declarative.invalid_reference',
            'A reference object must contain exactly one field',
          );
        }
        switch (special.single) {
          case r'$literal':
            _validateLiteral(map[r'$literal'], budget, depth: depth + 1);
          case r'$selection':
            final path = map[r'$selection'];
            if (path is! String || !allowedSelectionPaths.contains(path)) {
              throw DeclarativeProgramException(
                'declarative.invalid_reference',
                'Selection path "$path" is not allowed',
              );
            }
          case r'$concat':
            final parts = map[r'$concat'];
            if (parts is! List || parts.isEmpty || parts.length > 8) {
              throw const DeclarativeProgramException(
                'declarative.invalid_reference',
                r'$concat must contain 1 to 8 parts',
              );
            }
            for (final part in parts) {
              _validateExpression(part, budget, depth: depth + 1);
            }
          default:
            throw DeclarativeProgramException(
              'declarative.invalid_reference',
              'Unsupported reference "${special.single}"',
            );
        }
        return;
      }
      for (final entry in map.entries) {
        _validateExpression(entry.value, budget, depth: depth + 1);
      }
      return;
    }
    if (value is List) {
      if (value.length > 20) {
        throw const DeclarativeProgramException(
          'declarative.value_too_large',
          'Selection action lists are limited to 20 values',
        );
      }
      for (final item in value) {
        _validateExpression(item, budget, depth: depth + 1);
      }
      return;
    }
    _validateScalar(value);
  }

  static void _validateLiteral(
    Object? value,
    _Budget budget, {
    required int depth,
  }) {
    budget.visit(depth);
    if (value is Map) {
      for (final child in _requiredMap(value, 'literal').values) {
        _validateLiteral(child, budget, depth: depth + 1);
      }
      return;
    }
    if (value is List) {
      for (final child in value) {
        _validateLiteral(child, budget, depth: depth + 1);
      }
      return;
    }
    _validateScalar(value);
  }

  static void _validateScalar(Object? value) {
    if (value == null || value is num || value is bool) return;
    if (value is String && value.length <= 4096 && !_hasControlChars(value)) {
      return;
    }
    throw const DeclarativeProgramException(
      'declarative.invalid_value',
      'Selection action templates may contain small JSON values only',
    );
  }

  static bool _hasControlChars(String value) {
    for (final unit in value.codeUnits) {
      if (unit < 0x20 || unit == 0x7F) return true;
    }
    return false;
  }

  static Object? _copy(Object? value) {
    if (value is Map) {
      return {
        for (final entry in value.entries) entry.key: _copy(entry.value),
      };
    }
    if (value is List) return value.map(_copy).toList();
    return value;
  }

  static Map<String, dynamic> _requiredMap(Object? value, String context) {
    if (value is! Map) {
      throw DeclarativeProgramException(
        'declarative.invalid_action',
        '$context must be an object',
      );
    }
    try {
      return Map<String, dynamic>.from(value);
    } on TypeError {
      throw DeclarativeProgramException(
        'declarative.invalid_action',
        '$context keys must be strings',
      );
    }
  }

  static void _assertOnlyKeys(
    Map<String, dynamic> value,
    Set<String> allowed,
    String context,
  ) {
    final unknown = value.keys.where((key) => !allowed.contains(key)).toList();
    if (unknown.isNotEmpty) {
      throw DeclarativeProgramException(
        'declarative.unknown_field',
        '$context contains unsupported fields: ${unknown.join(', ')}',
      );
    }
  }
}

class _Budget {
  int nodes = 0;

  void visit(int depth) {
    if (depth > DeclarativeSelectionAction.maxDepth) {
      throw const DeclarativeProgramException(
        'declarative.value_too_large',
        'Selection action is too deeply nested',
      );
    }
    nodes++;
    if (nodes > DeclarativeSelectionAction.maxNodes) {
      throw const DeclarativeProgramException(
        'declarative.value_too_large',
        'Selection action contains too many value nodes',
      );
    }
  }
}
