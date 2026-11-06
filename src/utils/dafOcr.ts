import { decodePdfString } from './dafHebrew';

/**
 * Searching the scanned page itself: the text layer of a Vilna PDF *is* its OCR.
 * The strings arrive in the old MacRoman/Latin-1 Hebrew encoding, split into
 * chunks with no reliable spaces, so both the page and the query are reduced to
 * bare letters before comparing them.
 */
export type OcrTextItem = { str?: string; x: number; y: number; w: number; h: number; fontSize: number };

export type OcrWord = { text: string; x: number; y: number; w: number; h: number };

export type OcrRow = {
  /** Readable text of the whole row, words separated by a single space. */
  text: string;
  /** True for the right-to-left print: the first word is the rightmost one. */
  words: OcrWord[];
  /** Letters only: what the query is compared against. */
  norm: string;
  /** For every letter of `norm`, the word it came from. */
  wordOfLetter: number[];
  /** For every word, its character offset inside `text`. */
  offsetOfWord: number[];
};

export type OcrMatch = {
  /** Snippet around the hit, taken from the readable row. */
  snippet: string;
  /** Where the hit is printed, in page coordinates. */
  rects: { x: number; y: number; w: number; h: number }[];
};

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** Letters only, final letters folded, plus the offset each letter came from. */
export function normalizeForSearch(value: string): { text: string; map: number[] } {
  const letters: string[] = [];
  const map: number[] = [];
  [...value].forEach((char, index) => {
    if (!/[\u05D0-\u05EA]/.test(char)) return;
    letters.push(FINALS[char] || char);
    map.push(index);
  });
  return { text: letters.join(''), map };
}

/** Groups one page's text-layer items into printed rows, rightmost word first. */
export function buildOcrRows(items: OcrTextItem[]): OcrRow[] {
  const words: OcrWord[] = [];
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    const text = decodePdfString(item.str)
      // The old encoding leaves control bytes behind; they are not searchable text.
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim();
    if (!text) continue;
    words.push({ text, x: item.x, y: item.y, w: item.w, h: item.h });
  }
  if (!words.length) return [];

  // A row is a set of words sharing a baseline; the tolerance follows the type size.
  const heights = words.map((word) => Math.max(4, word.h || 0)).sort((a, b) => a - b);
  const tolerance = Math.max(2, heights[Math.floor(heights.length / 2)] * 0.55);
  const sorted = [...words].sort((a, b) => a.y - b.y);
  const bands: { words: OcrWord[]; baseline: number }[] = [];
  for (const word of sorted) {
    const band = bands[bands.length - 1];
    if (band && Math.abs(word.y - band.baseline) <= tolerance) {
      band.words.push(word);
      band.baseline = band.words.reduce((sum, entry) => sum + entry.y, 0) / band.words.length;
    } else {
      bands.push({ words: [word], baseline: word.y });
    }
  }

  return bands.map(({ words: band }) => {
    const rowWords = [...band].sort((a, b) => b.x - a.x);
    const textParts: string[] = [];
    const offsetOfWord: number[] = [];
    let offset = 0;
    for (const word of rowWords) {
      offsetOfWord.push(offset);
      textParts.push(word.text);
      offset += word.text.length + 1;
    }
    const text = textParts.join(' ');
    const letters: string[] = [];
    const wordOfLetter: number[] = [];
    rowWords.forEach((word, index) => {
      for (const char of word.text) {
        if (!/[\u05D0-\u05EA]/.test(char)) continue;
        letters.push(FINALS[char] || char);
        wordOfLetter.push(index);
      }
    });
    return { text, words: rowWords, norm: letters.join(''), wordOfLetter, offsetOfWord };
  });
}

/** Every occurrence of `query` on one page, with the rectangles it covers. */
export function findOcrMatches(items: OcrTextItem[], query: string, limit = 50): OcrMatch[] {
  const needle = normalizeForSearch(query).text;
  if (needle.length < 2) return [];
  const matches: OcrMatch[] = [];
  for (const row of buildOcrRows(items)) {
    let from = row.norm.indexOf(needle);
    while (from >= 0 && matches.length < limit) {
      const lastWord = row.wordOfLetter[Math.min(from + needle.length - 1, row.wordOfLetter.length - 1)];
      const firstWord = row.wordOfLetter[from];
      const hitWords = firstWord === undefined || lastWord === undefined ? [] : row.words.slice(firstWord, lastWord + 1);
      // The snippet is cut around the words that matched, not around the row edges.
      const start = Math.max(0, (row.offsetOfWord[firstWord] ?? 0) - 40);
      const end = Math.min(row.text.length, (row.offsetOfWord[lastWord] ?? 0) + (row.words[lastWord]?.text.length ?? 0) + 60);
      matches.push({
        snippet: `${start > 0 ? '…' : ''}${row.text.slice(start, end)}${end < row.text.length ? '…' : ''}`,
        rects: hitWords.map((word) => ({ x: word.x, y: word.y, w: word.w, h: word.h })),
      });
      from = row.norm.indexOf(needle, from + 1);
      if (matches.length >= limit) break;
    }
    if (matches.length >= limit) break;
  }
  return matches;
}

/** Reads one PDF page's text layer as OCR words, in page coordinates. */
export async function readPageTextItems(page: {
  getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number; convertToViewportPoint: (x: number, y: number) => number[] };
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<OcrTextItem[]> {
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const text = await page.getTextContent();
  const items: OcrTextItem[] = [];
  for (const raw of text.items as any[]) {
    if (!raw || typeof raw.str !== 'string' || !raw.transform) continue;
    const transform = raw.transform as number[];
    const [x, baseline] = viewport.convertToViewportPoint(transform[4], transform[5]);
    const height = Math.max(0.4, Number(raw.height) || Math.hypot(transform[2] || 0, transform[3] || 0));
    items.push({
      str: raw.str,
      x,
      y: baseline - height,
      w: Math.abs(Number(raw.width) || 0),
      h: height,
      fontSize: Math.hypot(transform[2] || 0, transform[3] || 0) || Math.abs(transform[3] || 0),
    });
  }
  return items;
}

/** Maps a daf and amud to its 1-based page inside the bundled tractate PDF. */
export function dafToPage(daf: number, amud: 'a' | 'b', startDaf: number): number {
  return Math.max(1, (daf - startDaf) * 2 + (amud === 'a' ? 1 : 2));
}

/** Maps a page of the bundled tractate PDF back to its daf and amud. */
export function pageToDaf(page: number, startDaf: number): { daf: number; amud: 'a' | 'b' } {
  const index = Math.max(0, Math.floor(page) - 1);
  return { daf: startDaf + Math.floor(index / 2), amud: index % 2 === 0 ? 'a' : 'b' };
}

/** One page of the tractate's OCR index: the readable text of the page. */
export type OcrPage = { daf: number; amud: 'a' | 'b'; page: number; text: string };

export type TextHit = { snippet: string; index: number };

/**
 * Every place `query` appears in one page of text.
 * The search runs on letters alone, then the snippet is cut out of the readable text.
 */
export function findInText(text: string, query: string, limit = 5): TextHit[] {
  const needle = normalizeForSearch(query).text;
  if (needle.length < 2) return [];
  const haystack = normalizeForSearch(text);
  const hits: TextHit[] = [];
  let from = haystack.text.indexOf(needle);
  while (from >= 0 && hits.length < limit) {
    const startChar = haystack.map[from] ?? 0;
    const lastLetter = haystack.map[Math.min(from + needle.length - 1, haystack.map.length - 1)] ?? startChar;
    const left = Math.max(0, startChar - 40);
    const right = Math.min(text.length, lastLetter + 60);
    hits.push({
      snippet: `${left > 0 ? '…' : ''}${text.slice(left, right).replace(/\s+/g, ' ').trim()}${right < text.length ? '…' : ''}`,
      index: startChar,
    });
    from = haystack.text.indexOf(needle, from + 1);
  }
  return hits;
}
