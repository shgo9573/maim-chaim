import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getReaderDirectLinkIconKind, getReaderDirectLinkMenuItems, placeReaderDirectLinkMenu } from '../../src/utils/readerDirectLinkMenu';

test('direct-link menu always offers a section link and a whole-section highlight', () => {
  assert.deepEqual(
    getReaderDirectLinkMenuItems({ line: 12, sectionWordCount: 7 }),
    [
      {
        id: 'section',
        label: 'העתק קישור למקטע זה',
        line: 12,
        disabled: false,
      },
      {
        id: 'section-mark',
        label: 'העתק קישור עם הדגשת המקטע',
        line: 12,
        from: 0,
        to: 6,
        disabled: false,
      },
    ],
  );
});

test('selected text adds a deep link that preserves its line and word range', () => {
  const items = getReaderDirectLinkMenuItems({
    line: 12,
    sectionWordCount: 9,
    selection: { text: 'מילים מסומנות', line: 13, from: 2, to: 3 },
  });
  assert.deepEqual(items[2], {
    id: 'text-mark',
    label: 'העתק קישור עם הדגשת הטקסט',
    line: 13,
    from: 2,
    to: 3,
    disabled: false,
  });
});

test('empty selections and invalid word ranges do not produce text-highlight links', () => {
  const empty = getReaderDirectLinkMenuItems({
    line: 1,
    sectionWordCount: 2,
    selection: { text: '   ', line: 1, from: 0, to: 0 },
  });
  const invalid = getReaderDirectLinkMenuItems({
    line: 1,
    sectionWordCount: 2,
    selection: { text: 'מילה', line: 1, from: -1, to: 0 },
  });
  assert.equal(empty.length, 2);
  assert.equal(invalid.length, 2);
});

test('whole-section highlight is disabled when the section has no words', () => {
  const items = getReaderDirectLinkMenuItems({ line: 4, sectionWordCount: 0 });
  assert.equal(items[1]?.disabled, true);
  assert.equal(items[1]?.from, 0);
  assert.equal(items[1]?.to, 0);
});

test('invalid section lines do not produce direct-link actions', () => {
  assert.deepEqual(getReaderDirectLinkMenuItems({ line: 0, sectionWordCount: 4 }), []);
  assert.deepEqual(getReaderDirectLinkMenuItems({ line: Number.NaN, sectionWordCount: 4 }), []);
});


test('direct-link choices retain distinct icon roles matching Otzaria link glyphs', () => {
  assert.equal(getReaderDirectLinkIconKind('section'), 'document');
  assert.equal(getReaderDirectLinkIconKind('section-mark'), 'marker');
  assert.equal(getReaderDirectLinkIconKind('text-mark'), 'alef');
});

test('reader context-menu components are registered for Tailwind source scanning', () => {
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /@source "\.\/components\/ReaderContextIconRow\.tsx";/);
  assert.match(css, /@source "\.\/components\/ReaderDirectLinkMenu\.tsx";/);
});


test('direct-link submenu uses its measured intrinsic width and keeps the trigger edge in RTL/LTR', () => {
  const anchor = { left: 350, right: 390, top: 100, bottom: 124 };
  const size = { width: 180, height: 100 };
  const viewport = { width: 600, height: 600 };
  assert.deepEqual(placeReaderDirectLinkMenu(anchor, size, viewport, 'rtl'), { left: 210, top: 128, maxWidth: 320, maxHeight: 584 });
  assert.deepEqual(placeReaderDirectLinkMenu(anchor, size, viewport, 'ltr'), { left: 350, top: 128, maxWidth: 320, maxHeight: 584 });
});

test('direct-link submenu opens above when needed and clamps to a narrow viewport', () => {
  const placement = placeReaderDirectLinkMenu(
    { left: 270, right: 310, top: 250, bottom: 270 },
    { width: 300, height: 180 },
    { width: 320, height: 300 },
    'rtl',
  );
  assert.deepEqual(placement, { left: 10, top: 66, maxWidth: 304, maxHeight: 284 });
});

test('direct-link submenu retains the source minimum width without exceeding a very narrow viewport', () => {
  const regular = placeReaderDirectLinkMenu({ left: 200, right: 240, top: 20, bottom: 44 }, { width: 90, height: 72 }, { width: 400, height: 500 }, 'ltr');
  const narrow = placeReaderDirectLinkMenu({ left: 20, right: 40, top: 20, bottom: 44 }, { width: 90, height: 72 }, { width: 120, height: 300 }, 'rtl');
  assert.equal(regular.left, 200);
  assert.equal(regular.maxWidth, 320);
  assert.equal(narrow.maxWidth, 104);
  assert.equal(narrow.maxHeight, 284);
});