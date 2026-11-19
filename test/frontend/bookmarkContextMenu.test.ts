import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBookmarkContextMenuActions,
  normalizeBookmarkDescription,
  updateBookmarkDescriptionInList,
} from '../../src/utils/bookmarkContextMenu';

test('bookmark context menu matches the source edit and delete actions', () => {
  assert.deepEqual(
    getBookmarkContextMenuActions().map(({ id, label, destructive }) => ({ id, label, destructive })),
    [
      { id: 'edit-description', label: 'ערוך תיאור', destructive: false },
      { id: 'delete', label: 'מחק', destructive: true },
    ],
  );
});

test('bookmark descriptions are trimmed, may be cleared, and are capped at 500 characters', () => {
  assert.equal(normalizeBookmarkDescription('  תיאור  '), 'תיאור');
  assert.equal(normalizeBookmarkDescription(''), '');
  assert.equal(normalizeBookmarkDescription('x'.repeat(500)), 'x'.repeat(500));
  assert.equal(normalizeBookmarkDescription('x'.repeat(501)), null);
  assert.equal(normalizeBookmarkDescription(undefined), null);
});

test('updating a bookmark description preserves every other bookmark field', () => {
  const original = [
    { id: 'bm-1', description: 'ישן', bookId: 12, lineIndex: 7, createdAt: '2026-01-01' },
    { id: 'bm-2', description: 'אחר', bookId: 13, lineIndex: 8, createdAt: '2026-01-02' },
  ];
  const updated = updateBookmarkDescriptionInList(original, 'bm-1', 'חדש');
  assert.deepEqual(updated, [
    { id: 'bm-1', description: 'חדש', bookId: 12, lineIndex: 7, createdAt: '2026-01-01' },
    original[1],
  ]);
  assert.deepEqual(updateBookmarkDescriptionInList(updated || [], 'bm-1', ''), [
    { id: 'bm-1', bookId: 12, lineIndex: 7, createdAt: '2026-01-01' },
    original[1],
  ]);
  assert.equal(updateBookmarkDescriptionInList(original, 'missing', 'חדש'), null);
});
