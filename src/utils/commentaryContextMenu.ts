export type CommentaryContextMenuActionId =
  | 'search-selection'
  | 'copy-selection'
  | 'copy-selection-without-nikud'
  | 'copy-paragraph'
  | 'open-commentary'
  | 'open-commentary-background';

export interface CommentaryContextMenuAction {
  id: CommentaryContextMenuActionId;
  label: string;
  disabled: boolean;
}

export interface CommentaryContextMenuAvailability {
  hasSelection: boolean;
  hasNikudSelection: boolean;
  hasParagraph: boolean;
  hasCommentary: boolean;
  canOpenInBackground: boolean;
}

export interface CommentaryBookRef {
  id: string | number;
  title: string;
  categoryPath?: string;
}

/** A title-only commentary link is safe to open only when the catalogue has one exact match. */
export function findUniqueCommentaryBook<T extends CommentaryBookRef>(
  books: readonly T[],
  title: string,
): T | null {
  const matches = books.filter((book) => book.title === title);
  return matches.length === 1 ? matches[0] : null;
}

const NIKUD_OR_TEAMIM_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/u;

/** Matches the source application's "hasNikud" check (vowels or cantillation). */
export function hasNikudOrTeamim(text: string): boolean {
  return NIKUD_OR_TEAMIM_RE.test(text);
}

/** Mirrors Otzaria's removeVolwels behavior for copied commentary text. */
export function removeNikudAndTeamim(text: string): string {
  return text.replace(/[\u0591-\u05C7]/gu, '').replace(/\|/gu, ' ');
}

export function getCommentaryContextMenuActions(
  availability: CommentaryContextMenuAvailability,
): CommentaryContextMenuAction[] {
  const actions: CommentaryContextMenuAction[] = [
    {
      id: 'search-selection',
      label: 'חפש את הטקסט המסומן',
      disabled: !availability.hasSelection,
    },
    {
      id: 'copy-selection',
      label: 'העתק טקסט מסומן',
      disabled: !availability.hasSelection,
    },
  ];

  if (availability.hasNikudSelection) {
    actions.push({
      id: 'copy-selection-without-nikud',
      label: 'העתק בלי ניקוד',
      disabled: !availability.hasSelection,
    });
  }

  actions.push(
    {
      id: 'copy-paragraph',
      label: 'העתק את כל הפסקה',
      disabled: !availability.hasParagraph,
    },
    {
      id: 'open-commentary',
      label: 'פתח את ספר המפרש',
      disabled: !availability.hasCommentary,
    },
    {
      id: 'open-commentary-background',
      label: 'פתח בכרטיסייה חדשה',
      disabled: !availability.canOpenInBackground,
    },
  );

  return actions;
}
