export interface ReaderContextMenuPoint {
  x: number;
  y: number;
}

export interface ReaderContextMenuSize {
  width: number;
  height: number;
}

export interface ReaderContextMenuViewport {
  width: number;
  height: number;
}

export interface ReaderContextMenuPlacement {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
}

export function placeReaderContextMenu(
  anchor: ReaderContextMenuPoint,
  menu: ReaderContextMenuSize,
  viewport: ReaderContextMenuViewport,
  padding = 8,
): ReaderContextMenuPlacement {
  const safePaddingX = Math.min(padding, Math.max(0, viewport.width / 2));
  const safePaddingY = Math.min(padding, Math.max(0, viewport.height / 2));
  const maxWidth = Math.max(0, viewport.width - safePaddingX * 2);
  const maxHeight = Math.max(0, viewport.height - safePaddingY * 2);
  const width = Math.min(Math.max(0, menu.width), maxWidth);
  const height = Math.min(Math.max(0, menu.height), maxHeight);
  const maxLeft = Math.max(safePaddingX, viewport.width - width - safePaddingX);
  const left = Math.min(Math.max(anchor.x, safePaddingX), maxLeft);

  let top = anchor.y;
  if (top + height > viewport.height - safePaddingY && anchor.y - height >= safePaddingY) {
    top = anchor.y - height;
  }
  const maxTop = Math.max(safePaddingY, viewport.height - height - safePaddingY);
  top = Math.min(Math.max(top, safePaddingY), maxTop);

  return { left, top, maxWidth, maxHeight };
}

export function isReaderContextMenuShortcut(key: string, shiftKey: boolean): boolean {
  return key === 'ContextMenu' || (key === 'F10' && shiftKey);
}
