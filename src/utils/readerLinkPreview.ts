export interface ReaderLinkPreviewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ReaderLinkPreviewViewport {
  width: number;
  height: number;
}

export interface ReaderLinkPreviewPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** ממקם חלונית קישור ליד פריט התפריט בלי לחרוג מגבולות המסך. */
export function placeReaderLinkPreview(
  anchor: ReaderLinkPreviewRect,
  viewport: ReaderLinkPreviewViewport,
  direction: 'rtl' | 'ltr',
  panelWidth = 320,
  panelHeight = 240,
): ReaderLinkPreviewPosition {
  const edge = 8;
  const gap = 8;
  const width = Math.min(Math.max(0, panelWidth), Math.max(0, viewport.width - edge * 2));
  const maxHeight = Math.min(Math.max(0, panelHeight), Math.max(0, viewport.height - edge * 2));
  const leftRoom = Math.max(0, anchor.left - edge);
  const rightRoom = Math.max(0, viewport.width - anchor.right - edge);
  const preferred = direction === 'rtl' ? 'left' : 'right';
  const preferredRoom = preferred === 'left' ? leftRoom : rightRoom;
  const alternateRoom = preferred === 'left' ? rightRoom : leftRoom;
  const side = preferredRoom >= width + gap
    ? preferred
    : alternateRoom >= width + gap
      ? (preferred === 'left' ? 'right' : 'left')
      : leftRoom >= rightRoom
        ? 'left'
        : 'right';

  const candidateLeft = side === 'left'
    ? anchor.left - width - gap
    : anchor.right + gap;
  const maxLeft = Math.max(edge, viewport.width - width - edge);
  const left = Math.min(Math.max(candidateLeft, edge), maxLeft);
  const maxTop = Math.max(edge, viewport.height - maxHeight - edge);
  const top = Math.min(Math.max(anchor.top, edge), maxTop);

  return { left, top, width, maxHeight };
}
