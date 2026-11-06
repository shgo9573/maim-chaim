import 'package:flutter/foundation.dart';
import 'package:otzaria/tabs/models/tab.dart';
import 'package:otzaria/utils/file/hive_utils.dart';

/// טאב המציג בדיוק שתי חלוניות זו לצד זו, עם מפריד ניתן לגרירה.
class CombinedTab extends OpenedTab {
  /// החלונית הראשונה בסדר התצוגה — הימנית ב-RTL.
  final OpenedTab rightTab;

  /// החלונית השנייה בסדר התצוגה — השמאלית ב-RTL.
  final OpenedTab leftTab;

  /// חלקה של [rightTab] מהמקום הפנוי (0.0-1.0).
  /// משתנה במקום כדי לשמור על מצב החלוניות בזמן גרירת המפריד.
  double splitRatio;

  CombinedTab({
    required this.rightTab,
    required this.leftTab,
    this.splitRatio = 0.5,
    super.isPinned,
  }) : super('') {
    if (_isSplit(rightTab) || _isSplit(leftTab)) {
      throw ArgumentError(
        'חלוניות של CombinedTab חייבות להיות טאבים שאינם מפוצלים',
      );
    }
  }

  @override
  String get title => 'משולב: ${rightTab.title} | ${leftTab.title}';

  /// הכותרת נגזרת מהחלוניות ואינה ניתנת לשינוי.
  @override
  set title(String value) =>
      throw UnsupportedError('כותרת טאב מפוצל נגזרת מהחלוניות שבו');

  /// שתי החלוניות בסדר התצוגה.
  List<OpenedTab> get panes => [rightTab, leftTab];

  /// האחות של [pane], או `null` אם [pane] אינה אחת משתי החלוניות.
  OpenedTab? sibling(OpenedTab pane) {
    if (identical(pane, rightTab)) return leftTab;
    if (identical(pane, leftTab)) return rightTab;
    return null;
  }

  /// יוצרת עותק עם חלוניות מוחלפות, תוך שמירת [splitRatio] וההצמדה.
  CombinedTab copyWith({
    OpenedTab? rightTab,
    OpenedTab? leftTab,
    double? splitRatio,
    bool? isPinned,
  }) {
    return CombinedTab(
      rightTab: rightTab ?? this.rightTab,
      leftTab: leftTab ?? this.leftTab,
      splitRatio: splitRatio ?? this.splitRatio,
      isPinned: isPinned ?? this.isPinned,
    );
  }

  /// שתי החלוניות משוכפלות אף הן — בלי זה שני הטאבים היו חולקים את אותם
  /// אובייקטי חלונית, ו-[dispose] של האחד היה סוגר את ה-BLoC של השני.
  /// [title] אינו מועבר: הוא נגזר מהחלוניות וה-setter זורק.
  @override
  OpenedTab clone() => CombinedTab(
    rightTab: OpenedTab.from(rightTab),
    leftTab: OpenedTab.from(leftTab),
    splitRatio: splitRatio,
    isPinned: isPinned,
  );

  /// משחררת את הטאב ואת שתי החלוניות שבו.
  @override
  void dispose() {
    rightTab.dispose();
    leftTab.dispose();
    super.dispose();
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      'rightTab': rightTab.toJson(),
      'leftTab': leftTab.toJson(),
      'splitRatio': splitRatio,
      'isPinned': isPinned,
      'type': 'CombinedTab',
    };
  }
}

/// מפענחת טאב מפוצל שנשמר, ומשחזרת חלונית תקינה גם אם אחותה נפגמה.
OpenedTab decodeCombinedTab(Map<String, dynamic> json) {
  OpenedTab? decodePane(dynamic raw) {
    try {
      return OpenedTab.fromJson(castMap(raw));
    } catch (e) {
      debugPrint('⚠️ Skipping split pane that failed to restore: $e');
      return null;
    }
  }

  final right = decodePane(json['rightTab']);
  final left = decodePane(json['leftTab']);
  final isPinned = json['isPinned'] == true;

  if (right == null || left == null) {
    final survivor = right ?? left;
    if (survivor == null) {
      throw const FormatException('טאב מפוצל ללא חלונית שניתן לשחזר');
    }
    if (isPinned) survivor.isPinned = true;
    return survivor;
  }

  final splitRatio = ((json['splitRatio'] as num?)?.toDouble() ?? 0.5).clamp(
    0.0,
    1.0,
  );
  if (_isSplit(right) || _isSplit(left)) {
    return _RestoredCombinedTab(
      rightTab: right,
      leftTab: left,
      splitRatio: splitRatio,
      isPinned: isPinned,
    );
  }
  return CombinedTab(
    rightTab: right,
    leftTab: left,
    splitRatio: splitRatio,
    isPinned: isPinned,
  );
}

class _RestoredCombinedTab extends OpenedTab {
  final OpenedTab rightTab;
  final OpenedTab leftTab;
  final double splitRatio;

  _RestoredCombinedTab({
    required this.rightTab,
    required this.leftTab,
    required this.splitRatio,
    required super.isPinned,
  }) : super('');

  @override
  String get title => 'משולב: ${rightTab.title} | ${leftTab.title}';

  @override
  set title(String value) =>
      throw UnsupportedError('כותרת טאב מפוצל נגזרת מהחלוניות שבו');

  @override
  OpenedTab clone() => _RestoredCombinedTab(
    rightTab: OpenedTab.from(rightTab),
    leftTab: OpenedTab.from(leftTab),
    splitRatio: splitRatio,
    isPinned: isPinned,
  );

  @override
  void dispose() {
    rightTab.dispose();
    leftTab.dispose();
    super.dispose();
  }

  @override
  Map<String, dynamic> toJson() => {
    'rightTab': rightTab.toJson(),
    'leftTab': leftTab.toJson(),
    'splitRatio': splitRatio,
    'isPinned': isPinned,
    'type': 'CombinedTab',
  };
}

/// שמות הצדדים כפי שהם נשמרים לדיסק.
///
/// ⚠️ [CombinedTab.rightTab] הוא ה**ראשון** בסדר התצוגה — החלונית הימנית
/// ב-RTL. סריאליזציה של "left"/"right" שהופכת אותם תחליף בשקט בין החלוניות.
const String kRightPaneSide = 'right';
const String kLeftPaneSide = 'left';

/// הצד שבו יושבת [pane] בתוך [tab], או `null` כש-[tab] אינו מפוצל או
/// ש-[pane] אינה אחת משתי חלוניותיו.
///
/// ההשוואה היא [identical] ולא `==`, בדיוק כמו [CombinedTab.sibling]: שני
/// עותקים של אותו ספר הם שתי חלוניות שונות.
String? activePaneSideOf(OpenedTab tab, OpenedTab? pane) {
  if (tab is! CombinedTab || pane == null) return null;
  if (identical(pane, tab.rightTab)) return kRightPaneSide;
  if (identical(pane, tab.leftTab)) return kLeftPaneSide;
  return null;
}

/// החלונית שבצד [side] של [tab], או `null` כשהטאב אינו מפוצל או שהערך
/// השמור פגום. `null` מוביל את [TabsState] ליפול ל-`panes.first`.
OpenedTab? paneForSide(OpenedTab tab, String? side) {
  if (tab is! CombinedTab) return null;
  return switch (side) {
    kRightPaneSide => tab.rightTab,
    kLeftPaneSide => tab.leftTab,
    _ => null,
  };
}

/// חלוניות התוכן של טאב: שתיים בטאב מפוצל, אחת בכל שאר הטאבים.
List<OpenedTab> leafPanes(OpenedTab tab) =>
    tab is CombinedTab ? [tab.rightTab, tab.leftTab] : [tab];

/// מסירה מטאב מפוצל חלונית ש-[keep] דוחה; האחות תופסת את מקום הטאב.
///
/// מחזירה `null` כשלא נותרה אף חלונית, ואת הטאב עצמו כשלא השתנה דבר — כדי
/// שהחלוניות שנשמרו לא יאבדו את זהותן.
OpenedTab? prunePanes(OpenedTab tab, bool Function(OpenedTab pane) keep) {
  if (tab is! CombinedTab) return keep(tab) ? tab : null;

  final keepRight = keep(tab.rightTab);
  final keepLeft = keep(tab.leftTab);
  if (keepRight && keepLeft) return tab;
  if (keepRight) return tab.rightTab;
  if (keepLeft) return tab.leftTab;
  return null;
}

/// מנרמלת שחזור לפיצול של שתי חלוניות ומעדכנת את האינדקס הפעיל.
({List<OpenedTab> tabs, int currentIndex}) flattenRestoredSplits(
  List<OpenedTab> tabs, {
  int currentIndex = 0,
}) {
  final normalized = <OpenedTab>[];
  var normalizedIndex = currentIndex;
  for (var i = 0; i < tabs.length; i++) {
    final tab = tabs[i];
    if (!_isSplit(tab)) {
      normalized.add(tab);
      continue;
    }
    final leaves = _allLeaves(tab);
    if (tab is CombinedTab) {
      normalized.add(tab);
      continue;
    }
    normalized.add(
      CombinedTab(
        rightTab: leaves[0],
        leftTab: leaves[1],
        splitRatio: _splitRatio(tab),
        isPinned: tab.isPinned,
      ),
    );
    for (final extra in leaves.skip(2)) {
      // חלונית שחוזרת לכרטיסייה עצמאית יורשת את ההצמדה.
      if (tab.isPinned) extra.isPinned = true;
      normalized.add(extra);
    }
    if (i < currentIndex) normalizedIndex += leaves.length - 2;
  }
  return (tabs: normalized, currentIndex: normalizedIndex);
}

bool _isSplit(OpenedTab tab) =>
    tab is CombinedTab || tab is _RestoredCombinedTab;

double _splitRatio(OpenedTab tab) => switch (tab) {
  CombinedTab() => tab.splitRatio,
  _RestoredCombinedTab() => tab.splitRatio,
  _ => throw ArgumentError.value(tab, 'tab', 'אינו טאב מפוצל'),
};

List<OpenedTab> _allLeaves(OpenedTab tab) => switch (tab) {
  CombinedTab() => [..._allLeaves(tab.rightTab), ..._allLeaves(tab.leftTab)],
  _RestoredCombinedTab() => [
    ..._allLeaves(tab.rightTab),
    ..._allLeaves(tab.leftTab),
  ],
  _ => [tab],
};
