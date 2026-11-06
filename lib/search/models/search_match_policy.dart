import 'package:otzaria_search_engine/otzaria_search_engine.dart'
    show SearchScope, WordMatchMode;

/// מדיניות ההתאמה של החיפוש המתקדם שאינה נגזרת מהמרווח בין המילים: טווח
/// הקרבה (מרווח מילים / באותה פסקה / תחת אותה כותרת) וכמה ממילות השאילתה
/// חייבות להופיע.
///
/// נשמרת כיחידה אחת כדי שתעבור בשלמותה מהחיפוש הגלובלי אל טאב הקריאה
/// ומשם לחלונית החיפוש שבתוך הספר — אחרת חיפוש "באותה פסקה" היה מתורגם
/// בספר לחיפוש מרווח-מילים ומחזיר תוצאות אחרות מאלה שהמשתמש ראה.
class SearchMatchPolicy {
  const SearchMatchPolicy({
    this.proximityScope = SearchScope.wordDistance,
    this.wordMatchMode = WordMatchMode.all,
    this.wordMatchCount = 2,
  });

  /// ברירת המחדל: מרווח בין מילים וכל מילות השאילתה.
  static const SearchMatchPolicy standard = SearchMatchPolicy();

  final SearchScope proximityScope;
  final WordMatchMode wordMatchMode;

  /// מספר המילים הנדרש כש-[wordMatchMode] הוא [WordMatchMode.atLeast].
  final int wordMatchCount;

  /// האם המדיניות היא ברירת המחדל. [wordMatchCount] אינו נבדק כאן: הוא
  /// משמעותי רק במצב [WordMatchMode.atLeast], שאינו ברירת המחדל בכל מקרה.
  bool get isStandard =>
      proximityScope == SearchScope.wordDistance &&
      wordMatchMode == WordMatchMode.all;

  Map<String, dynamic> toJson() => {
    'proximityScope': proximityScope.name,
    'wordMatchMode': wordMatchMode.name,
    'wordMatchCount': wordMatchCount,
  };

  /// קריאה סובלנית: קלט חסר או ערך שאינו מוכר חוזר לברירת המחדל, כדי ששמירה
  /// ישנה תיטען בלי לאבד את הטאב.
  factory SearchMatchPolicy.fromJson(Object? json) {
    if (json is! Map) return standard;
    return SearchMatchPolicy(
      proximityScope: SearchScope.values.firstWhere(
        (scope) => scope.name == json['proximityScope'],
        orElse: () => SearchScope.wordDistance,
      ),
      wordMatchMode: WordMatchMode.values.firstWhere(
        (mode) => mode.name == json['wordMatchMode'],
        orElse: () => WordMatchMode.all,
      ),
      wordMatchCount: json['wordMatchCount'] is int
          ? json['wordMatchCount'] as int
          : 2,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SearchMatchPolicy &&
      other.proximityScope == proximityScope &&
      other.wordMatchMode == wordMatchMode &&
      other.wordMatchCount == wordMatchCount;

  @override
  int get hashCode =>
      Object.hash(proximityScope, wordMatchMode, wordMatchCount);

  @override
  String toString() =>
      'SearchMatchPolicy(proximityScope: $proximityScope, '
      'wordMatchMode: $wordMatchMode, wordMatchCount: $wordMatchCount)';
}
