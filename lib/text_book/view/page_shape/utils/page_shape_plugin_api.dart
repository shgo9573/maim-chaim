class PageShapeCommentatorState {
  final String commentator;
  final bool visible;

  const PageShapeCommentatorState({
    required this.commentator,
    required this.visible,
  });

  Map<String, dynamic> toJson() => {
    'commentator': commentator,
    'visible': visible,
  };

  PageShapeCommentatorState withVisibility(bool value) =>
      PageShapeCommentatorState(commentator: commentator, visible: value);
}

class PageShapeLayoutSnapshot {
  final List<String> available;
  final PageShapeCommentatorState? left;
  final List<PageShapeCommentatorState> right;
  final PageShapeCommentatorState? bottom;
  final PageShapeCommentatorState? bottomRight;

  const PageShapeLayoutSnapshot({
    required this.available,
    required this.left,
    required this.right,
    required this.bottom,
    required this.bottomRight,
  });

  bool contains(String commentator) =>
      left?.commentator == commentator ||
      right.any((entry) => entry.commentator == commentator) ||
      bottom?.commentator == commentator ||
      bottomRight?.commentator == commentator;

  PageShapeLayoutSnapshot withCommentatorVisibility(
    String commentator,
    bool visible,
  ) {
    PageShapeCommentatorState? update(PageShapeCommentatorState? entry) {
      if (entry?.commentator != commentator) return entry;
      return entry!.withVisibility(visible);
    }

    return PageShapeLayoutSnapshot(
      available: available,
      left: update(left),
      right: right
          .map(
            (entry) => entry.commentator == commentator
                ? entry.withVisibility(visible)
                : entry,
          )
          .toList(),
      bottom: update(bottom),
      bottomRight: update(bottomRight),
    );
  }

  Map<String, dynamic> toJson() => {
    'available': available,
    'left': left?.toJson(),
    'right': right.map((entry) => entry.toJson()).toList(),
    'bottom': bottom?.toJson(),
    'bottomRight': bottomRight?.toJson(),
  };
}

typedef PageShapeLayoutReader = PageShapeLayoutSnapshot? Function();
typedef PageShapeVisibilitySetter =
    PageShapeLayoutSnapshot? Function(
      String commentator,
      bool visible,
    );

class PageShapePluginController {
  PageShapeLayoutReader? _readLayout;
  PageShapeVisibilitySetter? _setVisibility;

  bool get isAttached => _readLayout != null && _setVisibility != null;

  PageShapeLayoutSnapshot? get layout => _readLayout?.call();

  PageShapeLayoutSnapshot? setCommentatorVisibility(
    String commentator,
    bool visible,
  ) => _setVisibility?.call(commentator, visible);

  void attach({
    required PageShapeLayoutReader readLayout,
    required PageShapeVisibilitySetter setVisibility,
  }) {
    _readLayout = readLayout;
    _setVisibility = setVisibility;
  }

  void detach() {
    _readLayout = null;
    _setVisibility = null;
  }
}
