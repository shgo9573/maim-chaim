import assert from 'node:assert/strict';
import test from 'node:test';
import { getPersonalNoteEditorContextMenuActions } from '../../src/utils/personalNoteEditorContextMenu';

test('תפריט עורך הערה משבית גזור והעתק ללא בחירה ובחר הכל כשהטיוטה ריקה', () => {
  assert.deepEqual(getPersonalNoteEditorContextMenuActions({
    hasSelection: false,
    hasText: false,
  }), [
    { id: 'cut-selection', label: 'גזור', disabled: true },
    { id: 'copy-selection', label: 'העתק', disabled: true },
    { id: 'paste', label: 'הדבק', disabled: false },
    { id: 'select-all', label: 'בחר הכל', disabled: true },
  ]);
});

test('תפריט עורך הערה מאפשר גזירה/העתקה לפי בחירה ובחירת כל טקסט קיים', () => {
  assert.deepEqual(getPersonalNoteEditorContextMenuActions({
    hasSelection: true,
    hasText: true,
  }), [
    { id: 'cut-selection', label: 'גזור', disabled: false },
    { id: 'copy-selection', label: 'העתק', disabled: false },
    { id: 'paste', label: 'הדבק', disabled: false },
    { id: 'select-all', label: 'בחר הכל', disabled: false },
  ]);
});
