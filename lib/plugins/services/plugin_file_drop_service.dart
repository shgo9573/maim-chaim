import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview_windows/flutter_inappwebview_windows.dart';

/// גרירת קבצים מהמערכת מעל חלון האפליקציה.
@immutable
class PluginFileDrag {
  /// נתיבי הקבצים הנגררים. ריק בגרירת קבצים וירטואליים (למשל מתוך ZIP).
  final List<String> paths;

  /// מיקום הסמן בפיקסלים פיזיים של אזור הלקוח.
  final Offset physicalPosition;

  const PluginFileDrag({required this.paths, required this.physicalPosition});
}

/// מרכז את גרירות הקבצים של החלון ומחלק אותן לאזורי הקליטה.
///
/// ל-Windows יש `IDropTarget` יחיד לכל חלון, והוא בבעלות
/// flutter_inappwebview — לכן הגרירה מגיעה מ-[WindowsFileDropManager].
/// למנהל הזה יש מאזין יחיד, ולכן השירות הוא המנוי היחיד שמפצל לאזורים.
class PluginFileDropService {
  PluginFileDropService({WindowsFileDropManager? manager})
    : _manager = manager ?? WindowsFileDropManager.instance;

  static PluginFileDropService instance = PluginFileDropService();

  final WindowsFileDropManager _manager;

  /// הגרירה הפעילה, או `null` כשאין גרירת קבצים מעל החלון.
  final ValueNotifier<PluginFileDrag?> drag = ValueNotifier(null);

  final StreamController<PluginFileDrag> _drops =
      StreamController<PluginFileDrag>.broadcast();

  /// שחרור קבצים מעל החלון. אזורי הקליטה מסננים לפי המיקום.
  Stream<PluginFileDrag> get drops => _drops.stream;

  /// הצד ה-native קיים ב-Windows בלבד.
  static bool get isSupported => !kIsWeb && Platform.isWindows;

  int _zones = 0;
  final Set<Object> _accepting = {};

  /// מפעיל את קליטת הגרירה כל עוד קיים אזור קליטה מותקן. בלי אזור פעיל
  /// החלון ממשיך לדחות קבצים כמקודם.
  Future<void> acquire() async {
    _zones++;
    if (_zones != 1 || !isSupported) return;
    try {
      await _manager.start(
        onDrag: _handleDrag,
        onDrop: _handleDrop,
        onLeave: _handleLeave,
      );
    } on MissingPluginException {
      // בנייה ללא הצד ה-native של הפורק — גרירה פשוט לא תעבוד.
    }
  }

  Future<void> release() async {
    if (_zones == 0) return;
    _zones--;
    if (_zones != 0) return;
    drag.value = null;
    if (!isSupported) return;
    try {
      await _manager.stop();
    } on MissingPluginException {
      // כנ"ל.
    }
  }

  /// מדווח אם [zone] מוכן לקבל את הגרירה הנוכחית. הצד ה-native משתמש בזה
  /// כדי להציג סמן גרירה רק מעל אזור שבאמת יקלוט את הקובץ.
  void setZoneAccepting(Object zone, bool accepting) {
    if (accepting) {
      _accepting.add(zone);
    } else {
      _accepting.remove(zone);
    }
  }

  @visibleForTesting
  bool handleDrag(WindowsFileDropEvent event) => _handleDrag(event);

  bool _handleDrag(WindowsFileDropEvent event) {
    // אירוע ה-over אינו נושא נתיבים — שומרים את אלה שהתקבלו ב-enter.
    final paths = event.paths.isNotEmpty
        ? event.paths
        : (drag.value?.paths ?? const <String>[]);
    // עדכון ה-notifier מריץ את מאזיני האזורים מיידית, ולכן התשובה שמוחזרת
    // כאן כבר משקפת את מצבם.
    drag.value = PluginFileDrag(
      paths: paths,
      physicalPosition: Offset(event.x, event.y),
    );
    return _accepting.isNotEmpty;
  }

  @visibleForTesting
  Future<void> handleDrop(WindowsFileDropEvent event) => _handleDrop(event);

  Future<void> _handleDrop(WindowsFileDropEvent event) async {
    drag.value = null;
    _drops.add(
      PluginFileDrag(
        paths: event.paths,
        physicalPosition: Offset(event.x, event.y),
      ),
    );
  }

  @visibleForTesting
  void handleLeave() => _handleLeave();

  void _handleLeave() => drag.value = null;
}
