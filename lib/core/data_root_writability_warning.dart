import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:otzaria/core/app_paths.dart';
import 'package:otzaria/core/directory_writability.dart';
import 'package:otzaria/core/ui_snack.dart' show navigatorKey;
import 'package:otzaria/widgets/dialogs/app_dialogs.dart';

/// אזהרה חד-פעמית בעלייה כששורש נתוני האפליקציה חסום לכתיבה.
///
/// המצב הזה שובר בשקט את כל מה שנשמר לדיסק (הערות, סימניות, אינדקס,
/// תוספים) — בלי האזהרה המשתמש רואה רק תקלות מפוזרות (issue #1031).
class DataRootWritabilityWarning {
  /// כבר הוצגה בסשן הזה — הבדיקה רצה בכל עלייה, אך מציקים רק פעם אחת.
  static bool _shown = false;

  @visibleForTesting
  static void debugReset() => _shown = false;

  /// מחזיר את שורש הנתונים אם אינו ניתן לכתיבה, אחרת `null`.
  /// במובייל מוחזר תמיד `null` — שם השורש מסופק ע"י מערכת ההפעלה.
  static Future<String?> check() async {
    if (Platform.isAndroid || Platform.isIOS) return null;
    final root = await AppPaths.getDataRootPath();
    return await isDirectoryWritable(root) ? null : root;
  }

  /// בודק ומציג דיאלוג הסבר אם נדרש. בטוח לקריאה גם כשאין עדיין Navigator.
  static Future<void> showIfNeeded() async {
    if (_shown) return;
    final String? root;
    try {
      root = await check();
    } catch (error) {
      if (kDebugMode) debugPrint('Data root writability check failed: $error');
      return;
    }
    if (root == null) return;

    final context = navigatorKey.currentContext;
    if (context == null || !context.mounted) return;
    _shown = true;
    await showSingleActionDialog(
      context: context,
      title: 'לתוכנה אין הרשאת כתיבה לתיקיית הנתונים',
      content: buildMessage(root),
    );
  }

  /// גוף ההודעה. במצב נייד הסיבה השכיחה היא תיקיית תוכנה שהועתקה למיקום
  /// מוגן; אחרת — תיקייה שנוצרה בהרשאות מנהל.
  @visibleForTesting
  static String buildMessage(String root) {
    final where = 'התיקייה: $root';
    if (AppPaths.isPortable) {
      return 'התוכנה רצה במצב נייד, ולכן שומרת את כל נתוניה לצידה — '
          'אך אין לה הרשאת כתיבה שם. הערות, סימניות, הגדרות ותוספים לא '
          'יישמרו.\n\n$where\n\n'
          'העבר את תיקיית התוכנה למיקום שניתן לכתוב אליו (למשל תיקיית '
          'המסמכים או כונן נייד), או התקן את אוצריא עם קובץ ההתקנה הרגיל.';
    }
    return 'אין לתוכנה הרשאת כתיבה לתיקיית הנתונים שלה. הערות, סימניות, '
        'הגדרות ותוספים לא יישמרו.\n\n$where\n\n'
        'ייתכן שהתיקייה נוצרה בהרשאות מנהל. התקנה מחדש עם קובץ ההתקנה '
        'הרגיל תיצור אותה מחדש בהרשאות תקינות.';
  }
}
