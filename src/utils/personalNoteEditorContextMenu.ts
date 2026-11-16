export type PersonalNoteEditorContextMenuActionId =
  | 'cut-selection'
  | 'copy-selection'
  | 'paste'
  | 'select-all';

export interface PersonalNoteEditorContextMenuAction {
  id: PersonalNoteEditorContextMenuActionId;
  label: string;
  disabled: boolean;
}

export function getPersonalNoteEditorContextMenuActions({
  hasSelection,
  hasText,
}: {
  hasSelection: boolean;
  hasText: boolean;
}): PersonalNoteEditorContextMenuAction[] {
  return [
    { id: 'cut-selection', label: 'גזור', disabled: !hasSelection },
    { id: 'copy-selection', label: 'העתק', disabled: !hasSelection },
    { id: 'paste', label: 'הדבק', disabled: false },
    { id: 'select-all', label: 'בחר הכל', disabled: !hasText },
  ];
}
