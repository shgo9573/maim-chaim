/// רשומה מוכנה לפתיחה של מפרש בודד עבור [DbReferenceResult] מסוים.
///
/// נוצרת מראש בעת טעינת רשימת המפרשים, כך שהקליק על מפרש בתפריט יוכל לפתוח
/// אותו ישירות ללא שאילתות DB.
class DbCommentatorEntry {
  /// שם ספר המפרש (כפי שמופיע ב-`book.title`).
  final String title;

  /// מזהה ספר המפרש ב-DB (`book.id`).
  ///
  /// נדרש לפתרון חד-משמעי של ה-`Book` כשיש שני ספרים בעלי אותה כותרת
  /// בעץ הספרייה (פתרון לפי title בלבד היה פותח את הראשון שנמצא בעץ,
  /// גם אם ה-link המקושר התכוון לאחר). `null` רק כשה-row של ה-DB לא
  /// כלל `targetBookId` (תאימות לאחור).
  final int? bookId;

  /// ה-`lineIndex` בספר המפרש שאליו יש לנווט.
  ///
  /// `MIN(targetLineIndex)` על פני טווח הקטע (כותרת עד הכותרת הבאה, או כל
  /// הספר אם אין כותרות פנימיות). `null` רק כהגנה — row חריג ללא
  /// `targetLineIndex`; הצרכן יפתח אז בתחילת ספר המפרש.
  final int? targetSegment;

  const DbCommentatorEntry({
    required this.title,
    required this.bookId,
    required this.targetSegment,
  });

  @override
  bool operator ==(Object other) =>
      other is DbCommentatorEntry &&
      other.title == title &&
      other.bookId == bookId &&
      other.targetSegment == targetSegment;

  @override
  int get hashCode => Object.hash(title, bookId, targetSegment);

  @override
  String toString() => 'DbCommentatorEntry($title #$bookId @ $targetSegment)';
}
