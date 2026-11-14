import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommentaryContextMenuActions } from '../../src/utils/commentaryContextMenu';

test('תפריט מפרש מאפשר העתקה וחיפוש רק כשיש בחירה', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: false,
    hasParagraph: true,
    hasCommentary: true,
  });
  const byId = Object.fromEntries(actions.map((action) => [action.id, action]));

  assert.equal(byId['search-selection'].disabled, true);
  assert.equal(byId['copy-selection'].disabled, true);
  assert.equal(byId['copy-paragraph'].disabled, false);
  assert.equal(byId['open-commentary'].disabled, false);
});

test('כל פעולות תפריט המפרש פעילות כאשר הנתונים קיימים', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: true,
    hasParagraph: true,
    hasCommentary: true,
  });

  assert.deepEqual(actions.map((action) => action.id), [
    'search-selection',
    'copy-selection',
    'copy-paragraph',
    'open-commentary',
  ]);
  assert.ok(actions.every((action) => !action.disabled));
});

test('תפריט מפרש לא מאפשר להעתיק פסקה או לפתוח מקור חסר', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: true,
    hasParagraph: false,
    hasCommentary: false,
  });
  const byId = Object.fromEntries(actions.map((action) => [action.id, action]));

  assert.equal(byId['copy-paragraph'].disabled, true);
  assert.equal(byId['open-commentary'].disabled, true);
});
