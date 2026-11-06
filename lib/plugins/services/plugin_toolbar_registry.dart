import 'package:flutter/foundation.dart';
import 'package:otzaria/plugins/models/plugin_toolbar_item.dart';
import 'package:otzaria/plugins/models/plugin_when_condition.dart';
import 'package:otzaria/plugins/plugin_constants.dart';
import 'package:otzaria/plugins/services/plugin_condition_evaluator.dart';

/// סוגי פקד שילדיהם הם פריטי תפריט.
const _typesWithChildren = {'menu', 'split'};

/// רישום פקדי שורת הפקדים שתוספים הוסיפו (reader.addToolbarItem).
class PluginToolbarRegistry extends ChangeNotifier {
  static const int maxTopLevelItemsPerPlugin = 2;
  static const int maxMenuChildren = 20;

  static final PluginToolbarRegistry instance = PluginToolbarRegistry._();
  PluginToolbarRegistry._() {
    _attachEvaluator(PluginConditionEvaluator.instance);
  }

  @visibleForTesting
  PluginToolbarRegistry.forTesting({PluginConditionEvaluator? evaluator}) {
    if (evaluator != null) _attachEvaluator(evaluator);
  }

  /// מופע מנותק לפרסינג-יבש בוולידציה (אריזה/התקנה) — לא נוגע ב-UI.
  PluginToolbarRegistry.detached();

  final Map<PluginInstanceKey, List<PluginToolbarItem>> _items = {};
  PluginConditionEvaluator? _evaluator;

  void _attachEvaluator(PluginConditionEvaluator evaluator) {
    _evaluator = evaluator;
    evaluator.addListener(notifyListeners);
  }

  @override
  void dispose() {
    _evaluator?.removeListener(notifyListeners);
    super.dispose();
  }

  PluginInstanceKey _key(String pluginId, String instanceId) =>
      (pluginId: pluginId, instanceId: instanceId);

  /// הרשימה של [instanceId] אם היא מכילה את [itemId]; אחרת הרשימה ברמת
  /// התוסף — כך JS של מופע יכול לעדכן/להסיר פריט שהוצהר במניפסט.
  List<PluginToolbarItem>? _listContaining(
    String pluginId,
    String instanceId,
    String itemId,
  ) {
    final own = _items[_key(pluginId, instanceId)];
    if (own != null && own.any((item) => item.id == itemId)) return own;
    if (instanceId == PluginInstanceIds.pluginLevel) return null;
    final shared = _items[_key(pluginId, PluginInstanceIds.pluginLevel)];
    if (shared != null && shared.any((item) => item.id == itemId)) {
      return shared;
    }
    return null;
  }

  void register(
    String pluginId,
    PluginToolbarItem item, {
    String instanceId = PluginInstanceIds.pluginLevel,
  }) {
    final list = _items.putIfAbsent(_key(pluginId, instanceId), () => []);
    final index = list.indexWhere((existing) => existing.id == item.id);
    if (index >= 0) {
      list[index] = item;
    } else {
      if (list.length >= maxTopLevelItemsPerPlugin) {
        throw const PluginToolbarException(
          'error.invalid_params',
          'a plugin can register at most 2 toolbar items',
        );
      }
      list.add(item);
    }
    notifyListeners();
  }

  PluginToolbarItem registerPayload(
    String pluginId,
    Map<String, dynamic> payload, {
    String instanceId = PluginInstanceIds.pluginLevel,
  }) {
    final item = _parseItem(payload, isChild: false);
    register(pluginId, item, instanceId: instanceId);
    return item;
  }

  PluginToolbarItem update(
    String pluginId,
    String itemId,
    Map<String, dynamic> patch, {
    String instanceId = PluginInstanceIds.pluginLevel,
  }) {
    final list = _listContaining(pluginId, instanceId, itemId);
    final index = list?.indexWhere((item) => item.id == itemId) ?? -1;
    if (list == null || index < 0) {
      throw const PluginToolbarException(
        'error.not_found',
        'toolbar item was not found',
      );
    }
    final merged = {...list[index].toJson(), ...patch, 'id': itemId};
    final updated = _parseItem(merged, isChild: false);
    list[index] = updated;
    notifyListeners();
    return updated;
  }

  void remove(
    String pluginId,
    String itemId, {
    String instanceId = PluginInstanceIds.pluginLevel,
  }) {
    final list = _listContaining(pluginId, instanceId, itemId);
    if (list == null) return;
    list.removeWhere((item) => item.id == itemId);
    _items.removeWhere((_, items) => items.isEmpty);
    notifyListeners();
  }

  /// ניקוי מלא ברמת התוסף — כל המופעים והרישומים הדקלרטיביים.
  void removeAll(String pluginId) {
    final before = _items.length;
    _items.removeWhere((key, _) => key.pluginId == pluginId);
    if (_items.length != before) notifyListeners();
  }

  /// מסיר רק את הרישומים של המופע [key] (סגירת טאב אחד של התוסף).
  void removeInstance(PluginInstanceKey key) {
    if (_items.remove(key) != null) notifyListeners();
  }

  /// מחליף קבוצת פריטים מנוהלת בעדכון יחיד, בלי לגעת בפריטים אחרים.
  /// פריטים מנוהלים הם דקלרטיביים — חיים ברמת התוסף.
  void replaceManagedItems(
    String pluginId, {
    required Set<String> managedIds,
    required List<PluginToolbarItem> items,
  }) {
    if (items.any((item) => !managedIds.contains(item.id)) ||
        items.map((item) => item.id).toSet().length != items.length) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'managed toolbar items must have unique declared ids',
      );
    }
    final key = _key(pluginId, PluginInstanceIds.pluginLevel);
    final next = [
      for (final item in _items[key] ?? const <PluginToolbarItem>[])
        if (!managedIds.contains(item.id)) item,
      ...items,
    ];
    if (next.length > maxTopLevelItemsPerPlugin ||
        next.map((item) => item.id).toSet().length != next.length) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'a plugin can register at most 2 unique toolbar items',
      );
    }
    if (next.isEmpty) {
      _items.remove(key);
    } else {
      _items[key] = next;
    }
    notifyListeners();
  }

  /// הפריטים המוצגים בפועל — פריט שתנאי ה-`when` שלו אינו מתקיים מסונן החוצה
  /// (ונשאר רשום, כך שהוא חוזר כשהתנאי מתקיים).
  ///
  /// תצוגה מאוחדת: פריט אחד לכל (pluginId, itemId) גם כשכמה מופעים רשמו
  /// אותו; רישום של מופע חי גובר על העותק הדקלרטיבי, המיקום לפי הראשון.
  List<(String pluginId, PluginToolbarItem item)> getAll() {
    final evaluator = _evaluator;
    final deduped = <(String, String), (String, PluginToolbarItem)>{};
    for (final entry in _items.entries) {
      final pluginId = entry.key.pluginId;
      for (final item in entry.value) {
        if (!(evaluator?.isVisible(pluginId, item.when) ?? true)) continue;
        final dedupeKey = (pluginId, item.id);
        if (!deduped.containsKey(dedupeKey) ||
            entry.key.instanceId != PluginInstanceIds.pluginLevel) {
          deduped[dedupeKey] = (pluginId, item);
        }
      }
    }
    return List.unmodifiable(deduped.values);
  }

  /// מזהי המופעים שרשמו את [itemId] (כולל בתוך תפריטי ילדים), בסדר הרישום —
  /// הקלט לניתוב הלחיצה למופע הנכון.
  List<String> instanceIdsForItem(String pluginId, String itemId) => [
    for (final entry in _items.entries)
      if (entry.key.pluginId == pluginId &&
          entry.value.any((item) => _treeContains(item, itemId)))
        entry.key.instanceId,
  ];

  bool _treeContains(PluginToolbarItem item, String itemId) =>
      item.id == itemId ||
      item.children.any((child) => _treeContains(child, itemId));

  PluginToolbarItem _parseItem(
    Map<String, dynamic> json, {
    required bool isChild,
    List<String>? inheritedContexts,
  }) {
    final id = _safeText(json['id'], field: 'id', maxLength: 128);
    final type = json['type'] as String? ?? 'button';
    final allowedTypes = isChild
        ? const {'button'}
        : const {'button', 'menu', 'split'};
    if (!allowedTypes.contains(type)) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'unsupported toolbar item type',
      );
    }
    final title = _safeText(json['title'], field: 'title', maxLength: 100);
    final contextsValue = json['contexts'];
    if (contextsValue != null &&
        (contextsValue is! List ||
            contextsValue.any((value) => value is! String))) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'contexts must be an array of strings',
      );
    }
    final contexts = contextsValue == null
        ? inheritedContexts ?? const ['reader-text', 'reader-pdf']
        : List<String>.from(contextsValue as List);
    const supportedContexts = {'reader-text', 'reader-pdf'};
    if (contexts.isEmpty ||
        contexts.toSet().length != contexts.length ||
        (contextsValue != null &&
            inheritedContexts != null &&
            contexts.any((context) => !inheritedContexts.contains(context))) ||
        contexts.any((context) => !supportedContexts.contains(context))) {
      throw const PluginToolbarException(
        'error.unsupported_context',
        'contexts must be unique, supported, and within the parent contexts',
      );
    }

    final icon = _optionalSafeText(json['icon'], maxLength: 100);
    if (!isChild && (icon == null || icon.isEmpty)) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'a toolbar item requires an icon',
      );
    }

    final children = <PluginToolbarItem>[];
    final childrenValue = json['children'];
    if (childrenValue != null) {
      if (!_typesWithChildren.contains(type)) {
        throw const PluginToolbarException(
          'error.invalid_params',
          'only menu or split items may declare children',
        );
      }
      if (childrenValue is! List || childrenValue.length > maxMenuChildren) {
        throw const PluginToolbarException(
          'error.invalid_params',
          'children must contain at most 20 items',
        );
      }
      for (final child in childrenValue) {
        if (child is! Map) {
          throw const PluginToolbarException(
            'error.invalid_params',
            'child must be an object',
          );
        }
        children.add(
          _parseItem(
            Map<String, dynamic>.from(child),
            isChild: true,
            inheritedContexts: contexts,
          ),
        );
      }
    }
    if (_typesWithChildren.contains(type) && children.isEmpty) {
      throw PluginToolbarException(
        'error.invalid_params',
        '$type requires children',
      );
    }
    if (children.map((child) => child.id).toSet().length != children.length) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'children ids must be unique',
      );
    }

    final placement = json['placement'] as String? ?? 'primary';
    if (isChild && json['placement'] != null) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'placement is only allowed on top-level items',
      );
    }
    if (!const {'primary', 'overflow'}.contains(placement)) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'placement must be "primary" or "overflow"',
      );
    }

    final rawOrder = json['order'];
    if (rawOrder != null) {
      if (isChild) {
        throw const PluginToolbarException(
          'error.invalid_params',
          'order is only allowed on top-level items',
        );
      }
      if (placement != 'overflow') {
        throw const PluginToolbarException(
          'error.invalid_params',
          'order requires placement "overflow"',
        );
      }
      if (rawOrder is! int || rawOrder < 0 || rawOrder > 10000) {
        throw const PluginToolbarException(
          'error.invalid_params',
          'order must be an integer between 0 and 10000',
        );
      }
    }

    return PluginToolbarItem(
      id: id,
      type: type,
      title: title,
      icon: icon,
      contexts: contexts,
      onClickEvent: _optionalEventName(json['onClickEvent']),
      children: children,
      openPlugin: json['openPlugin'] == true,
      param: json['param'],
      placement: placement,
      order: rawOrder as int? ?? PluginToolbarItem.defaultOrder,
      when: _parseWhen(json['when'], isChild: isChild),
    );
  }

  PluginWhenCondition? _parseWhen(Object? value, {required bool isChild}) {
    if (value == null) return null;
    if (isChild) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'when is only allowed on top-level items',
      );
    }
    try {
      return PluginWhenCondition.fromJson(value);
    } on PluginWhenConditionException catch (error) {
      throw PluginToolbarException('error.invalid_params', '$error');
    }
  }

  String _safeText(
    Object? value, {
    required String field,
    required int maxLength,
  }) {
    final text = _optionalSafeText(value, maxLength: maxLength);
    if (text == null || text.isEmpty) {
      throw PluginToolbarException(
        'error.invalid_params',
        '$field is required',
      );
    }
    return text;
  }

  String? _optionalSafeText(Object? value, {required int maxLength}) {
    if (value == null) return null;
    if (value is! String ||
        value.length > maxLength ||
        RegExp(r'[\u0000-\u001F\u007F]').hasMatch(value)) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'text field has an invalid type or content',
      );
    }
    return value;
  }

  String? _optionalEventName(Object? value) {
    final event = _optionalSafeText(value, maxLength: 128);
    if (event != null && !RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(event)) {
      throw const PluginToolbarException(
        'error.invalid_params',
        'event name contains unsupported characters',
      );
    }
    return event;
  }
}
