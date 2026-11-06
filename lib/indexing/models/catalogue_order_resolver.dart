/// מוסר את הסדר הקטלוגי של ספר — המספר שנצרב לחצי העליון של מזהה המסמך
/// באינדקס (`IndexingRepository.buildCatalogueDocumentId`).
///
/// כל ספר שנשלח לאינדוקס חייב להופיע במפת הספרייה. סדר חלופי אינו בטוח:
/// טווח 32 סיביות אינו יכול למפות מפתחות שרירותיים בלי התנגשויות.
class CatalogueOrderResolver {
  CatalogueOrderResolver(this._orderByKey);

  /// הסדר הגבוה ביותר שניתן לצרוב: `buildCatalogueDocumentId` מוסיף 1 לפני
  /// ההזזה ב-32 סיביות, וערך גבוה יותר חורג מ-u64 ונחתך בגשר ל-Rust.
  static const int maxCatalogueOrder = 0xFFFFFFFE;

  final Map<String, int> _orderByKey;

  /// מחזיר את הסדר של [key]. זורק אם המפתח אינו בקטלוג או אינו נכנס ב-u64.
  int orderFor(String key) {
    final order = _orderByKey[key];
    if (order == null) {
      throw StateError('ספר שנשלח לאינדוקס אינו נמצא במפת הקטלוג: $key');
    }
    if (order < 0 || order > maxCatalogueOrder) {
      throw RangeError.range(order, 0, maxCatalogueOrder, 'catalogueOrder');
    }
    return order;
  }
}
