import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/components/MoreScreen.tsx', import.meta.url), 'utf8');
const start = source.indexOf('function Bookmarks() {');
const end = source.indexOf('\ntype NotesImportStrategy', start);
const bookmarks = source.slice(start, end);

test('bookmark rows follow Otzaria list density and icon hierarchy', () => {
  assert.ok(start >= 0 && end > start, 'Bookmarks component is present');
  assert.ok(bookmarks.includes('bg-primary-container text-on-primary-container'));
  assert.ok(bookmarks.includes('rounded-lg border border-outline-variant bg-surface-1'));
  assert.ok(bookmarks.includes('text-base font-bold text-primary'));
  assert.ok(bookmarks.includes('line-clamp-2 text-sm text-on-variant'));
});

test('bookmark context menu uses the source menu metrics', () => {
  assert.ok(bookmarks.includes('min-w-[150px]'));
  assert.ok(bookmarks.includes('rounded-lg bg-surface-2 py-2'));
  assert.ok(bookmarks.includes('min-h-9 w-full'));
  assert.ok(bookmarks.includes('<PenLine size={18} /> : <Trash2 size={18} />'));
});

test('bookmark context actions remain available without a non-source overflow button', () => {
  assert.ok(bookmarks.includes('onContextMenu='));
  assert.ok(bookmarks.includes('isReaderContextMenuShortcut'));
  assert.ok(bookmarks.includes('startLongPress'));
  assert.ok(bookmarks.includes('data-bookmark-delete-control'));
  assert.ok(!bookmarks.includes('MoreVertical'));
  assert.ok(!bookmarks.includes('data-bookmark-menu-control'));
});
