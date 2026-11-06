import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:otzaria/models/support_organization.dart';

/// טוען את נתוני פופאפ "אוצריא מתגייסת" מתוך assets.
///
/// הפרדת הנתונים מקוד התצוגה מאפשרת לעדכן מספרי טלפון, אפשרויות קו וכמות
/// נרשמים בלי לגעת בווידג'ט.
class SupportOrganizationsService {
  static const String assetPath = 'assets/support_organizations.json';

  /// יחס הרוחב/גובה המרבי של הלוגואים, בכל כיוון.
  static const double maxLogoAspectRatio = 2;

  static Future<SupportOrganizations>? _cached;

  static Future<SupportOrganizations> load() => _cached ??= _loadFromAsset();

  static Future<SupportOrganizations> _loadFromAsset() async {
    final raw = await rootBundle.loadString(assetPath);
    return SupportOrganizations.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
  }

  @visibleForTesting
  static void resetCache() => _cached = null;

  @visibleForTesting
  static void setCacheForTesting(Future<SupportOrganizations> value) =>
      _cached = value;
}
