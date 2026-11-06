import 'dart:async';

/// תור המציג פריטים אחד-אחד: פריט חדש ממתין עד שהצגת הקודם מסתיימת.
///
/// משמש לדיאלוגים שנפתחים מאירועים מקבילים (למשל כמה קישורי עומק של התקנת
/// תוספים יחד), כדי שלא ייערמו זה על גבי זה.
class SequentialDialogQueue<T> {
  SequentialDialogQueue(this._show);

  /// מציג פריט אחד; ה-Future נשלם כשההצגה הסתיימה (הדיאלוג נסגר).
  final Future<void> Function(T item) _show;

  final List<T> _pending = [];
  bool _isShowing = false;

  /// מוסיף פריט לתור; מוצג מיד אם אין פריט מוצג כעת.
  void enqueue(T item) {
    _pending.add(item);
    _showNext();
  }

  void _showNext() {
    if (_isShowing || _pending.isEmpty) return;
    final item = _pending.removeAt(0);
    _isShowing = true;
    unawaited(() async {
      try {
        await _show(item);
      } finally {
        _isShowing = false;
        _showNext();
      }
    }());
  }

  /// מנקה פריטים שטרם הוצגו (למשל כשהמסך המארח מתפרק).
  void clear() => _pending.clear();
}
