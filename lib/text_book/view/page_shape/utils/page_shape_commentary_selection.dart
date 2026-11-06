import 'dart:convert';

/// ערך מיוחד שמציין שבחלונית השמאלית יש להציג את כל המפרשים
/// שלא שובצו בחלוניות האחרות.
const String pageShapeRemainingCommentatorsValue =
    '__PAGE_SHAPE_REMAINING_COMMENTATORS__';

/// התווית המוצגת למשתמש עבור אפשרות שאר המפרשים.
const String pageShapeRemainingCommentatorsLabel = 'שאר המפרשים';

/// ערך מיוחד שמציין טור עם בחירת מפרשים מרובים מהחלונית.
const String pageShapeMultipleCommentatorsModeValue =
    '__PAGE_SHAPE_MULTIPLE_COMMENTATORS_MODE__';

const String _pageShapeMultiCommentatorsPrefix =
    '__PAGE_SHAPE_MULTI_COMMENTATORS__:';

/// מחזיר האם [value] מייצג את אפשרות "שאר המפרשים".
bool isPageShapeRemainingCommentatorsValue(String? value) {
  return value == pageShapeRemainingCommentatorsValue;
}

/// מחזיר האם [value] מייצג בחירה מרובה מפורשת של מפרשים.
bool isPageShapeMultiCommentatorsValue(String? value) {
  return value?.startsWith(_pageShapeMultiCommentatorsPrefix) ?? false;
}

/// מחזיר האם [value] מייצג מצב בחירה מרובה בטור הימני.
bool isPageShapeMultipleCommentatorsMode(String? value) {
  return value == pageShapeMultipleCommentatorsModeValue ||
      isPageShapeMultiCommentatorsValue(value);
}

/// מחזיר את שם המפרש בלי שם הספר שהוא מפרש.
/// "רמב"ן על ברכות" → "רמב"ן"; "יכין מקואות" עם [commentedBookTitle]
/// "משנה מקואות" → "יכין". יש משפחות מפרשים שאינן כוללות "על" בשם.
String? pageShapeCommentatorBaseName(
  String? fullName, {
  String? commentedBookTitle,
}) {
  if (fullName == null) return null;

  final onIndex = fullName.indexOf(' על ');
  if (onIndex > 0) {
    return fullName.substring(0, onIndex).trim();
  }

  if (commentedBookTitle == null || commentedBookTitle.isEmpty) {
    return fullName;
  }

  final nameWords = _splitWords(fullName);
  final bookWords = _splitWords(commentedBookTitle);

  // שם שכולו שם הספר אינו נושא חלק-מפרש שאפשר לבודד.
  if (nameWords.join(' ') == bookWords.join(' ')) return fullName;

  var shared = 0;
  while (shared < nameWords.length - 1 &&
      shared < bookWords.length &&
      nameWords[nameWords.length - 1 - shared] ==
          bookWords[bookWords.length - 1 - shared]) {
    shared++;
  }

  if (shared == 0) return fullName;
  return nameWords.take(nameWords.length - shared).join(' ');
}

List<String> _splitWords(String value) =>
    value.split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();

/// מחפש את שם המפרש המלא מתוך רשימת המפרשים הזמינים.
///
/// [commentedBookTitle] מאפשר להתאים גם בחירה ישנה שנשמרה עם שם ספר אחר צרוב
/// בתוכה ("יכין מקואות" בזמן קריאה במסכת נדה).
String? findMatchingPageShapeCommentator(
  String? selection,
  List<String> availableCommentators, {
  String? commentedBookTitle,
}) {
  if (selection == null) {
    return null;
  }

  for (final predicate in <bool Function(String)>[
    (commentator) => commentator == selection,
    (commentator) => commentator.startsWith(selection),
    (commentator) => commentator.contains(selection),
    (commentator) => selection.contains(commentator),
  ]) {
    for (final commentator in availableCommentators) {
      if (predicate(commentator)) {
        return commentator;
      }
    }
  }

  return _matchByCommentatorBase(
    selection,
    availableCommentators,
    commentedBookTitle,
  );
}

/// מתאים בחירה ישנה למפרש שחלק-המפרש שלו הוא מילות הפתיחה של הבחירה.
/// דורש גבול-מילה מלא, ובוחר את ההתאמה הארוכה ביותר, כדי ש"תוספות רבי עקיבא
/// איגר" לא ייקלט כ"תוספות יום טוב".
String? _matchByCommentatorBase(
  String selection,
  List<String> availableCommentators,
  String? commentedBookTitle,
) {
  if (commentedBookTitle == null || commentedBookTitle.isEmpty) {
    return null;
  }

  String? best;
  var bestLength = 0;

  for (final commentator in availableCommentators) {
    final base = pageShapeCommentatorBaseName(
      commentator,
      commentedBookTitle: commentedBookTitle,
    );
    if (base == null || base == commentator || base.length <= bestLength) {
      continue;
    }
    if (selection.startsWith('$base ')) {
      best = commentator;
      bestLength = base.length;
    }
  }

  return best;
}

List<String> _decodeMultiCommentators(String value) {
  if (!isPageShapeMultiCommentatorsValue(value)) {
    return [value];
  }

  final encoded = value.substring(_pageShapeMultiCommentatorsPrefix.length);
  final decoded = utf8.decode(base64Url.decode(encoded));
  final parsed = jsonDecode(decoded);
  if (parsed is! List) {
    return const [];
  }

  return parsed.whereType<String>().toList();
}

/// מקודד בחירת מפרשים לשמירה בהגדרות.
String? encodePageShapeCommentatorsSelection(
  Iterable<String> commentators, {
  bool forceMultipleMode = false,
}) {
  final normalized = <String>[];
  final seen = <String>{};

  for (final commentator in commentators) {
    final trimmed = commentator.trim();
    if (trimmed.isEmpty || !seen.add(trimmed)) {
      continue;
    }
    normalized.add(trimmed);
  }

  if (normalized.isEmpty) {
    return forceMultipleMode ? pageShapeMultipleCommentatorsModeValue : null;
  }

  if (normalized.length == 1 && !forceMultipleMode) {
    return normalized.single;
  }

  final payload = base64Url.encode(utf8.encode(jsonEncode(normalized)));
  return '$_pageShapeMultiCommentatorsPrefix$payload';
}

/// מחזיר את רשימת המפרשים המפורשת שנשמרה בבחירה.
List<String> decodePageShapeCommentatorsSelection(String? value) {
  if (value == null ||
      isPageShapeRemainingCommentatorsValue(value) ||
      value == pageShapeMultipleCommentatorsModeValue) {
    return const [];
  }

  return _decodeMultiCommentators(value);
}

/// ממיר בחירה שמורה לשמות המלאים מתוך רשימת המפרשים הזמינים.
String? resolvePageShapeCommentatorSelection({
  required String? selection,
  required List<String> availableCommentators,
  String? commentedBookTitle,
}) {
  if (selection == null ||
      isPageShapeRemainingCommentatorsValue(selection) ||
      selection == pageShapeMultipleCommentatorsModeValue) {
    return isPageShapeRemainingCommentatorsValue(selection) ? selection : null;
  }

  if (!isPageShapeMultiCommentatorsValue(selection)) {
    return findMatchingPageShapeCommentator(
          selection,
          availableCommentators,
          commentedBookTitle: commentedBookTitle,
        ) ??
        selection;
  }

  final resolved = <String>[];
  final seen = <String>{};
  for (final commentator in decodePageShapeCommentatorsSelection(selection)) {
    final match = findMatchingPageShapeCommentator(
      commentator,
      availableCommentators,
      commentedBookTitle: commentedBookTitle,
    );
    if (match != null && seen.add(match)) {
      resolved.add(match);
    }
  }

  if (resolved.isEmpty) {
    return null;
  }

  return encodePageShapeCommentatorsSelection(
    resolved,
    forceMultipleMode: true,
  );
}

/// מחזיר את המפרש הראשון להצגה בשדה שמקבל בחירה בודדת בלבד.
String? resolvePageShapeSingleCommentatorSelection({
  required String? selection,
  required List<String> availableCommentators,
  String? commentedBookTitle,
}) {
  if (selection == null ||
      isPageShapeRemainingCommentatorsValue(selection) ||
      selection == pageShapeMultipleCommentatorsModeValue) {
    return null;
  }

  if (!isPageShapeMultiCommentatorsValue(selection)) {
    return findMatchingPageShapeCommentator(
          selection,
          availableCommentators,
          commentedBookTitle: commentedBookTitle,
        ) ??
        selection;
  }

  for (final commentator in decodePageShapeCommentatorsSelection(selection)) {
    final match = findMatchingPageShapeCommentator(
      commentator,
      availableCommentators,
      commentedBookTitle: commentedBookTitle,
    );
    if (match != null) {
      return match;
    }
  }

  return null;
}

/// מחזיר את רשימת המפרשים שיש להציג בפועל עבור הבחירה השמורה.
List<String> resolvePageShapeSelectedCommentators({
  required String? selection,
  required List<String> availableCommentators,
  Iterable<String?> excludedCommentators = const [],
  String? commentedBookTitle,
}) {
  final normalizedSelection = resolvePageShapeCommentatorSelection(
    selection: selection,
    availableCommentators: availableCommentators,
    commentedBookTitle: commentedBookTitle,
  );

  if (normalizedSelection == null) {
    return const [];
  }

  if (normalizedSelection == pageShapeMultipleCommentatorsModeValue) {
    return const [];
  }

  if (isPageShapeRemainingCommentatorsValue(normalizedSelection)) {
    return resolveRemainingPageShapeCommentators(
      availableCommentators: availableCommentators,
      excludedCommentators: excludedCommentators,
    );
  }

  return decodePageShapeCommentatorsSelection(
    normalizedSelection,
  ).where(availableCommentators.contains).toList();
}

String? _resolvePageShapeSingleCommentator({
  required String? selection,
  required List<String> availableCommentators,
  String? commentedBookTitle,
}) {
  final resolved = resolvePageShapeCommentatorSelection(
    selection: selection,
    availableCommentators: availableCommentators,
    commentedBookTitle: commentedBookTitle,
  );

  if (resolved == null ||
      isPageShapeRemainingCommentatorsValue(resolved) ||
      isPageShapeMultipleCommentatorsMode(resolved) ||
      !availableCommentators.contains(resolved)) {
    return null;
  }

  return resolved;
}

/// מחזיר את כל המפרשים שמוצגים בפועל בחלוניות צורת הדף.
///
/// הפונקציה מיישרת את הלוגיקה של טעינת הקישורים עם הלוגיקה של המסך עצמו:
/// טורים מוסתרים אינם נכללים, ובטור הימני נלקחים בחשבון רק המפרשים שנבחרו
/// בפועל לאחר החרגת המפרשים ששובצו בחלוניות הייעודיות.
List<String> resolvePageShapeDisplayedCommentators({
  required String? leftSelection,
  required String? rightSelection,
  required String? bottomSelection,
  required String? bottomRightSelection,
  required List<String> availableCommentators,
  Map<String, bool> columnVisibility = const {
    'left': true,
    'right': true,
    'bottom': true,
  },
  String? commentedBookTitle,
}) {
  final resolvedLeft = _resolvePageShapeSingleCommentator(
    selection: leftSelection,
    availableCommentators: availableCommentators,
    commentedBookTitle: commentedBookTitle,
  );
  final resolvedBottom = _resolvePageShapeSingleCommentator(
    selection: bottomSelection,
    availableCommentators: availableCommentators,
    commentedBookTitle: commentedBookTitle,
  );
  final resolvedBottomRight = _resolvePageShapeSingleCommentator(
    selection: bottomRightSelection,
    availableCommentators: availableCommentators,
    commentedBookTitle: commentedBookTitle,
  );

  final excludedForRightPane = [
    resolvedLeft,
    resolvedBottom,
    resolvedBottomRight,
  ];

  final rightSelectableCommentators = availableCommentators
      .where((commentator) => !excludedForRightPane.contains(commentator))
      .toList();

  final rightCommentators = columnVisibility['right'] == false
      ? const <String>[]
      : resolvePageShapeSelectedCommentators(
          selection: rightSelection,
          availableCommentators: rightSelectableCommentators,
          excludedCommentators: excludedForRightPane,
          commentedBookTitle: commentedBookTitle,
        );

  final displayedCommentators = <String>[];
  final seenCommentators = <String>{};

  void addCommentator(String? commentator) {
    if (commentator == null || !seenCommentators.add(commentator)) {
      return;
    }
    displayedCommentators.add(commentator);
  }

  if (columnVisibility['left'] != false) {
    addCommentator(resolvedLeft);
  }

  if (columnVisibility['right'] != false) {
    for (final commentator in rightCommentators) {
      addCommentator(commentator);
    }
  }

  if (columnVisibility['bottom'] != false) {
    addCommentator(resolvedBottom);
  }

  if (columnVisibility['bottomRight'] != false) {
    addCommentator(resolvedBottomRight);
  }

  return displayedCommentators;
}

/// מחזיר את התווית המוצגת למשתמש עבור בחירת מפרש בצורת הדף.
String formatPageShapeCommentatorSelection(String? value) {
  if (isPageShapeRemainingCommentatorsValue(value)) {
    return pageShapeRemainingCommentatorsLabel;
  }

  if (value == pageShapeMultipleCommentatorsModeValue) {
    return 'מפרשים מרובים';
  }

  if (isPageShapeMultiCommentatorsValue(value)) {
    final commentators = decodePageShapeCommentatorsSelection(value);
    if (commentators.isEmpty) {
      return 'מפרשים מרובים';
    }
    if (commentators.length <= 2) {
      return commentators.join(', ');
    }
    return '${commentators.length} מפרשים';
  }

  return value ?? 'ללא מפרש';
}

/// מחשב את כל המפרשים שלא שובצו כבר בחלוניות האחרות.
List<String> resolveRemainingPageShapeCommentators({
  required List<String> availableCommentators,
  required Iterable<String?> excludedCommentators,
}) {
  final explicitlySelectedCommentators = excludedCommentators
      .whereType<String>()
      .where((commentator) {
        return !isPageShapeRemainingCommentatorsValue(commentator);
      })
      .toSet();

  return availableCommentators.where((commentator) {
    return !explicitlySelectedCommentators.contains(commentator);
  }).toList();
}
