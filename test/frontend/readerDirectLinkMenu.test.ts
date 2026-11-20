import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getReaderDirectLinkIconKind, getReaderDirectLinkMenuItems } from '../../src/utils/readerDirectLinkMenu';

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
