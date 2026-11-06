import 'dart:async';

/// מריץ משימות אסינכרוניות **בסדרה** (אחת בכל רגע נתון), ומדלג על משימה
/// שהתיישנה בזמן שהמתינה בתור.
///
/// מיועד לתצוגות מקדימות כבדות (כמו ב[מסך ההדפסה]) שבהן שינויי פרמטרים
/// עוקבים מפעילים render מחדש. בלי הסדרה, מספר renders כבדים רצים במקביל
/// ומציפים את המעבד; בלי דילוג על מיושנים, גם render שכבר אינו רלוונטי
/// מבצע את כל העבודה היקרה עד הסוף.
///
/// השימוש: כל קריאה ל-[run] מקבלת [isStale] שמוערך **לאחר** ההמתנה בתור.
/// אם הוא מחזיר `true` ויש תוצאה קודמת ([lastResult]), המשימה מדולגת
/// והתוצאה הקודמת מוחזרת. אחרת המשימה רצה ותוצאתה נשמרת ב-[lastResult].
class SerialLatestRunner<T extends Object> {
  Future<void> _lock = Future.value();

  /// התוצאה התקפה האחרונה שהושלמה, או `null` אם טרם הושלמה אף משימה.
  T? lastResult;

  /// מריץ [task] בסדרה אחרי שכל המשימות הקודמות בתור הסתיימו.
  ///
  /// [isStale] - נבדק לאחר ההמתנה בתור; אם הוא `true` ו-[lastResult] קיים,
  /// [task] לא תבוצע כלל והתוצאה הקודמת תוחזר.
  Future<T> run({
    required bool Function() isStale,
    required Future<T> Function() task,
  }) async {
    final completer = Completer<void>();
    final previousLock = _lock;
    _lock = completer.future;
    try {
      await previousLock;
      final previous = lastResult;
      if (isStale() && previous != null) {
        return previous;
      }
      final result = await task();
      lastResult = result;
      return result;
    } finally {
      completer.complete();
    }
  }
}
