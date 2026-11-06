/// מצב התצוגה של מדור התוצאות החיצוני עבור טאב חיפוש אחד — מה שהיה פעם
/// כתוב בשורת הכותרת של המדור עצמו.
///
/// המדור מפרסם אותו דרך [SearchingTab.externalSearchStatus], ושורת מוני
/// התוצאות שבראש טאב החיפוש מציגה אותו לצד מוני המנוע המובנה. כך הספירות
/// של שני המקורות יושבות במקום אחד, והמדור עצמו מציג תוצאות בלבד.
class ExternalSearchStatus {
  /// שם המקור להצגה (resultsTitle של שורת התוסף), למשל 'היברובוקס'.
  final String sourceTitle;

  /// האם החיפוש עדיין רץ (כולל עדכונים חלקיים של הספק).
  final bool loading;

  /// הספירות המוצגות כרגע — של החיפוש כולו, או של הקטגוריות שנבחרו בעץ.
  final int books;
  final int hits;

  /// סך הספרים בחיפוש כולו כשהמדור מסונן לקטגוריה — אחרת null.
  final int? ofTotalBooks;

  /// הבקשה לספק נכשלה; הודעת השגיאה עצמה מוצגת בגוף המדור.
  final bool failed;

  const ExternalSearchStatus({
    required this.sourceTitle,
    required this.loading,
    required this.books,
    required this.hits,
    this.ofTotalBooks,
    this.failed = false,
  });

  /// האם עוד אין מה לספור — הבקשה הראשונה טרם חזרה.
  bool get isPending => loading && books == 0;

  @override
  bool operator ==(Object other) =>
      other is ExternalSearchStatus &&
      other.sourceTitle == sourceTitle &&
      other.loading == loading &&
      other.books == books &&
      other.hits == hits &&
      other.ofTotalBooks == ofTotalBooks &&
      other.failed == failed;

  @override
  int get hashCode =>
      Object.hash(sourceTitle, loading, books, hits, ofTotalBooks, failed);
}
