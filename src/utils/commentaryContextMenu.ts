export type CommentaryContextMenuActionId =
  | 'search-selection'
  | 'copy-selection'
  | 'copy-paragraph'
  | 'open-commentary';

export interface CommentaryContextMenuAction {
  id: CommentaryContextMenuActionId;
  label: string;
  disabled: boolean;
}

export interface CommentaryContextMenuAvailability {
  hasSelection: boolean;
  hasParagraph: boolean;
  hasCommentary: boolean;
}

export function getCommentaryContextMenuActions(
  availability: CommentaryContextMenuAvailability,
): CommentaryContextMenuAction[] {
  return [
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
  ];
}
