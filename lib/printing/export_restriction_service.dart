import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// הספרים שאסורים לייצוא לפורמט קל לעריכה (Word/טקסט).
///
/// ההגבלה אינה על הייצוא עצמו אלא על מתכונת שניתן לערוך בקלות — הדפסה
/// וייצוא ל-PDF נשארים זמינים בכל ספר.
class ExportRestrictionService {
  static const String assetPath = 'assets/export_restricted_books.json';

  static Set<String> _titles = const {};
  static Future<void>? _loading;

  /// טוען את הרשימה פעם אחת. בטוח לקריאה חוזרת.
  static Future<void> ensureLoaded() => _loading ??= _load();

  static Future<void> _load() async {
    try {
      final raw = await rootBundle.loadString(assetPath);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final books = json['books'] as List<dynamic>? ?? const [];
      _titles = books
          .whereType<String>()
          .map(_normalize)
          .where((title) => title.isNotEmpty)
          .toSet();
    } catch (e) {
      // רשימה ריקה = אין הגבלה. חסימה שגויה של ייצוא גרועה מכשל טעינה שקט.
      _titles = const {};
      if (kDebugMode) debugPrint('Failed to load $assetPath: $e');
    }
  }

  /// האם הספר [title] מוגבל לייצוא לפורמט קל לעריכה.
  static bool isRestricted(String? title) =>
      title != null && _titles.contains(_normalize(title));

  /// האם אחד מהספרים ב-[titles] מוגבל.
  static bool anyRestricted(Iterable<String> titles) =>
      titles.any(isRestricted);

  /// האם יש לחסום ייצוא לפורמט קל לעריכה עבור מסמך הדפסה מורכב — הספר עצמו
  /// מוגבל, או שמפרש מוגבל נכלל בפלט.
  static bool blocksEditableExport({
    required String? documentTitle,
    required bool commentariesIncluded,
    required Iterable<String> commentators,
  }) =>
      isRestricted(documentTitle) ||
      (commentariesIncluded && anyRestricted(commentators));

  static String _normalize(String title) =>
      title.trim().replaceAll(RegExp(r'\s+'), ' ');

  @visibleForTesting
  static void setRestrictedTitlesForTesting(Iterable<String> titles) {
    _titles = titles.map(_normalize).toSet();
    _loading = Future.value();
  }

  @visibleForTesting
  static void resetForTesting() {
    _titles = const {};
    _loading = null;
  }
}
