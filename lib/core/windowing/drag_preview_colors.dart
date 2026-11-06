import 'package:flutter/material.dart';
import 'package:otzaria/theme/app_surfaces.dart';

/// צבעי תצוגת הגרירה הנייטיבית.
///
/// ## למה זה קיים
///
/// תצוגת הכרטיסיה שנגררת מחוץ לחלון מצוירת ב-GDI ב-`windows/runner`, כי
/// ה-`feedback` של `Draggable` נחתך בגבולות החלון. הצד הנייטיבי אינו יכול
/// לקרוא את `Theme.of(context)`, ולכן הצבעים היו **מקודדים קשיח** בגוונים
/// בהירים — ובערכה כהה זה נראה כמו מלבן לבן זוהר על מסך כהה, הפוך בדיוק
/// ממה שהמשתמש מצפה שייגרר.
///
/// ⚠️ הצבעים נלקחים מ-`AppSurfaces` ומ-`colorScheme`, ולא מ-literal-ים —
/// כלל 2.9 בפרויקט. כאן זו נקודת התרגום היחידה בין השכבות.
///
/// ⚠️ שלושה צבעים ולא חמישה. גרסה קודמת ציירה "חלון מוקטן" ולכן שלחה גם
/// רקע רצועה וגם רקע גוף; מאז מה שנגרר הוא צילום, והשרטוט שקודם לו הוא
/// כרטיסיה בלבד. הרקע של המוק מגיע מ-`ReadingTabStrip.stripColor`, שם הוא
/// באמת נצבע.
@immutable
class DragPreviewColors {
  const DragPreviewColors({
    required this.tab,
    required this.border,
    required this.text,
  });

  /// בונה מהערכה של [context] — בדיוק אותם משטחים שהכרטיסיה האמיתית
  /// משתמשת בהם, כדי שהרוח תיראה כמו מה שתחליף אותה.
  factory DragPreviewColors.of(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DragPreviewColors(
      // הכרטיסיה הפעילה — אותו משטח בדיוק כמו ב-`_tabBackgroundPainter`.
      tab: AppSurfaces.topBarBackground(context),
      border: scheme.outlineVariant,
      text: scheme.onSurface,
    );
  }

  final Color tab;
  final Color border;
  final Color text;

  /// ⚠️ `toARGB32` ולא `.value`: השני יצא deprecated, והצד הנייטיבי מצפה
  /// ל-int יחיד שממנו הוא חולץ R/G/B.
  Map<String, int> toArgb() => {
    'tab': tab.toARGB32(),
    'border': border.toARGB32(),
    'text': text.toARGB32(),
  };
}
