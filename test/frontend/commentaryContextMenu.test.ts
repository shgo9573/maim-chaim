import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findUniqueCommentaryBook,
  getCommentaryContextMenuActions,
  hasNikudOrTeamim,
  removeNikudAndTeamim,
} from '../../src/utils/commentaryContextMenu';

test('תפריט מפרש משבית חיפוש והעתקה ללא בחירה, ומשאיר פעולות פסקה/פתיחה', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: false,
    hasNikudSelection: false,
    hasParagraph: true,
    hasCommentary: true,
    canOpenInBackground: true,
  });
  const byId = Object.fromEntries(actions.map((action) => [action.id, action]));

  assert.deepEqual(actions.map((action) => action.id), [
    'search-selection',
    'copy-selection',
    'copy-paragraph',
    'open-commentary',
    'open-commentary-background',
  ]);
  assert.equal(byId['search-selection'].disabled, true);
  assert.equal(byId['copy-selection'].disabled, true);
  assert.equal(byId['copy-paragraph'].disabled, false);
  assert.equal(byId['open-commentary'].disabled, false);
  assert.equal(byId['open-commentary-background'].disabled, false);
});

test('העתקה ללא ניקוד מופיעה רק כשיש ניקוד או טעמים בבחירה', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: true,
    hasNikudSelection: true,
    hasParagraph: true,
    hasCommentary: true,
    canOpenInBackground: true,
  });

  assert.deepEqual(actions.map((action) => action.id), [
    'search-selection',
    'copy-selection',
    'copy-selection-without-nikud',
    'copy-paragraph',
    'open-commentary',
    'open-commentary-background',
  ]);
  assert.ok(actions.every((action) => !action.disabled));
  assert.equal(hasNikudOrTeamim('בְּרֵאשִׁית'), true);
  assert.equal(hasNikudOrTeamim('בראשית'), false);
  assert.equal(removeNikudAndTeamim('בְּרֵאשִׁית'), 'בראשית');
});

test('תפריט מפרש משבית פתיחה ברקע כשאין ספר יחיד תואם', () => {
  const actions = getCommentaryContextMenuActions({
    hasSelection: true,
    hasNikudSelection: false,
    hasParagraph: true,
    hasCommentary: true,
    canOpenInBackground: false,
  });
  const background = actions.find((action) => action.id === 'open-commentary-background');

  assert.equal(background?.disabled, true);
});

test('פתיחה ברקע פותרת כותרת רק כאשר קיימת התאמה יחידה מדויקת', () => {
  const books = [
    { id: 1, title: 'רש״י על בראשית', categoryPath: 'מפרשים/רש״י' },
    { id: 2, title: 'תוספות על בראשית', categoryPath: 'מפרשים/תוספות' },
  ];

  assert.deepEqual(findUniqueCommentaryBook(books, 'רש״י על בראשית'), books[0]);
  assert.equal(findUniqueCommentaryBook(books, 'רש״י'), null);
  assert.equal(
    findUniqueCommentaryBook([...books, { id: 3, title: 'רש״י על בראשית' }], 'רש״י על בראשית'),
    null,
  );
});
