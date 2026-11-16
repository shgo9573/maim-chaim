import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchResultItem } from '../../src/types';
import { buildSearchResultBackgroundOpen } from '../../src/utils/searchResultContextMenu';

const results: SearchResultItem[] = [
  { bookId: 7, bookTitle: 'ספר א', categoryPath: 'תורה', lineIndex: 39, snippet: 'ג' },
  { bookId: '7', bookTitle: 'ספר א', categoryPath: 'תורה', lineIndex: 4, snippet: 'א' },
  { bookId: 9, bookTitle: 'ספר ב', categoryPath: 'נביאים', lineIndex: 12, snippet: 'ד' },
  { bookId: 7, bookTitle: 'ספר א', categoryPath: 'תורה', lineIndex: 22, snippet: 'ב' },
];

test('background opening preserves the selected result and all same-book matches', () => {
  const action = buildSearchResultBackgroundOpen(results[3], results, 'מילה');

  assert.deepEqual(action, {
    book: { id: 7, title: 'ספר א', categoryPath: 'תורה' },
    line: 22,
    highlight: { text: 'מילה', matches: [4, 22, 39] },
  });
});

test('background opening excludes results from other books', () => {
  const action = buildSearchResultBackgroundOpen(results[2], results, 'בדיקה');

  assert.deepEqual(action.highlight.matches, [12]);
  assert.equal(action.book.id, 9);
  assert.equal(action.line, 12);
});
