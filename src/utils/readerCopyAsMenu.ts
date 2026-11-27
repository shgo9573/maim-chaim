export interface ReaderCopyAsMenuAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ReaderCopyAsMenuSize {
  width: number;
  height: number;
}

export interface ReaderCopyAsMenuViewport {
  width: number;
  height: number;
}

export interface ReaderCopyAsSubmenuPosition {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  opensToRight: boolean;
}

/** מציב תת-תפריט צמוד לשורת האב, בכיוון הקריאה, ומחליף צד כשאין מקום. */
export function placeReaderCopyAsSubmenu(
  anchor: ReaderCopyAsMenuAnchor,
  menu: ReaderCopyAsMenuSize,
  viewport: ReaderCopyAsMenuViewport,
  direction: 'rtl' | 'ltr',
): ReaderCopyAsSubmenuPosition {
  const inset = 8;
  const gap = 4;
  const maxWidth = Math.max(0, Math.min(320, viewport.width - inset * 2));
  const maxHeight = Math.max(0, viewport.height - inset * 2);
  const width = Math.min(Math.max(150, menu.width), maxWidth);
  const height = Math.min(Math.max(0, menu.height), maxHeight);
  const leftSpace = Math.max(0, anchor.left - gap - inset);
  const rightSpace = Math.max(0, viewport.width - anchor.right - gap - inset);
  const preferredRight = direction === 'ltr';

  let opensToRight = preferredRight;
  const preferredSpace = preferredRight ? rightSpace : leftSpace;
  const alternateSpace = preferredRight ? leftSpace : rightSpace;
  if (preferredSpace < width) {
    if (alternateSpace >= width) {
      opensToRight = !preferredRight;
    } else {
      opensToRight = rightSpace >= leftSpace;
    }
  }

  const preferredLeft = opensToRight
    ? anchor.right + gap
    : anchor.left - gap - width;
  const maxLeft = Math.max(inset, viewport.width - width - inset);
  const left = Math.min(Math.max(inset, preferredLeft), maxLeft);
  const maxTop = Math.max(inset, viewport.height - height - inset);
  const top = Math.min(Math.max(inset, anchor.top), maxTop);

  return { left, top, maxWidth, maxHeight, opensToRight };
}
