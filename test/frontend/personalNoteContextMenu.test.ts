import assert from 'node:assert/strict';
import test from 'node:test';
import { getPersonalNoteContextMenuActions } from '../../src/utils/personalNoteContextMenu';

test('תפריט הערה אישית מכיל העתקה מושבתת כשהתוכן ריק או רווחים בלבד', () => {
  for (const text of ['', '   \n\t']) {
    assert.deepEqual(getPersonalNoteContextMenuActions(text), [
      { id: 'copy-note', label: 'העתק', disabled: true },
    ]);
  }
});

test('תפריט הערה אישית מאפשר להעתיק תוכן קיים', () => {
  assert.deepEqual(getPersonalNoteContextMenuActions('חידוש תורה'), [
    { id: 'copy-note', label: 'העתק', disabled: false },
  ]);
});
