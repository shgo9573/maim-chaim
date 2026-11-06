import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// יעדים ניטרליים ולא שרתי העדכון — אחרת תקלה ב-GitHub נראית כהיעדר אינטרנט.
/// שם מתחם ולא IP גולמי: ברשתות מסוננות חיבור ישיר ל-IP ולפורט 53 חסום.
const kNeutralProbeTargets = <(String, int)>[
  ('www.google.com', 443),
  ('1.1.1.1', 443),
  ('8.8.8.8', 53),
];

/// יעדי השאלה "האם יש רשת שימושית" (מצב הקישוריות לתוספים). `otzaria.org`
/// פתוח ברשתות מסוננות רבות שחוסמות את השאר, ודי בכך שיעד אחד עונה.
///
/// מוחרג בכוונה ממסלול העדכונים: שם "מחובר" גורר הודעת שגיאה, ולמשתמש שרק
/// אוצריא פתוחה אצלו בדיקת העדכון מול GitHub תיכשל ותרעיש בכל עלייה.
const kOtzariaProbeTargets = <(String, int)>[
  ('otzaria.org', 443),
  ...kNeutralProbeTargets,
];

const _kProbeTimeout = Duration(seconds: 3);

/// דריסת החיבור בטסטים — מונעת גישת רשת אמיתית.
@visibleForTesting
Future<bool> Function(String host, int port, Duration timeout)?
debugSocketConnect;

/// האם קיים חיבור אינטרנט בפועל.
///
/// חיבור TCP ליעד קבוע ולא DNS lookup: מטמון ה-DNS של מערכת ההפעלה מחזיר
/// תשובה מוצלחת גם בלי רשת, ואז "מנותק" נראה כמו "מחובר".
/// הפונקציה נקראת ממסלולי כשל, ולכן לעולם אינה זורקת בעצמה.
Future<bool> hasInternetConnection({
  Duration timeout = _kProbeTimeout,
  List<(String, int)> targets = kNeutralProbeTargets,
}) async {
  if (targets.isEmpty) return false;

  final connect = debugSocketConnect ?? _connect;
  final result = Completer<bool>();
  var failedTargets = 0;
  for (final (host, port) in targets) {
    unawaited(
      _isReachable(connect, host, port, timeout).then((reachable) {
        if (result.isCompleted) return;
        if (reachable) {
          result.complete(true);
          return;
        }
        failedTargets++;
        if (failedTargets == targets.length) result.complete(false);
      }),
    );
  }
  return result.future;
}

Future<bool> _isReachable(
  Future<bool> Function(String, int, Duration) connect,
  String host,
  int port,
  Duration timeout,
) async {
  try {
    // ה-timeout נאכף גם כאן: הקוראים ממתינים לתשובה בתוך מסלול כשל, ותקיעה
    // כאן משאירה אותם תקועים במצב "בודק".
    return await connect(host, port, timeout).timeout(timeout);
  } catch (_) {
    return false;
  }
}

Future<bool> _connect(String host, int port, Duration timeout) async {
  final socket = await Socket.connect(host, port, timeout: timeout);
  socket.destroy();
  return true;
}
