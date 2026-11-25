import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BookItem, ShamorZachorTrackedBook, TocEntry } from '../../src/types';
import {
  DEFAULT_SHAMOR_ZACHOR_COLUMNS,
  MAX_SHAMOR_COLUMNS,
  addShamorColumn,
  addTrackedShamorBook,
  applyShamorRange,
  buildShamorZachorUnits,
  createTrackedShamorBook,
  getShamorAddSearchResults,
  getShamorProgressSummary,
  normalizeShamorZachorState,
  removeShamorColumn,
  removeTrackedShamorBook,
  renameShamorColumn,
  setShamorColumnAll,
  toggleShamorUnit,
  updateTrackedShamorBook,
} from '../../src/utils/shamorZachor';

const book: BookItem = { id: 12, title: 'מסכת לדוגמה', categoryPath: 'תלמוד/מועד' };
const toc: TocEntry[] = [
  { title: 'מסכת', index: 1, level: 0 },
  { title: 'פרק א', index: 4, level: 1 },
  { title: 'משנה א', index: 6, level: 2 },
  { title: 'משנה ב', index: 10, level: 2 },
  { title: 'פרק ב', index: 18, level: 1 },
];
function sample(): ShamorZachorTrackedBook {
  return createTrackedShamorBook(book, buildShamorZachorUnits(toc, 30));
}

test('builds leaf TOC units and preserves the full hierarchy label', () => {
  const units = buildShamorZachorUnits(toc, 30);
  assert.deepEqual(units.map((unit) => unit.lineIndex), [6, 10, 18]);
  assert.equal(units[0].label, 'מסכת · פרק א · משנה א');
  assert.equal(units[2].label, 'מסכת · פרק ב');
});

test('ignores duplicate, invalid and out-of-range TOC line indexes', () => {
  const units = buildShamorZachorUnits([
    { title: 'א', index: 2 },
    { title: 'ב', index: 2 },
    { title: 'ג', index: 0 },
    { title: 'ד', index: 20 },
  ], 10);
  assert.deepEqual(units.map((unit) => unit.lineIndex), [2]);
});

test('uses bounded 50-line fallback units when no TOC exists', () => {
  const units = buildShamorZachorUnits([], 121);
  assert.deepEqual(units.map((unit) => unit.lineIndex), [1, 51, 101]);
  assert.equal(units[2].label, 'שורות 101–121');
});

test('caps fallback units for very large books', () => {
  const units = buildShamorZachorUnits([], 100000);
  assert.equal(units.length, 500);
  assert.equal(units[499].lineIndex, 99801);
});

test('creates a single unit when neither TOC nor total line count is available', () => {
  assert.deepEqual(buildShamorZachorUnits([], 0), [{ id: 'whole-book', label: 'הספר כולו', lineIndex: 1 }]);
});

test('creates the four source-compatible default progress columns', () => {
  assert.deepEqual(sample().columns, DEFAULT_SHAMOR_ZACHOR_COLUMNS);
});

test('toggles one unit without changing other columns', () => {
  const current = sample();
  const firstUnit = current.units[0].id;
  const checked = toggleShamorUnit(current, 'learn', firstUnit, true);
  assert.deepEqual(checked.progress.learn, [firstUnit]);
  assert.deepEqual(checked.progress.review1, []);
  const unchecked = toggleShamorUnit(checked, 'learn', firstUnit, false);
  assert.deepEqual(unchecked.progress.learn, []);
});

test('applies inclusive ranges in either direction and clamps to the list', () => {
  const current = sample();
  const marked = applyShamorRange(current, 'learn', 2, 0, true);
  assert.deepEqual(new Set(marked.progress.learn), new Set(current.units.slice(0, 3).map((unit) => unit.id)));
  const cleared = applyShamorRange(marked, 'learn', 1, 100, false);
  assert.deepEqual(cleared.progress.learn, [current.units[0].id]);
});

test('supports select-all and clear-all for a single column', () => {
  const current = sample();
  const all = setShamorColumnAll(current, 'review1', true);
  assert.equal(all.progress.review1.length, current.units.length);
  assert.deepEqual(all.progress.learn, []);
  const none = setShamorColumnAll(all, 'review1', false);
  assert.deepEqual(none.progress.review1, []);
});

test('adds, renames and removes custom columns while preserving progress', () => {
  const current = sample();
  const added = addShamorColumn(current, 'חזרה נוספת', 'review4');
  assert.equal(added.columns.length, 5);
  const renamed = renameShamorColumn(added, 'review4', 'חזרה חמישית');
  assert.equal(renamed.columns.find((column) => column.id === 'review4')?.label, 'חזרה חמישית');
  const removed = removeShamorColumn(renamed, 'review4');
  assert.equal(removed.columns.length, 4);
  assert.equal('review4' in removed.progress, false);
  assert.equal(removeShamorColumn(removed, 'learn').columns.length, 3);
});

test('enforces the eight-column maximum and rejects blank names', () => {
  let current = sample();
  for (let index = 4; index < MAX_SHAMOR_COLUMNS; index++) current = addShamorColumn(current, `עמודה ${index}`, `custom-${index}`);
  assert.equal(current.columns.length, MAX_SHAMOR_COLUMNS);
  assert.equal(addShamorColumn(current, 'עוד אחת', 'overflow'), current);
  assert.equal(addShamorColumn(current, '  ', 'blank'), current);
});

test('normalizes corrupt state and discards progress for unknown units or columns', () => {
  const normalized = normalizeShamorZachorState({
    books: {
      '12': {
        bookId: 12,
        title: 'ספר',
        units: [{ id: 'u1', label: 'פרק', lineIndex: 1 }, { id: 'bad', label: 'שגוי', lineIndex: -1 }],
        columns: [{ id: 'learn', label: 'לימוד' }, { id: 'learn', label: 'כפול' }],
        progress: { learn: ['u1', 'missing', 4], fake: ['u1'] },
      },
      broken: { title: '', units: [] },
    },
  });
  assert.deepEqual(Object.keys(normalized.books), ['12']);
  assert.deepEqual(normalized.books['12'].progress.learn, ['u1']);
  assert.equal(normalized.books['12'].columns.length, 1);
});

test('summary requires every unit in every column for full completion', () => {
  let current = sample();
  const total = current.units.length;
  current = setShamorColumnAll(current, 'learn', true);
  let summary = getShamorProgressSummary(current);
  assert.equal(summary.learningPercent, 100);
  assert.equal(summary.isComplete, false);
  for (const column of current.columns.slice(1)) current = setShamorColumnAll(current, column.id, true);
  summary = getShamorProgressSummary(current);
  assert.equal(summary.isComplete, true);
  assert.equal(summary.fullyCompletedUnits, total);
});

test('adds a tracked book once and removes it by stable book ID', () => {
  const units = buildShamorZachorUnits(toc, 30);
  const empty = normalizeShamorZachorState(null);
  const added = addTrackedShamorBook(empty, book, units);
  assert.ok(added.books['12']);
  assert.equal(addTrackedShamorBook(added, book, units), added);
  const updated = updateTrackedShamorBook(added, 12, (tracked) => toggleShamorUnit(tracked, 'learn', units[0].id, true));
  assert.equal(updated.books['12'].progress.learn.length, 1);
  assert.deepEqual(Object.keys(removeTrackedShamorBook(updated, 12).books), []);
});


test('Shamor Vezachor add search waits for at least two characters', () => {
  assert.deepEqual(getShamorAddSearchResults([book], ''), []);
  assert.deepEqual(getShamorAddSearchResults([book], 'מ'), []);
});

test('Shamor Vezachor add search matches title, author and category while excluding PDF books', () => {
  const books: BookItem[] = [
    book,
    { id: 13, title: 'ספר נוסף', author: 'מחבר לדוגמה', categoryPath: 'הלכה' },
    { id: 14, title: 'סריקה.pdf', fileType: 'pdf', categoryPath: 'הלכה' },
  ];
  assert.deepEqual(getShamorAddSearchResults(books, 'לדוגמה').map((item) => item.id), [12, 13]);
  assert.deepEqual(getShamorAddSearchResults(books, 'הלכה').map((item) => item.id), [13]);
  assert.deepEqual(getShamorAddSearchResults(books, 'סריקה'), []);
});

test('Shamor Vezachor add search applies a stable result limit', () => {
  const books = Array.from({ length: 5 }, (_, index): BookItem => ({
    id: index + 1,
    title: `ספר ${index + 1}`,
    categoryPath: 'קטגוריה',
  }));
  assert.equal(getShamorAddSearchResults(books, 'ספר', 2).length, 2);
  assert.deepEqual(getShamorAddSearchResults(books, 'ספר', 0), []);
});
