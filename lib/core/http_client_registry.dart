import 'dart:async';

import 'package:flutter/foundation.dart';

/// רישום מרכזי של HTTP clients מתמשכים (package:http + dart:io HttpClient).
///
/// **למה צריך את זה ב-Windows admin install + ריצה לא-elevated**:
/// כל socket פתוח שה-process מחזיק אוחז ב-handle של ה-kernel + state של TLS.
/// בעת סגירת ה-process, ה-kernel חייב לסיים את ה-I/O הפעיל לפני שהוא משחרר
/// את ה-handles ומסיים את ה-process. בשילוב admin install + Medium IL,
/// שלב הסיום הזה לוקח מספר שניות (Defender + מדיניות אמון נמוך), והתוצאה
/// היא חלון "Not Responding" עד שמשתחרר.
///
/// הפתרון: לסגור את כל ה-clients **לפני** שמסלול הסגירה מתחיל. `close()`
/// של `package:http`/`HttpClient` מחזיר מיד; הקרנל ממשיך את הניקוי ברקע,
/// וכשמגיע `exit(0)` הוא כבר השלים את רוב העבודה.
///
/// שימוש (אצל ה-owner של ה-client):
/// ```dart
/// final _client = http.Client();
/// HttpClientRegistry.register(_client.close);
/// // ... dispose:
/// HttpClientRegistry.unregister(_client.close);
/// _client.close();
/// ```
class HttpClientRegistry {
  HttpClientRegistry._();

  static final List<FutureOr<void> Function()> _closers = [];

  /// רישום callback סגירה. הקריאה אליו מתבצעת פעם אחת ב-[closeAll].
  /// אם ה-client מנוקה לפני סגירת התוכנה, יש לקרוא ל-[unregister].
  static void register(FutureOr<void> Function() closer) {
    _closers.add(closer);
  }

  /// הסרת callback שנרשם קודם. אם ה-closer לא נמצא — no-op.
  static void unregister(FutureOr<void> Function() closer) {
    _closers.remove(closer);
  }

  @visibleForTesting
  static int get registeredCount => _closers.length;

  @visibleForTesting
  static void clearForTest() => _closers.clear();

  /// סוגר את כל ה-clients הרשומים. שגיאות בודדות נבלעות (best-effort).
  /// כל הניקיונות נשלחים במקביל; ה-await מסתיים כש**כולם** חזרו או כש-
  /// [timeout] תפוג — מה שמגיע קודם. אסור שיציאה תיחסם על client אחד תקוע.
  static Future<void> closeAll({
    Duration timeout = const Duration(milliseconds: 800),
  }) async {
    if (_closers.isEmpty) return;
    final futures = <Future<void>>[
      for (final closer in List.of(_closers)) _safeCallClose(closer),
    ];
    try {
      await Future.wait(futures).timeout(timeout);
    } catch (_) {
      // best effort — לעולם לא לחסום את היציאה על ניקוי HTTP.
    }
  }

  static Future<void> _safeCallClose(FutureOr<void> Function() closer) async {
    try {
      final result = closer();
      if (result is Future<void>) {
        await result;
      }
    } catch (_) {
      // best effort.
    }
  }
}
