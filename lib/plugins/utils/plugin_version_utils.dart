class PluginVersionUtils {
  /// מפענח את ליבת הגרסה להשוואה: מתעלם מ-build metadata ומ-prerelease suffix.
  static List<int> parseCoreSegments(String version) {
    final sanitized = version.split('+').first.split('-').first.trim();
    if (sanitized.isEmpty) {
      throw PluginVersionFormatException(version);
    }

    final result = <int>[];
    for (final segment in sanitized.split('.')) {
      final parsed = int.tryParse(segment);
      if (parsed == null) {
        throw PluginVersionFormatException(version);
      }
      result.add(parsed);
    }

    return result;
  }

  /// משווה שתי גרסאות לפי שלושת רכיבי הליבה major.minor.patch.
  static int compareCoreVersions(String first, String second) {
    final parts1 = parseCoreSegments(first);
    final parts2 = parseCoreSegments(second);
    for (var i = 0; i < 3; i++) {
      final p1 = i < parts1.length ? parts1[i] : 0;
      final p2 = i < parts2.length ? parts2[i] : 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }
}

class PluginVersionFormatException implements Exception {
  final String version;

  PluginVersionFormatException(this.version);

  @override
  String toString() => 'פורמט גרסה לא חוקי: $version';
}
