import 'package:otzaria/utils/text/text_manipulation.dart' as utils;
import 'package:otzaria_search_engine/otzaria_search_engine.dart' as engine;

/// מקור-אמת יחיד לתבנית ההתאמה הליטרלית של החיפוש בתוך ספר.
///
/// גם מציאת התוצאות (`section_search_utils`), גם ההדגשה בסרגל התוצאות
/// (`SnippetBuilder.highlightLiteral`) וגם חישוב מיקום ההתאמה משתמשים באותה
/// תבנית מהמנוע (`generateLiteralHighlightPattern`), כך שלא ייתכן פער ביניהם.

final RegExp _whitespaceRun = RegExp(r'\s+');

/// תבנית ליטרלית: מקור המחרוזת (לשליחה ל-isolate worker) והרגקס המקומפל
/// (לשימוש ב-isolate הראשי).
class LiteralSearchPattern {
  const LiteralSearchPattern(this.source, this.regExp);

  /// מחרוזת התבנית כפי שבנה אותה המנוע — ניתנת לשליחה בין isolate-ים.
  final String source;

  /// הרגקס המקומפל מ-[source].
  final RegExp regExp;
}

/// מנרמל שאילתה זהה ל-[cleanLineForSearch] של התוכן: מסיר ניקוד וממיר
/// מפרידים (מקף עברי/פסק) לרווח, ואז מכווץ רצפי רווח. חובה שיהיה זהה
/// לניקוי התוכן — אחרת שאילתה עם מקף ("אשר־שמע") לא תתאים לתוכן הנקי
/// ("אשר שמע"), וגם שאילתה מנוקדת ("הֲרֵעֹתִי") לא תתאים לטקסט ללא ניקוד.
String normalizeLiteralQuery(String query) =>
    utils.removeVolwels(query).replaceAll(_whitespaceRun, ' ').trim();

/// עטיפת גבול-המילה שהמנוע מוסיף סביב הביטוי:
/// `(?<!גבול לפני)(?:ביטוי)(?!גבול אחרי)`. מחזירה את הביטוי בלבד, או `null`
/// אם המבנה אינו מזוהה — ואז החיפוש נשאר בהתאמת מילה שלמה במקום לסרוק
/// בתבנית חתוכה שגויה.
String? stripWordBoundaryWrapper(String source) {
  if (!source.startsWith('(?<!')) return null;

  // מחלקות התווים שבעטיפה אינן מכילות סוגריים, ולכן הסוגר המאזן את הפותח
  // נמצא בספירת עומק פשוטה.
  var depth = 0;
  var lookbehindEnd = -1;
  for (var i = 0; i < source.length; i++) {
    final ch = source[i];
    if (ch == '(') {
      depth++;
    } else if (ch == ')') {
      depth--;
      if (depth == 0) {
        lookbehindEnd = i;
        break;
      }
    }
  }
  if (lookbehindEnd < 0) return null;

  // הגבול הסוגר הוא ה-`(?!` האחרון: `(?!` נוסף מופיע בתוך תבנית תג ה-HTML
  // שבמפריד בין מילות השאילתה, והוא תמיד לפניו.
  final lookaheadStart = source.lastIndexOf('(?!');
  if (lookaheadStart <= lookbehindEnd) return null;

  final phrase = source.substring(lookbehindEnd + 1, lookaheadStart);
  return phrase.isEmpty ? null : phrase;
}

final Map<String, LiteralSearchPattern?> _cache = {};

/// בונה (עם קאש) תבנית ליטרלית לשאילתה, לאחר נרמול.
/// מחזיר `null` לשאילתה ריקה/רק-רווחים.
///
/// [wholeWord] `false` מסיר את גבולות המילה שהמנוע מוסיף, כך ש"שמים" מתאים
/// גם בתוך "השמים" — התנהגות Ctrl+F הרגילה. כל השאר (ניקוד, גרש/גרשיים,
/// המפריד בין מילים) זהה בשני המצבים.
///
/// חובה להיקרא ב-isolate הראשי בלבד — קורא למנוע (flutter_rust_bridge)
/// שקשור אליו. ב-isolate worker יש לקמפל דרך [compileLiteralPattern].
LiteralSearchPattern? buildLiteralPattern(
  String query, {
  bool wholeWord = true,
}) {
  final q = normalizeLiteralQuery(query);
  final cacheKey = '${wholeWord ? 'w' : 'p'}|$q';
  if (_cache.containsKey(cacheKey)) return _cache[cacheKey];

  // בונים לפני עדכון ה-cache: אם המנוע זורק, ה-cache נשאר עקבי ולא מקבל
  // רשומה חלקית לשאילתה החדשה.
  LiteralSearchPattern? result;
  if (q.isNotEmpty) {
    final source = engine.generateLiteralHighlightPattern(query: q);
    if (source != null) {
      final effective = wholeWord
          ? source
          : (stripWordBoundaryWrapper(source) ?? source);
      try {
        result = LiteralSearchPattern(
          effective,
          compileLiteralPattern(effective),
        );
      } on FormatException {
        // תבנית חתוכה שאינה מתקמפלת — נסיגה לתבנית המלאה של המנוע.
        result = LiteralSearchPattern(source, compileLiteralPattern(source));
      }
    }
  }

  if (_cache.length >= 16) _cache.clear();
  _cache[cacheKey] = result;
  return result;
}

/// מקמפל תבנית ליטרלית ממקור מחרוזת. בטוח ל-isolate worker — אינו קורא למנוע.
RegExp compileLiteralPattern(String source) =>
    RegExp(source, caseSensitive: false, unicode: true);
