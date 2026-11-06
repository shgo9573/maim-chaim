import 'package:flutter/foundation.dart';
import 'package:otzaria/models/links.dart';

/// הכרעה האם כותרת המקור של מקטע בלשונית הפרשנים מוסיפה מידע (issue #896).
/// הכותרת מוסתרת רק כשהיא חוזרת על מה שהמשתמש כבר יודע: כל מקטעי הקבוצה
/// באים מאותה שורת מקור, ויעד המקטע נמצא במקום שהוא קורא כעת.

/// האם כל קישורי הקבוצה שייכים לאותה שורת מקור. כשלא — הכותרות הן המבדיל
/// היחיד בין המקטעים (בחירה מרובה, "כל הפרק") וחובה להציגן.
bool groupSharesSingleSource(List<Link> links) {
  if (links.isEmpty) return false;
  final first = links.first.index1;
  return links.every((link) => link.index1 == first);
}

/// האם כותרת המקטע [displayTitle] מצביעה בדיוק על המקום הנקרא כעת:
/// שם ספר היעד [targetBookTitle] ואחריו כתובת זהה לכתובת שורת המקור
/// [sourceRef] בספר [sourceBookTitle]. כל אי-ודאות מוכרעת כ"לא תואם"
/// (הכותרת תוצג) — הסתרה שגויה מאבדת מידע, הצגה מיותרת לא.
bool commentaryTitleMatchesReadingLocation({
  required String displayTitle,
  required String targetBookTitle,
  required String sourceBookTitle,
  required String sourceRef,
}) {
  final titleTokens = referenceTokens(displayTitle);
  final targetTitleTokens = referenceTokens(targetBookTitle);
  if (targetTitleTokens.isEmpty ||
      !_isTokenPrefix(targetTitleTokens, titleTokens)) {
    return false;
  }
  final targetLocation = titleTokens.sublist(targetTitleTokens.length);

  var sourceTokens = referenceTokens(sourceRef);
  final sourceTitleTokens = referenceTokens(sourceBookTitle);
  if (_isTokenPrefix(sourceTitleTokens, sourceTokens)) {
    sourceTokens = sourceTokens.sublist(sourceTitleTokens.length);
  }

  return targetLocation.isNotEmpty && listEquals(targetLocation, sourceTokens);
}

/// מפרק כתובת למילות השוואה: בלי ניקוד/טעמים, גרשיים ופיסוק מפריד.
/// נשמרות גם מילים בנות אות אחת — כתובות דף ("ג ב") בנויות מהן.
@visibleForTesting
List<String> referenceTokens(String reference) {
  return reference
      .replaceAll(RegExp(r'\p{Mn}', unicode: true), '')
      .replaceAll(RegExp('''['"״׳’”“`]'''), '')
      .replaceAll(RegExp(r'[-–־,.():]'), ' ')
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
}

bool _isTokenPrefix(List<String> prefix, List<String> tokens) {
  if (prefix.isEmpty || prefix.length > tokens.length) return false;
  for (var i = 0; i < prefix.length; i++) {
    if (prefix[i] != tokens[i]) return false;
  }
  return true;
}
