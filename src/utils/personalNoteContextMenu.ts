export type PersonalNoteContextMenuActionId = 'copy-note';

export interface PersonalNoteContextMenuAction {
  id: PersonalNoteContextMenuActionId;
  label: string;
  disabled: boolean;
}

export function getPersonalNoteContextMenuActions(
  noteText: string,
): PersonalNoteContextMenuAction[] {
  return [{
    id: 'copy-note',
    label: 'העתק',
    disabled: noteText.trim().length === 0,
  }];
}
