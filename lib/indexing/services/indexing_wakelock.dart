import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// שומר את המכשיר ער בזמן אינדוקס במובייל: כיבוי המסך מקפיא את התהליך
/// (Doze) והאינדוקס של ספרייה גדולה לא היה מסתיים לעולם.
class IndexingWakelock {
  IndexingWakelock({
    Future<void> Function(bool enabled)? setEnabled,
    bool? isMobile,
  }) : _setEnabled = setEnabled ?? _setWakelock,
       _isMobile =
           isMobile ?? (!kIsWeb && (Platform.isAndroid || Platform.isIOS));

  static final IndexingWakelock instance = IndexingWakelock();

  final Future<void> Function(bool enabled) _setEnabled;
  final bool _isMobile;
  ValueListenable<bool>? _attached;

  static Future<void> _setWakelock(bool enabled) =>
      WakelockPlus.toggle(enable: enabled);

  /// נרשם על דגל האינדוקס; קריאה חוזרת עם אותו listenable אינה עושה דבר.
  void attach(ValueListenable<bool> isIndexing) {
    if (!_isMobile || identical(_attached, isIndexing)) return;
    _attached?.removeListener(_onChanged);
    _attached = isIndexing;
    isIndexing.addListener(_onChanged);
    if (isIndexing.value) _onChanged();
  }

  void _onChanged() {
    final enable = _attached?.value ?? false;
    _setEnabled(enable).catchError((Object e) {
      debugPrint('⚠️ שינוי מצב ה-wakelock של האינדוקס נכשל: $e');
    });
  }
}
