import 'package:flutter/foundation.dart';

/// זמינות כלי הפיתוח לתוספים (טעינה מתיקייה / localhost / רענון).
///
/// זמינים תמיד ב-debug, ובגרסה מקומפלת רק עם דגל ההפעלה `--dev-plugins`.
class PluginDevToolsMode {
  PluginDevToolsMode._();

  static bool _launchFlag = false;

  /// קורא את דגל ההפעלה מארגומנטי שורת הפקודה. נקרא פעם אחת מ-main.
  static void initFromArgs(List<String> args) {
    _launchFlag = args.any(isDevPluginsFlag);
  }

  static bool get enabled => kDebugMode || _launchFlag;

  @visibleForTesting
  static bool get launchFlagForTesting => _launchFlag;

  @visibleForTesting
  static void resetForTesting() => _launchFlag = false;
}

/// האם הארגומנט הוא דגל `--dev-plugins` (נתמכים גם `/dev-plugins` בסגנון
/// Windows, `dev-plugins` חשוף, וקו תחתון במקום מקף).
bool isDevPluginsFlag(String arg) {
  final normalized = arg
      .trim()
      .toLowerCase()
      .replaceFirst(RegExp(r'^(--|/)'), '')
      .replaceAll('_', '-');
  return normalized == 'dev-plugins';
}
