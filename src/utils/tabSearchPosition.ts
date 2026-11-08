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
  const maximumHeight = Math.max(80, Math.min(420, viewport.height - margin * 2));
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const openAbove = spaceBelow < Math.min(180, maximumHeight) && spaceAbove > spaceBelow;

  const top = openAbove
    ? Math.max(margin, anchor.top - gap - maximumHeight)
    : Math.min(anchor.bottom + gap, Math.max(margin, viewport.height - Math.max(80, spaceBelow) - margin));
  const maxHeight = Math.max(80, Math.min(maximumHeight, viewport.height - top - margin));
  const preferredLeft = direction === 'rtl' ? anchor.right - width : anchor.left;
  const left = Math.max(margin, Math.min(preferredLeft, Math.max(margin, viewport.width - width - margin)));

  return { top, left, width, maxHeight };
}
