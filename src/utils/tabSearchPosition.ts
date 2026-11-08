export interface TabSearchAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TabSearchViewport {
  width: number;
  height: number;
}

export interface TabSearchPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function calculateTabSearchPosition(
  anchor: TabSearchAnchor,
  viewport: TabSearchViewport,
  direction: 'rtl' | 'ltr',
): TabSearchPosition {
  const margin = 8;
  const gap = 4;
  const width = Math.max(0, Math.min(352, viewport.width - margin * 2));
  const maximumHeight = Math.max(0, Math.min(420, viewport.height - margin * 2));
  const minimumHeight = Math.min(80, maximumHeight);
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - gap - margin);
  const spaceAbove = Math.max(0, anchor.top - gap - margin);
  const openAbove =
    spaceBelow < Math.min(180, maximumHeight) &&
    spaceAbove > spaceBelow &&
    spaceAbove >= Math.min(120, maximumHeight);
  const availableSpace = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(minimumHeight, Math.min(maximumHeight, availableSpace));
  const requestedTop = openAbove ? anchor.top - gap - maxHeight : anchor.bottom + gap;
  const top = Math.max(0, Math.min(requestedTop, Math.max(0, viewport.height - maxHeight - margin)));
  const preferredLeft = direction === 'rtl' ? anchor.right - width : anchor.left;
  const maxLeft = Math.max(0, viewport.width - width - margin);
  const left = Math.max(0, Math.min(preferredLeft, maxLeft));

  return { top, left, width, maxHeight };
}
