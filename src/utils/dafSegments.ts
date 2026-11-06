import { api } from '../api';
import { stripTags } from './dafHebrew';
import type { Segment } from './dafDetection';
import { hebrewToNumber } from './gematria';
import { parseDafHeading } from './talmud';

type DafHeading = { daf: number; amud: 'a' | 'b'; index: number };

/** Headings of a book do not change while the reader is on it, so they are read once. */
const headingCache = new Map<string, DafHeading[]>();

/**
 * `parseDafHeading` wants the word "דף". Real tables of contents also write the daf
 * as "מז." / "מז:" / "מז ע״ב", and those headings are just as usable.
 */
function parseHeadingLoose(title: string): { daf: number; amud: 'a' | 'b' } | null {
  const strict = parseDafHeading(title);
  if (strict) return strict;
  const plain = title.replace(/[\u05F3\u05F4'"`´]/g, '').replace(/\s+/g, ' ').trim();
  const match =
    plain.match(/^([\u05D0-\u05EA]{1,6})\s*([.:])\s*$/u) ||
    plain.match(/^([\u05D0-\u05EA]{1,6})\s+ע\s*([אב])\s*$/u);
  if (!match) return null;
  const daf = hebrewToNumber(match[1]);
  if (daf < 2 || daf > 200) return null;
  const amud: 'a' | 'b' = match[2] === ':' || match[2] === 'ב' ? 'b' : 'a';
  return { daf, amud };
}

async function readHeadings(bookId: number | string): Promise<DafHeading[]> {
  const key = String(bookId);
  const cached = headingCache.get(key);
  if (cached) return cached;
  const toc = await api.toc(bookId);
  const headings: DafHeading[] = [];
  for (const entry of toc) {
    const index = Number(entry.index);
    if (!Number.isFinite(index)) continue;
    const parsed = parseHeadingLoose(String(entry.title || ''));
    if (!parsed || !parsed.daf) continue;
    headings.push({ ...parsed, index });
  }
  headings.sort((a, b) => a.index - b.index);
  headingCache.set(key, headings);
  return headings;
}

/** The lines of one daf, taken from the same Otzaria book the reader uses. */
export async function loadDafSegments(
  bookId: number | string | null | undefined,
  daf: number,
  amud: 'a' | 'b',
): Promise<Segment[]> {
  if (!bookId) return [];
  const headings = await readHeadings(bookId);
  if (!headings.length) return [];

  const current =
    headings.find(entry => entry.daf === daf && entry.amud === amud) ||
    // A table of contents sometimes lists the daf once, for its first amud.
    headings.find(entry => entry.daf === daf);
  if (!current) return [];

  const next = headings.find(entry => entry.index > current.index);
  const end = next ? next.index - 1 : current.index + 48;
  const content = await api.content(bookId, current.index, end + 5);
  const body = (content.lines || []).filter(
    line => typeof line.content === 'string' && !/^\s*<h\d/i.test(line.content.trim()),
  );
  const inRange = body.filter(
    line => Number.isFinite(line.lineIndex) && line.lineIndex >= current.index && line.lineIndex <= end,
  );
  // If the book's line numbering does not agree with its table of contents, the lines
  // that were actually returned are still this daf's text.
  const chosen = inRange.length ? inRange : body;
  return chosen
    .map(line => ({ lineIndex: Number(line.lineIndex), text: stripTags(line.content) }))
    .filter(segment => Number.isFinite(segment.lineIndex) && segment.text.replace(/\s/g, '').length > 1);
}

/** Forgets the cached tables of contents, e.g. when the library was replaced. */
export function clearDafHeadingCache() {
  headingCache.clear();
}
