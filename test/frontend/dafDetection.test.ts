import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detectDafBubbles, resolveRunToSegment, type DafTextItem } from '../../src/utils/dafDetection';
import type { Bubble } from '../../src/utils/dafTypes';

// Real text layer of Nedarim 47b (the Vilna page with the Ran beside the Gemara)
// plus the five Gemara lines Otzaria holds for that daf.
const page = JSON.parse(readFileSync(new URL('./fixtures/nedarim-47b.json', import.meta.url), 'utf8')) as {
  pageWidth: number;
  pageHeight: number;
  items: DafTextItem[];
  gemara: { lineIndex: number; text: string }[];
};

const box = (bubble: Bubble) =>
  bubble.rects.reduce(
    (acc, rect) => ({
      minX: Math.min(acc.minX, rect.x),
      maxX: Math.max(acc.maxX, rect.x + rect.w),
      minY: Math.min(acc.minY, rect.y),
      maxY: Math.max(acc.maxY, rect.y + rect.h),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );

test('places the Gemara bubbles on the Gemara column only', () => {
  const result = detectDafBubbles(page.items, page.pageWidth, page.pageHeight, {
    gemara: page.gemara,
    rashi: [],
    tosafot: [],
  });

  assert.equal(result.stats.gemaraFont, 13.7);
  assert.equal(result.bubbles.length, page.gemara.length);
  for (const bubble of result.bubbles) {
    assert.equal(bubble.layer, 'gemara');
    assert.equal(bubble.kind, 'segment');
    assert.ok(bubble.score >= 0.68, `line ${bubble.lineIndex} matched with ${bubble.score}`);
    const { minX, maxX, minY, maxY } = box(bubble);
    // The Gemara column runs from about 212 to 383; the Ran sits on both margins.
    assert.ok(minX >= 205 && maxX <= 390, JSON.stringify({ minX, maxX }));
    assert.ok(minY >= 95 && maxY <= 270, JSON.stringify({ minY, maxY }));
  }
});

test('only marks rows that open a real line of the book', () => {
  // Two of the five lines are missing from the book text, so their printed rows are
  // left over. A bubble that cannot point at a line in Otzaria must not exist at all —
  // otherwise clicking it shows the scan's own row instead of the commentary.
  const result = detectDafBubbles(page.items, page.pageWidth, page.pageHeight, {
    gemara: page.gemara.slice(0, 3),
    rashi: [],
    tosafot: [],
  });

  assert.ok(result.bubbles.length > 0);
  for (const bubble of result.bubbles) {
    assert.equal(bubble.kind, 'segment');
    assert.notEqual(bubble.lineIndex, null);
    assert.ok(result.stats.matched > 0);
  }
  const known = new Set(result.bubbles.map((bubble) => bubble.lineIndex));
  assert.equal(known.size, result.bubbles.length, 'each line is marked once');
  for (const line of known) assert.ok(line !== null && page.gemara.slice(0, 3).some((g) => g.lineIndex === line));
});

test('never invents bubbles from an unreadable text layer', () => {
  const letters = 'אבגדהוזחטיכלמנסעפצקרשת';
  let seed = 3;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const junk = page.items.map((item) => ({
    ...item,
    str: [...(item.str || '')].map(() => letters[Math.floor(random() * letters.length)]).join(''),
  }));

  const result = detectDafBubbles(junk, page.pageWidth, page.pageHeight, {
    gemara: page.gemara,
    rashi: [],
    tosafot: [],
  });

  // No source line may be attached to text that is not in it.
  assert.deepEqual(result.bubbles.filter((bubble) => bubble.kind === 'segment'), []);
  assert.equal(result.stats.matched, 0);
  // What is left are rows of the Gemara block itself, never the margins.
  for (const bubble of result.bubbles) {
    assert.equal(bubble.layer, 'gemara');
    const { minX, maxX } = box(bubble);
    assert.ok(minX >= 205 && maxX <= 390, JSON.stringify({ minX, maxX }));
  }
});

test('does not attach Gemara lines to a page of a different tractate', () => {
  const otherTractate = [
    { lineIndex: 1, text: 'מאימתי קורין את שמע בערבין משעה שהכהנים נכנסים לאכול בתרומתן' },
    { lineIndex: 2, text: 'עד סוף האשמורה הראשונה דברי רבי אליעזר' },
    { lineIndex: 3, text: 'וחכמים אומרים עד חצות רבן גמליאל אומר עד שיעלה עמוד השחר' },
  ];

  const result = detectDafBubbles(page.items, page.pageWidth, page.pageHeight, {
    gemara: otherTractate,
    rashi: [],
    tosafot: [],
  });

  assert.equal(result.stats.matched, 0);
  assert.deepEqual(result.bubbles.filter((bubble) => bubble.kind === 'segment'), []);
});

test('marks nothing when there is no Gemara text to open', () => {
  // Without the book's text a highlight can only show the scan's own row, and that is
  // not something the reader can open — so the page stays clean and the panel explains.
  const result = detectDafBubbles(page.items, page.pageWidth, page.pageHeight, {
    gemara: [],
    rashi: [],
    tosafot: [],
  });

  assert.deepEqual(result.bubbles, []);
  assert.equal(result.stats.matched, 0);
});

test('finds the book line a printed row was set from', () => {
  const segments = [
    { lineIndex: 90, text: 'אמר רבי יוחנן כל המברך על היין צריך לברך אחריו' },
    { lineIndex: 91, text: 'ורבי אלעזר אומר אף על הפת הוא מברך' },
    { lineIndex: 92, text: 'מאי טעמא דרבי יוחנן דכתיב וברכת את ה׳ אלהיך' },
  ];
  const starts: number[] = [];
  let offset = 0;
  for (const segment of segments) {
    starts.push(offset);
    offset += segment.text.length;
  }
  const source = { text: segments.map((segment) => segment.text).join(''), segments, starts };

  // A row that carries the first half of the second line belongs to that line.
  const half = segments[1].text.slice(0, 22);
  assert.equal(resolveRunToSegment(half, source)?.index, 1);
  // The start of the third line, another row of the page.
  assert.equal(resolveRunToSegment(segments[2].text.slice(0, 20), source)?.index, 2);
  // Text that is not in the daf gets no line at all.
  assert.equal(resolveRunToSegment('קקקק קקקק קקקק קקקק', source), null);
  assert.equal(resolveRunToSegment('קצר', source), null);
});

/**
 * A synthetic Vilna page: Gemara in the middle at 13.7pt, Rashi on the right and
 * Tosafot on the left at 11.2pt, each with its own wording.
 */
test('detects Gemara on an opening daf with only two central body rows', () => {
  const gemaraTexts = [
    'אמר רבי מאיר כל דבר שבמנין צריך מנין אחר להתירו',
    'וחכמים אומרים אין בית דין יכול לבטל דברי בית דין חברו',
  ];
  const fullWidthTexts = [
    'פירוש ארוך בצד העמוד המבאר את דברי המשנה',
    'ביאור נוסף בדברי הגמרא והרבה מילים למבחן הגופן',
    'רשימה ארוכה שנועדה להיות טקסט פרשני בשולי הדף',
  ];
  const items: DafTextItem[] = [];
  gemaraTexts.forEach((str, row) => {
    items.push({ str, x: 110, y: 110 + row * 21, w: 380, h: 11.2, fontSize: 11.2 });
  });
  fullWidthTexts.forEach((str, row) => {
    items.push({ str, x: 40, y: 350 + row * 25, w: 520, h: 12.4, fontSize: 12.4 });
  });

  const result = detectDafBubbles(items, 600, 800, {
    gemara: gemaraTexts.map((text, index) => ({ lineIndex: 200 + index, text })),
    rashi: [],
    tosafot: [],
  });

  assert.equal(result.stats.gemaraFont, 11.2);
  const bubbles = result.bubbles.filter((bubble) => bubble.layer === 'gemara');
  assert.equal(bubbles.length, 2);
  assert.deepEqual(new Set(bubbles.map((bubble) => bubble.lineIndex)), new Set([200, 201]));
});

function syntheticPage() {
  const gemaraTexts = [
    'אמר רבי יוחנן כל המברך על היין צריך לברך אחריו',
    'ורבי אלעזר אומר אף על הפת הוא מברך',
    'מאי טעמא דרבי יוחנן דכתיב וברכת את ה׳ אלהיך',
  ];
  const rashiTexts = ['פירוש רשי על היין טעם אחרון', 'רשי מבאר ענין הברכה של יין'];
  const tosafotTexts = ['תוספות מקשים על פירוש רשי מן הגמרא דלעיל', 'תוספות מתרצים קושיא זו בדרך אחרת'];

  const items: DafTextItem[] = [];
  gemaraTexts.forEach((text, row) => {
    const y = 120 + row * 20;
    items.push({ str: text.slice(0, 20), x: 215, y, w: 75, h: 13.7, fontSize: 13.7 });
    items.push({ str: text.slice(20), x: 292, y, w: 88, h: 13.7, fontSize: 13.7 });
  });
  rashiTexts.forEach((text, row) => {
    const y = 120 + row * 34;
    items.push({ str: text.slice(0, 12), x: 400, y, w: 60, h: 11.2, fontSize: 11.2 });
    items.push({ str: text.slice(12), x: 462, y, w: 70, h: 11.2, fontSize: 11.2 });
  });
  tosafotTexts.forEach((text, row) => {
    const y = 120 + row * 34;
    items.push({ str: text.slice(0, 14), x: 60, y, w: 70, h: 11.2, fontSize: 11.2 });
    items.push({ str: text.slice(14), x: 132, y, w: 68, h: 11.2, fontSize: 11.2 });
  });

  return {
    items,
    gemara: gemaraTexts.map((text, index) => ({ lineIndex: 10 + index, text })),
    rashi: rashiTexts.map((text, index) => ({ lineIndex: 20 + index, text })),
    tosafot: tosafotTexts.map((text, index) => ({ lineIndex: 30 + index, text })),
  };
}

test('separates Rashi and Tosafot into their own columns', () => {
  const synthetic = syntheticPage();
  const result = detectDafBubbles(synthetic.items, 600, 800, synthetic);

  const gemara = result.bubbles.filter((bubble) => bubble.layer === 'gemara');
  const rashi = result.bubbles.filter((bubble) => bubble.layer === 'rashi');
  const tosafot = result.bubbles.filter((bubble) => bubble.layer === 'tosafot');

  assert.ok(gemara.length > 0, 'the Gemara is always identified');
  assert.ok(rashi.length > 0, 'Rashi text on the right must be recognised');
  assert.ok(tosafot.length > 0, 'Tosafot text on the left must be recognised');

  for (const bubble of gemara) {
    const { minX, maxX } = box(bubble);
    assert.ok(minX >= 210 && maxX <= 385, `Gemara stays in its column: ${JSON.stringify({ minX, maxX })}`);
  }
  for (const bubble of rashi) {
    const { minX } = box(bubble);
    assert.ok(minX >= 390, `Rashi stays on the right margin: ${minX}`);
  }
  for (const bubble of tosafot) {
    const { maxX } = box(bubble);
    assert.ok(maxX <= 215, `Tosafot stays on the left margin: ${maxX}`);
  }
});

test('two bubbles never cover the same pixel', () => {
  const synthetic = syntheticPage();
  const result = detectDafBubbles(synthetic.items, 600, 800, synthetic);
  const rects = result.bubbles.flatMap((bubble) => bubble.rects.map((rect) => ({ ...rect, id: bubble.id })));

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a.id === b.id) continue;
      const horizontal = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const vertical = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(horizontal <= 1.5 || vertical <= 1.5, `overlap between ${a.id} and ${b.id}: ${JSON.stringify({ horizontal, vertical })}`);
    }
  }
});

// Nedarim 40b and 45b end a chapter: the Gemara shrinks to two or three lines
// while the commentary keeps running down the whole page. Counting letters alone
// then declares the commentary to be the body — and every one of its rows turns
// into a bubble across the full width of the page.
function shortGemaraPage() {
  const gemaraTexts = [
    'אלא אמר רבי יוחנן כל המברך על היין צריך לברך אחריו',
    'מאי טעמא דכתיב וברכת את ה׳ אלהיך',
    'אמר רב אחא בר מניומי תא שמע האומר לאשתו קונם',
  ];
  const items: DafTextItem[] = [];
  gemaraTexts.forEach((text, row) => {
    const y = 120 + row * 20;
    items.push({ str: text.slice(0, 22), x: 215, y, w: 80, h: 13.7, fontSize: 13.7 });
    items.push({ str: text.slice(22), x: 298, y, w: 82, h: 13.7, fontSize: 13.7 });
  });
  // Commentary set one size smaller, on both margins, far more of it than Gemara.
  for (let row = 0; row < 24; row += 1) {
    const y = 110 + row * 14;
    items.push({ str: 'פירוש המפרש על הסוגיא וטעמי הדינים', x: 45, y, w: 150, h: 11.2, fontSize: 11.2 });
    items.push({ str: 'ועוד הוסיף לבאר הענין על פי הגמרא', x: 400, y, w: 155, h: 11.2, fontSize: 11.2 });
  }

  return { items, gemara: gemaraTexts.map((text, index) => ({ lineIndex: 40 + index, text })) };
}

test('finds the Gemara even when the commentary holds more text than it', () => {
  const shortDaf = shortGemaraPage();
  const result = detectDafBubbles(shortDaf.items, 600, 800, {
    gemara: shortDaf.gemara,
    rashi: [],
    tosafot: [],
  });

  // The larger, central type is the Gemara; the smaller full-width block is not.
  assert.equal(result.stats.gemaraFont, 13.7);
  assert.equal(result.stats.commentaryFont, 11.2);
  assert.ok(result.stats.matched >= 2, `matched ${result.stats.matched} Gemara lines`);
  for (const bubble of result.bubbles) {
    assert.equal(bubble.layer, 'gemara');
    const { minX, maxX } = box(bubble);
    assert.ok(minX >= 208 && maxX <= 390, `bubble left the Gemara column: ${JSON.stringify({ minX, maxX })}`);
  }
});
