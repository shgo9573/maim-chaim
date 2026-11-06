/// עמודי התאמה שסופקו על-ידי מנוע חיפוש חיצוני בעת פתיחת ספר — למשל תוצאות
/// `/inbook` של שירות היברובוקס שתוסף מעביר דרך `reader.openBook`.
///
/// העמודים מבוססי-1 (עמוד PDF ראשון = 1), ממוינים וללא כפילויות. הקורא
/// המובנה משתמש בהם לפאנל "עמודי התאמה" ולניווט מופע קודם/הבא, בלי שידע
/// דבר על מנוע החיפוש שסיפק אותם.
class ExternalBookMatches {
  final List<int> pages;
  final List<String> matchedTerms;

  /// השאילתה שהניבה את ההתאמות — מוצגת בפאנל וממולאת בשדה החיפוש-בתוך-ספר.
  final String query;

  ExternalBookMatches({
    required List<int> pages,
    List<String> matchedTerms = const [],
    this.query = '',
  }) : pages = List.unmodifiable(
         (pages.where((page) => page > 0).toSet().toList()..sort()),
       ),
       matchedTerms = List.unmodifiable(
         matchedTerms.where((term) => term.isNotEmpty),
       );

  bool get isEmpty => pages.isEmpty;

  Map<String, dynamic> toJson() => {
    'pages': pages,
    'matchedTerms': matchedTerms,
    'query': query,
  };

  static ExternalBookMatches? fromJson(Object? json) {
    if (json is! Map) return null;
    final pages = json['pages'];
    if (pages is! List) return null;
    return ExternalBookMatches(
      pages: pages.whereType<int>().toList(),
      matchedTerms: (json['matchedTerms'] as List? ?? const [])
          .whereType<String>()
          .toList(),
      query: json['query'] as String? ?? '',
    );
  }
}
