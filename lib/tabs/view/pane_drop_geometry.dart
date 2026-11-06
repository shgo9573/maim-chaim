import 'dart:ui';

import 'package:flutter/foundation.dart';

/// המקום המזערי שחייב להישאר לכל חלונית — בפיצול ובגרירת המפריד כאחד.
const double kMinPaneExtent = 140;

/// חלקה המזערי של חלונית מהמקום הפנוי. רצפת [kMinPaneExtent] לבדה כמעט אינה
/// מגבילה במסך רחב, ושם אפשר היה לכווץ ספר לרצועה.
const double kMinPaneRatio = 0.2;

/// היחס המזערי לחלונית כשיש [availableExtent] פיקסלים פנויים — הגדולה מבין
/// שתי הרצפות, ולעולם לא מעל מחצית.
double minPaneRatioFor(double availableExtent) {
  if (availableExtent <= 0) return kMinPaneRatio;
  final pixelFloor = kMinPaneExtent / availableExtent;
  return (pixelFloor > kMinPaneRatio ? pixelFloor : kMinPaneRatio).clamp(
    0.0,
    0.5,
  );
}

/// עובי רצועת המפריד בעכבר.
const double kPaneDividerThickness = 12;

/// עובי רצועת המפריד במגע — אצבע אינה מדייקת ל-12 פיקסלים.
const double kPaneDividerThicknessTouch = 24;

/// שוליים סביב כרטיס החלונית, מעבר לרצועת המפריד.
const double kPaneCardMargin = 3;

/// עובי רצועת המפריד לפי אמצעי הקלט של הפלטפורמה.
double paneDividerThicknessFor(TargetPlatform platform) {
  return platform == TargetPlatform.android || platform == TargetPlatform.iOS
      ? kPaneDividerThicknessTouch
      : kPaneDividerThickness;
}

/// הרוחב המזערי לשתי חלוניות, כולל המפריד והשוליים החיצוניים.
double minimumSplitPaneWidthFor(TargetPlatform platform) {
  return kMinPaneExtent * 2 +
      paneDividerThicknessFor(platform) +
      kPaneCardMargin * 2;
}

/// הצד שאליו נכנסת הכרטיסייה הנגררת בפיצול.
enum PaneDropSide {
  /// החלונית הראשונה — הימנית ב-RTL.
  start,

  /// החלונית השנייה — השמאלית ב-RTL.
  end,
}

/// לאיזה צד תיכנס כרטיסייה שהמצביע נמצא ב-[localPosition].
///
/// המסך מחולק בקו האמצע: חצי המסך שמצביעים אליו הוא הצד שיתקבל, כך
/// שהחיווי מראה בדיוק את המקום שהספר יתפוס.
PaneDropSide dropSideFor({
  required Offset localPosition,
  required Size size,
  required TextDirection textDirection,
}) {
  if (size.width <= 0) return PaneDropSide.start;

  final pastMiddle = localPosition.dx >= size.width / 2;
  final onLeadingHalf = textDirection == TextDirection.rtl
      ? pastMiddle
      : !pastMiddle;
  return onLeadingHalf ? PaneDropSide.start : PaneDropSide.end;
}

/// האם יש מקום לפצל שטח בגודל [size] לשתי חלוניות קריאות.
bool canSplitPane(Size size, {required TargetPlatform platform}) {
  return size.width >= minimumSplitPaneWidthFor(platform);
}

/// המלבן שהכרטיסייה הנגררת תתפוס — הבסיס לחיווי הוויזואלי.
Rect previewRectFor({
  required PaneDropSide side,
  required Size size,
  required TextDirection textDirection,
}) {
  final onLeft =
      (side == PaneDropSide.start) == (textDirection == TextDirection.ltr);
  return Rect.fromLTWH(
    onLeft ? 0 : size.width / 2,
    0,
    size.width / 2,
    size.height,
  );
}
