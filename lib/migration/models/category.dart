/// Represents a category in the library hierarchy.
class Category {
  /// The unique identifier of the category. Defaults to 0.
  final int id;

  /// The identifier of the parent category, or null if this is a root category.
  final int? parentId;

  /// The title of the category.
  final String title;

  /// The level of the category in the hierarchy (0 for root categories). Defaults to 0.
  final int level;

  /// The display order of the category within its parent. Defaults to 999.
  final int orderIndex;

  /// תיאור עברי קצר של הקטגוריה, או null כאשר אינו קיים.
  final String? heShortDesc;

  /// תיאור עברי מורחב של הקטגוריה, או null כאשר אינו קיים.
  final String? heDesc;

  /// Creates a new instance of [Category].
  const Category({
    this.id = 0,
    this.parentId,
    required this.title,
    this.level = 0,
    this.orderIndex = 999,
    this.heShortDesc,
    this.heDesc,
  });

  /// יוצר עותק של הקטגוריה עם הערכים שסופקו.
  ///
  /// הדגלים [clearHeShortDesc] ו־[clearHeDesc] מנקים במפורש שדה nullable;
  /// השמטת הערך והדגל משאירה את התיאור הקיים.
  Category copyWith({
    int? id,
    int? parentId,
    String? title,
    int? level,
    int? orderIndex,
    String? heShortDesc,
    String? heDesc,
    bool clearHeShortDesc = false,
    bool clearHeDesc = false,
  }) {
    return Category(
      id: id ?? this.id,
      parentId: parentId ?? this.parentId,
      title: title ?? this.title,
      level: level ?? this.level,
      orderIndex: orderIndex ?? this.orderIndex,
      heShortDesc: clearHeShortDesc ? null : heShortDesc ?? this.heShortDesc,
      heDesc: clearHeDesc ? null : heDesc ?? this.heDesc,
    );
  }

  /// Creates a [Category] from a JSON map.
  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] as int? ?? 0,
      parentId: json['parentId'] as int?,
      title: json['title'] as String,
      level: json['level'] as int? ?? 0,
      orderIndex: json['orderIndex'] as int? ?? 999,
      heShortDesc: json['heShortDesc'] as String?,
      heDesc: json['heDesc'] as String?,
    );
  }

  /// Converts the [Category] to a JSON map.
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'parentId': parentId,
      'title': title,
      'level': level,
      'orderIndex': orderIndex,
      'heShortDesc': heShortDesc,
      'heDesc': heDesc,
    };
  }

  @override
  String toString() {
    return 'Category(id: $id, parentId: $parentId, title: $title, level: $level, orderIndex: $orderIndex, heShortDesc: $heShortDesc, heDesc: $heDesc)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;

    return other is Category &&
        other.id == id &&
        other.parentId == parentId &&
        other.title == title &&
        other.level == level &&
        other.orderIndex == orderIndex &&
        other.heShortDesc == heShortDesc &&
        other.heDesc == heDesc;
  }

  @override
  int get hashCode =>
      id.hashCode ^
      parentId.hashCode ^
      title.hashCode ^
      level.hashCode ^
      orderIndex.hashCode ^
      heShortDesc.hashCode ^
      heDesc.hashCode;
}
