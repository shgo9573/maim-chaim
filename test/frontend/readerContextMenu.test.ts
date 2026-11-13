import assert from 'node:assert/strict';
import test from 'node:test';
import { isReaderContextMenuShortcut, placeReaderContextMenu } from '../../src/utils/readerContextMenu';

test('places the menu inside the viewport and opens it above when needed', () => {
  assert.deepEqual(
    placeReaderContextMenu(
      { x: 950, y: 750 },
      { width: 300, height: 250 },
      { width: 1000, height: 800 },
    ),
    { left: 692, top: 500, maxWidth: 984, maxHeight: 784 },
  );
});

test('caps menu dimensions for a narrow viewport', () => {
  assert.deepEqual(
    placeReaderContextMenu(
      { x: 110, y: 190 },
      { width: 300, height: 400 },
      { width: 120, height: 200 },
    ),
    { left: 8, top: 8, maxWidth: 104, maxHeight: 184 },
  );
});

test('recognizes only the context-menu key and Shift+F10', () => {
  assert.equal(isReaderContextMenuShortcut('ContextMenu', false), true);
  assert.equal(isReaderContextMenuShortcut('F10', true), true);
  assert.equal(isReaderContextMenuShortcut('F10', false), false);
  assert.equal(isReaderContextMenuShortcut('Escape', true), false);
});
