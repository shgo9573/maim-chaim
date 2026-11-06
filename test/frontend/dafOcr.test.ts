import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildOcrRows,
  dafToPage,
  findInText,
  findOcrMatches,
  normalizeForSearch,
  pageToDaf,
  readPageTextItems,
  type OcrTextItem,
} from '../../src/utils/dafOcr';

// The real text layer of Nedarim 47b: the OCR of the scanned Vilna page, still in
// the old MacRoman encoding the print uses.
const page = JSON.parse(readFileSync(new URL('./fixtures/nedarim-47b.json', import.meta.url), 'utf8')) as {
  pageWidth: number;
  pageHeight: number;
  items: OcrTextItem[];
};

test('groups the printed page into rows, right to left', () => {
  const rows = buildOcrRows(page.items);
  assert.ok(rows.length > 40, `rows ${rows.length}`);
  // The page header of Nedarim 47b names the chapter and the masechet.
  assert.ok(rows[0].text.includes('השותפין'), rows[0].text);
  assert.ok(rows[0].text.includes('נדרים'), rows[0].text);
  for (const row of rows) {
    const xs = row.words.map((word) => word.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => b - a), 'the first word of a row is the rightmost one');
  }
});

test('finds a phrase in the OCR and knows where it is printed', () => {
  const hits = findOcrMatches(page.items, 'דחילופין');
  assert.ok(hits.length > 0, 'the word on this daf is found');
  for (const hit of hits) {
    assert.ok(hit.rects.length > 0, 'every hit has somewhere to be marked');
    for (const rect of hit.rects) {
      assert.ok(rect.x >= 0 && rect.x <= page.pageWidth, `x ${rect.x}`);
      assert.ok(rect.y >= 0 && rect.y <= page.pageHeight, `y ${rect.y}`);
      assert.ok(rect.w > 0 && rect.h > 0);
    }
  }
});

test('matches across the gaps the OCR leaves between words', () => {
  // The scan writes this phrase as one run with stray control bytes inside it.
  const hits = findOcrMatches(page.items, 'אמר רב אחא');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].snippet.includes('אמר רב אחא'), hits[0].snippet);
});

test('ignores nikud, gershayim and final letters on both sides', () => {
  // Final letters fold to their regular form, so ם and מ compare equal.
  assert.equal(normalizeForSearch('שָׁלוֹם, עוֹלָם!').text, 'שלומעולמ');
  assert.equal(normalizeForSearch('השותפין').text, normalizeForSearch('הַשּׁוּתָּפִין').text);
  const plain = findOcrMatches(page.items, 'דחילופין');
  const decorated = findOcrMatches(page.items, 'דְּחִילוּפִין');
  assert.equal(decorated.length, plain.length);
});

test('returns nothing for a word that is not on the page', () => {
  assert.deepEqual(findOcrMatches(page.items, 'קונטרס'), []);
  assert.deepEqual(findOcrMatches(page.items, 'א'), [], 'a single letter is not a search');
});

test('maps PDF pages to daf and amud in both directions', () => {
  assert.deepEqual(pageToDaf(1, 2), { daf: 2, amud: 'a' });
  assert.deepEqual(pageToDaf(2, 2), { daf: 2, amud: 'b' });
  assert.deepEqual(pageToDaf(92, 2), { daf: 47, amud: 'b' });
  for (const pageNumber of [1, 7, 92, 180]) {
    const { daf, amud } = pageToDaf(pageNumber, 2);
    assert.equal(dafToPage(daf, amud, 2), pageNumber);
  }
});

test('reads a PDF page into OCR words in page coordinates', async () => {
  const page = {
    getViewport: () => ({
      width: 600,
      height: 800,
      convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
    }),
    getTextContent: async () => ({
      items: [
        { str: 'ÌÈ¯„', transform: [13.7, 0, 0, 13.7, 200, 700], width: 40, height: 14 },
        { str: '   ', transform: [13.7, 0, 0, 13.7, 250, 700], width: 10, height: 14 },
        { str: '×', transform: [13.7, 0, 0, 13.7, 260, 700], width: 6, height: 14 },
      ],
    }),
  };

  const items = await readPageTextItems(page);
  assert.equal(items.length, 3);
  assert.equal(items[0].x, 200);
  assert.equal(items[0].y, 800 - 700 - 14, 'y is the top edge, not the baseline');
  assert.equal(items[0].fontSize, 13.7);
  // The same decoding the bubbles use turns the old encoding back into Hebrew.
  const rows = buildOcrRows(items);
  assert.ok(rows.length >= 1);
});

test('finds a phrase inside a page of the OCR index, with a readable snippet', () => {
  const text = [
    'מסכת נדרים · דף מז עמוד ב',
    'או דילמא משום דחילופין כגידולין דמי לא שנא הוא ולא שנא חברו',
    'אמר רב אחא בר מניומי תא שמע האומר לאשתו קונם שאני נהנה ליך',
  ].join('\n');

  const hits = findInText(text, 'דחילופין');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].snippet.includes('דחילופין'), hits[0].snippet);
  // The phrase is found even when the query is written with nikud and gershayim.
  assert.equal(findInText(text, 'שֶׁאֲנִי נֶהֱנֶה').length, 1);
  assert.equal(findInText(text, 'מעילה').length, 0);
  // The snippet starts at the hit, not at the beginning of the page.
  assert.ok(hits[0].index > 0);
});

test('an index hit reports the same page the reader has to open', () => {
  for (const [page, expected] of [[1, 'a'], [2, 'b'], [92, 'b'], [180, 'b']] as const) {
    const { daf, amud } = pageToDaf(page, 2);
    assert.equal(dafToPage(daf, amud, 2), page);
    assert.equal(amud, expected);
  }
});
