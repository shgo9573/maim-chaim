import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { placeReaderCopyAsSubmenu } from '../../src/utils/readerCopyAsMenu';

test('תת-תפריט העתק כ נפתח לצד שמאל ב-RTL ומיושר לראש שורת האב', () => {
  assert.deepEqual(
    placeReaderCopyAsSubmenu(
      { left: 340, right: 376, top: 120, bottom: 156 },
      { width: 190, height: 240 },
      { width: 800, height: 600 },
      'rtl',
    ),
    {
      left: 146,
      top: 120,
      maxWidth: 320,
      maxHeight: 584,
      opensToRight: false,
    },
  );
});

test('תת-תפריט העתק כ נפתח לצד ימין ב-LTR', () => {
  assert.deepEqual(
    placeReaderCopyAsSubmenu(
      { left: 340, right: 376, top: 120, bottom: 156 },
      { width: 190, height: 240 },
      { width: 800, height: 600 },
      'ltr',
    ),
    {
      left: 380,
      top: 120,
      maxWidth: 320,
      maxHeight: 584,
      opensToRight: true,
    },
  );
});

test('תת-תפריט מחליף צד כשאין מקום בכיוון הקריאה', () => {
  const position = placeReaderCopyAsSubmenu(
    { left: 100, right: 140, top: 80, bottom: 116 },
    { width: 190, height: 240 },
    { width: 800, height: 600 },
    'rtl',
  );

  assert.equal(position.opensToRight, true);
  assert.equal(position.left, 144);
});

test('תת-תפריט מוגבל למסך צר ולגובה הזמין בלי לחרוג מהשוליים', () => {
  assert.deepEqual(
    placeReaderCopyAsSubmenu(
      { left: 90, right: 120, top: 180, bottom: 198 },
      { width: 300, height: 300 },
      { width: 180, height: 200 },
      'rtl',
    ),
    {
      left: 8,
      top: 8,
      maxWidth: 164,
      maxHeight: 184,
      opensToRight: false,
    },
  );
});

test('רכיב העתק כ משתמש בחלונית צד נפרדת ובסמלי העתקה ותצוגה מובחנים', () => {
  const component = readFileSync(
    new URL('../../src/components/ReaderCopyAsMenu.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

  assert.match(component, /createPortal/);
  assert.match(component, /ChevronLeft/);
  assert.match(component, /ChevronRight/);
  assert.match(component, /CheckCircle2/);
  assert.match(component, /<Eye size=\{18\}/);
  assert.match(component, /zIndex: 12020/);
  assert.doesNotMatch(component, /border-r border-outline-variant pr-2/);
  assert.match(css, /@source "\.\/components\/ReaderCopyAsMenu\.tsx";/);
});
