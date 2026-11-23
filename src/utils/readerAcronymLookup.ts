import { ACRONYMS_DICTIONARY } from '../data/acronyms';

/**
 * Reader context-menu acronym lookup, mirroring Otzaria's
 * DictionaryLookupRepository acronym behavior
 * (lib/tools/dictionary/repository/dictionary_lookup_repository.dart and
 * lib/tools/dictionary/dictionary_context_menu_entries.dart):
 * - the lookup runs only when the text contains an acronym mark (gershayim or geresh),
 * - normalization maps quote variants, strips nikud and decorations, and drops
 *   quote characters entirely so "רש׳י", "רש"י" and "רשי" share one key,
 * - the exact key wins; otherwise keys starting with the normalized query are
 *   offered (sorted by acronym length, then lexicographic).
 */

export interface ReaderAcronymEntry {
  acronym: string;
  meaning: string;
}

const ACRONYM_MARKS = /["״'׳’‘“”]/u;
const NIKUD_AND_TEAMIM = /[\u0591-\u05C7]/gu;
// Hebrew block (letters + nikud) and the quote characters that compose acronyms.
const WORD_CHAR = /[\u0590-\u05FF"'״’‘“”׳]/u;
const MAX_MEANING_LENGTH = 90;

export function isLikelyAcronym(raw: string | undefined | null): boolean {
  return ACRONYM_MARKS.test(raw ?? '');
}

/** Mirrors DictionaryLookupRepository._trimDecorations: strips non-Hebrew
 * decorations from the edges while keeping letters and quote marks. */
function trimDecorations(raw: string): string {
  return raw
    .trim()
    .replace(/^[^א-ת"'״׳]+/u, '')
    .replace(/[^א-ת"'״׳\s]+$/u, '');
}

/** Mirrors _normalizeAcronym + _normalizeCommon: quote variants collapse, nikud
 * is removed, whitespace compacts and quote characters are dropped. */
export function normalizeAcronymLookupKey(raw: string | undefined | null): string {
  const compact = trimDecorations(String(raw ?? ''))
    .replaceAll('״', '"')
    .replaceAll('׳', "'")
    .replaceAll('’', "'")
    .replaceAll('‘', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"');
  return compact
    .replace(NIKUD_AND_TEAMIM, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .replaceAll('"', '')
    .replaceAll('״', '')
    .replaceAll("'", '')
    .replaceAll('׳', '');
}

/** Mirrors _summarizePlainText: compact whitespace, cap to 90 characters. */
export function summarizeAcronymMeaning(meaning: string): string {
  const compact = String(meaning ?? '').replace(/\s+/gu, ' ').trim();
  return compact.length <= MAX_MEANING_LENGTH ? compact : compact.slice(0, MAX_MEANING_LENGTH - 1).trimEnd() + '…';
}

interface AcronymIndexEntry {
  original: string;
  meaning: string;
}

interface AcronymIndex {
  byKey: Map<string, AcronymIndexEntry>;
  sortedKeys: string[];
}

let cachedDictionary: Record<string, string> | null = null;
let cachedIndex: AcronymIndex | null = null;

function buildAcronymIndex(dictionary: Record<string, string>): AcronymIndex {
  if (cachedDictionary === dictionary && cachedIndex) return cachedIndex;
  const byKey = new Map<string, AcronymIndexEntry>();
  for (const [original, meaning] of Object.entries(dictionary)) {
    const key = normalizeAcronymLookupKey(original);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { original, meaning });
  }
  const sortedKeys = Array.from(byKey.keys()).sort(compareCodeUnits);
  const index: AcronymIndex = { byKey, sortedKeys };
  cachedDictionary = dictionary;
  cachedIndex = index;
  return index;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Mirrors findAcronymMatches: exact normalized key first, then prefix matches
 * ordered by acronym length and lexicographic order. */
export function findAcronymMatches(
  raw: string | undefined | null,
  dictionary: Record<string, string> = ACRONYMS_DICTIONARY,
): ReaderAcronymEntry[] {
  const normalized = normalizeAcronymLookupKey(raw);
  if (!normalized) return [];
  const index = buildAcronymIndex(dictionary);

  const exact = index.byKey.get(normalized);
  if (exact) return [{ acronym: exact.original, meaning: exact.meaning }];

  if (normalized.length < 2) return [];
  const matches: ReaderAcronymEntry[] = [];
  for (const key of index.sortedKeys) {
    if (!key.startsWith(normalized)) continue;
    const entry = index.byKey.get(key)!;
    matches.push({ acronym: entry.original, meaning: entry.meaning });
  }
  return matches.sort((a, b) => {
    const byLength = a.acronym.length - b.acronym.length;
    return byLength !== 0 ? byLength : compareCodeUnits(a.acronym, b.acronym);
  });
}

/** Word under the context-menu point, used when no text is selected — the web
 * counterpart of the source's wordAtGlobalPosition. Returns '' when the point
 * is not over text. */
export function getReaderWordAtPoint(x: number, y: number): string {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const range = documentWithCaret.caretRangeFromPoint?.(x, y) ?? null;
  if (range) {
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    const position = documentWithCaret.caretPositionFromPoint?.(x, y) ?? null;
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  }
  if (!node) return '';
  if (node.nodeType !== 3) {
    const child = node.childNodes[offset] ?? node.childNodes[offset - 1] ?? null;
    if (!child || child.nodeType !== 3) return '';
    node = child;
    offset = child.textContent?.length ?? 0;
  }
  const text = node.textContent ?? '';
  const charAt = (index: number) => text.charAt(index);
  const isWordChar = (value: string) => WORD_CHAR.test(value);
  let start = offset;
  while (start > 0 && isWordChar(charAt(start - 1))) start -= 1;
  let end = offset;
  while (end < text.length && isWordChar(charAt(end))) end += 1;
  return text.slice(start, end).trim();
}
