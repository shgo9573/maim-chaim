/// ארגון המוצג בפופאפ "אוצריא מתגייסת" — קו חירום או ארגון סיוע.
class SupportOrganization {
  final String name;
  final String phone;
  final String logo;

  /// מספרי טלפון נוספים המוצגים בהרחבת הכרטיס
  final List<String> phones;

  /// כמות הנרשמים לקו, אם הארגון מפרסם אותה
  final int? registeredCount;

  /// אפשרויות הקו. `**טקסט**` מסמן הדגשה. בקובץ הנתונים זהו מערך שורות,
  /// כדי שעדכון שורה בודדת ייצור דיף של שורה אחת.
  final String details;

  const SupportOrganization({
    required this.name,
    required this.phone,
    required this.logo,
    this.phones = const [],
    this.registeredCount,
    this.details = '',
  });

  factory SupportOrganization.fromJson(Map<String, dynamic> json) {
    final count = json['registeredCount'] as int?;
    final details = _stringList(json['details']).join('\n');
    return SupportOrganization(
      name: json['name'] as String,
      phone: json['phone'] as String,
      logo: json['logo'] as String,
      phones: _stringList(json['phones']),
      registeredCount: count,
      details: count == null
          ? details
          : details.replaceAll('{registered}', _withThousandsSeparator(count)),
    );
  }

  static List<String> _stringList(Object? value) =>
      (value as List<dynamic>? ?? const [])
          .map((line) => line as String)
          .toList(growable: false);

  /// 102631 -> 102,631
  static String _withThousandsSeparator(int value) => value
      .toString()
      .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
}

/// תוכן הפופאפ: קווי החירום וארגוני הסיוע, כפי שנטענו מקובץ הנתונים.
class SupportOrganizations {
  final List<SupportOrganization> emergencyLines;
  final List<SupportOrganization> supportOrgs;

  const SupportOrganizations({
    required this.emergencyLines,
    required this.supportOrgs,
  });

  factory SupportOrganizations.fromJson(Map<String, dynamic> json) =>
      SupportOrganizations(
        emergencyLines: _orgList(json['emergencyLines']),
        supportOrgs: _orgList(json['supportOrgs']),
      );

  static List<SupportOrganization> _orgList(Object? value) =>
      (value as List<dynamic>? ?? const [])
          .map(
            (org) => SupportOrganization.fromJson(org as Map<String, dynamic>),
          )
          .toList(growable: false);
}
