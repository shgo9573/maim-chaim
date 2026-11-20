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
