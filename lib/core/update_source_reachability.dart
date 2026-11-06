import 'dart:async';

import 'package:http/http.dart' as http;

/// כותרת שכל תשובה מ-api.github.com נושאת — גם בשגיאה ובהגבלת קצב.
const _kGithubSignatureHeader = 'x-github-request-id';

const _kReachabilityTimeout = Duration(seconds: 5);

/// האם שרת העדכונים (api.github.com) נגיש בפועל.
///
/// נבדקת חתימת GitHub בכותרות ולא סטטוס 200: רשת מסוננת מחזירה דף חסימה
/// תקין למראה, ובלעדיה כשל הסינון מוצג למשתמש כשגיאה של אוצריא.
Future<bool> isUpdateSourceReachable({
  Duration timeout = _kReachabilityTimeout,
  http.Client? client,
}) async {
  final httpClient = client ?? http.Client();
  try {
    final response = await httpClient
        .get(Uri.parse('https://api.github.com/'))
        .timeout(timeout);
    return response.headers.containsKey(_kGithubSignatureHeader);
  } catch (_) {
    return false;
  } finally {
    if (client == null) httpClient.close();
  }
}
