import 'package:flutter/foundation.dart';
import 'package:otzaria/plugins/plugin_constants.dart';

/// מופעי תוספים שדיווחו על שינויים שלא נשמרו (`ui.setUnsavedChanges`).
///
/// סגירת כרטיסיה של מופע רשום כאן עוברת קודם דרך דיאלוג אישור.
class PluginUnsavedChangesRegistry extends ChangeNotifier {
  static final PluginUnsavedChangesRegistry instance =
      PluginUnsavedChangesRegistry._();
  PluginUnsavedChangesRegistry._();

  @visibleForTesting
  PluginUnsavedChangesRegistry.forTesting();

  /// אורך מרבי להודעה שהתוסף מצרף — היא מוצגת בדיאלוג, לא יומן.
  static const int maxMessageLength = 200;

  final Map<PluginInstanceKey, String?> _entries = {};

  bool hasUnsavedChanges(PluginInstanceKey key) => _entries.containsKey(key);

  /// ההודעה שהתוסף צירף, או `null` אם לא צירף (או שאין שינויים).
  String? messageFor(PluginInstanceKey key) => _entries[key];

  /// מסמן או מנקה את המופע; הודעה ארוכה נחתכת ל-[maxMessageLength].
  void set(PluginInstanceKey key, {required bool hasChanges, String? message}) {
    if (!hasChanges) {
      removeInstance(key);
      return;
    }
    final trimmed = message?.trim();
    final normalized = trimmed == null || trimmed.isEmpty
        ? null
        : trimmed.length > maxMessageLength
        ? trimmed.substring(0, maxMessageLength)
        : trimmed;
    if (_entries.containsKey(key) && _entries[key] == normalized) return;
    _entries[key] = normalized;
    notifyListeners();
  }

  void removeInstance(PluginInstanceKey key) {
    // הערך עצמו יכול להיות null, ולכן הקיום נבדק לפני ההסרה.
    if (!_entries.containsKey(key)) return;
    _entries.remove(key);
    notifyListeners();
  }
}
