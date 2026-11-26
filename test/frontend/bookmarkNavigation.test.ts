import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBookmarkHighlight, isBookmarkHighlightLine } from '../../src/utils/bookmarkNavigation';

const moreScreen = readFileSync(new URL('../../src/components/MoreScreen.tsx', import.meta.url), 'utf8');
const bookViewer = readFileSync(new URL('../../src/components/BookViewer.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('bookmark navigation creates a full-line target with a fresh flash token', () => {
  assert.deepEqual(createBookmarkHighlight(18, 1234), {
    line: 18,
    wholeLine: true,
    flashId: 1234,
  });
});

test('invalid bookmark line positions are rejected', () => {
  for (const line of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(createBookmarkHighlight(line, 1), null);
  }
});

test('only the exact requested line receives bookmark highlighting', () => {
  const highlight = createBookmarkHighlight(18, 1234) ?? undefined;
  assert.equal(isBookmarkHighlightLine(highlight, 18), true);
  assert.equal(isBookmarkHighlightLine(highlight, 19), false);
  assert.equal(isBookmarkHighlightLine(undefined, 18), false);
  assert.equal(isBookmarkHighlightLine({ line: 18, text: 'מילה' }, 18), false);
});

test('opening a bookmark passes its line highlight into the existing reader navigation', () => {
  assert.ok(moreScreen.includes('createBookmarkHighlight(b.lineIndex)'));
  assert.ok(moreScreen.includes('b.lineIndex, highlight)'));
  assert.ok(bookViewer.includes('bookmarkTarget={isBookmarkHighlightLine(hl, l.lineIndex)}'));
  assert.ok(bookViewer.includes('hl?.flashId'));
});

test('bookmark target feedback has a reduced-motion alternative', () => {
  assert.ok(styles.includes('.reader-bookmark-target'));
  assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(styles.includes('animation: none;'));
});
