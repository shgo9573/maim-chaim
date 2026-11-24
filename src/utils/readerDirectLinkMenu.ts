export type ReaderDirectLinkKind = 'section' | 'section-mark' | 'text-mark';

export interface ReaderDirectLinkSelection {
  text: string;
  line: number;
  from: number;
  to: number;
}

export interface ReaderDirectLinkMenuItem {
  id: ReaderDirectLinkKind;
  label: string;
  line: number;
  from?: number;
  to?: number;
  disabled: boolean;
}

export interface ReaderDirectLinkMenuInput {
  line: number;
  sectionWordCount: number;
  selection?: ReaderDirectLinkSelection | null;
}

/**
 * Builds the web equivalents of Otzaria's direct-link submenu:
 * a link to the current section, a link highlighting the whole section,
 * and (when selected) a link highlighting the selected words.
 */
export function getReaderDirectLinkMenuItems(
  input: ReaderDirectLinkMenuInput,
): ReaderDirectLinkMenuItem[] {
  if (!Number.isInteger(input.line) || input.line < 1) return [];

  const wordCount = Number.isInteger(input.sectionWordCount)
    ? Math.max(0, input.sectionWordCount)
    : 0;
  const items: ReaderDirectLinkMenuItem[] = [
    {
      id: 'section',
      label: 'העתק קישור למקטע זה',
      line: input.line,
      disabled: false,
    },
    {
      id: 'section-mark',
      label: 'העתק קישור עם הדגשת המקטע',
      line: input.line,
      from: 0,
      to: Math.max(0, wordCount - 1),
      disabled: wordCount === 0,
    },
  ];

  const selection = input.selection;
  if (
    selection &&
    selection.text.trim() &&
    Number.isInteger(selection.line) &&
    selection.line >= 1 &&
    Number.isInteger(selection.from) &&
    selection.from >= 0 &&
    Number.isInteger(selection.to) &&
    selection.to >= selection.from
  ) {
    items.push({
      id: 'text-mark',
      label: 'העתק קישור עם הדגשת הטקסט',
      line: selection.line,
      from: selection.from,
      to: selection.to,
      disabled: false,
    });
  }

  return items;
}


export type ReaderDirectLinkIconKind = 'document' | 'marker' | 'alef';

/** Web icon mapping for Otzaria's link_document, link_marker and link_alef glyphs. */
export function getReaderDirectLinkIconKind(kind: ReaderDirectLinkKind): ReaderDirectLinkIconKind {
  switch (kind) {
    case 'section':
      return 'document';
    case 'section-mark':
      return 'marker';
    case 'text-mark':
      return 'alef';
  }
}


export interface ReaderDirectLinkMenuAnchor { left: number; right: number; top: number; bottom: number; }
export interface ReaderDirectLinkMenuSize { width: number; height: number; }
export interface ReaderDirectLinkMenuViewport { width: number; height: number; }
export interface ReaderDirectLinkMenuPosition { left: number; top: number; maxWidth: number; maxHeight: number; }

/** Places the content-sized direct-link submenu with Otzaria's 150px minimum, 8px inset and 4px anchor gap. */
export function placeReaderDirectLinkMenu(
  anchor: ReaderDirectLinkMenuAnchor,
  menu: ReaderDirectLinkMenuSize,
  viewport: ReaderDirectLinkMenuViewport,
  direction: 'rtl' | 'ltr',
): ReaderDirectLinkMenuPosition {
  const inset = 8;
  const gap = 4;
  const maxWidth = Math.max(0, Math.min(320, viewport.width - inset * 2));
  const maxHeight = Math.max(0, viewport.height - inset * 2);
  const width = Math.min(Math.max(150, menu.width), maxWidth);
  const height = Math.min(Math.max(0, menu.height), maxHeight);
  const preferredLeft = direction === 'rtl' ? anchor.right - width : anchor.left;
  const maxLeft = Math.max(inset, viewport.width - width - inset);
  const left = Math.min(Math.max(inset, preferredLeft), maxLeft);
  const below = anchor.bottom + gap;
  const top = below + height <= viewport.height - inset ? below : Math.max(inset, anchor.top - height - gap);
  return { left, top, maxWidth, maxHeight };
}