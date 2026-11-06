import 'package:otzaria/core/windowing/app_window_id.dart';

/// החלון שקיבל פוקוס אחרון.
///
/// קישורי עומק והעברת טאב בין חלונות צריכים לדעת "לאיזה חלון לשלוח את זה",
/// וכשאין חלון פעיל התשובה היא "האחרון שהמשתמש נגע בו". היום אין מקור
/// לנתון הזה כלל.
///
/// `static` ולכן **פר-isolate**: תחת ריבוי חלונות כל חלון יקבל עותק משלו,
/// שידע רק על עצמו. זה מספיק כל עוד יש חלון אחד, והמעבר למקור אמת יחיד
/// (רישום חוצה-חלונות) הוא חלק מ-T-G1.1. שמירת המזהה כאן במקום שמירתו
/// לדיסק היא מכוונת — "אחרון שהיה פעיל" הוא נתון של ההפעלה הנוכחית.
abstract final class LastActiveWindow {
  static AppWindowId _id = AppWindowId.primary;

  static AppWindowId get id => _id;

  static void markActive(AppWindowId windowId) => _id = windowId;

  /// לבדיקות בלבד — מחזיר את המצב לברירת המחדל.
  static void resetForTest() => _id = AppWindowId.primary;
}
