import { CatalogData, CategoryNode, BookItem } from '../types/otzaria.js';
import { FoundationalBookClassifier } from './foundationalBookClassifier.js';

/**
 * Top-level categories order as canonically defined in Otzaria Flutter:
 * lib/search/utils/search_catalogue_order_helper.dart
 */
export const ORDERED_TOP_CATEGORIES = [
  'תנ"ך',
  'מדרש',
  'משנה',
  'תלמוד בבלי',
  'תלמוד ירושלמי',
  'תוספתא',
  'הלכה',
  'שו"ת',
  'קבלה',
  'סדר התפילה',
  'מחשבת ישראל',
  'חסידות',
  'ספרי מוסר',
  'מילונים וספרי יעץ',
  'לימוד יומי',
  'ספרות עזר',
  'בית שני',
];

export function normalizeOrder(order?: number | null): number {
  if (typeof order !== 'number' || isNaN(order)) return 999;
  return order >= 0 ? order : 1000 + Math.abs(order);
}

export function getTopCategoryOrder(name: string, fallbackOrder: number = 999): number {
  const norm = (name || '')
    .replace(/[\u05F4"]/g, '"')
    .replace(/[\u05F3']/g, "'")
    .trim();
  const idx = ORDERED_TOP_CATEGORIES.indexOf(norm);
  return idx >= 0 ? idx : ORDERED_TOP_CATEGORIES.length + normalizeOrder(fallbackOrder);
}

/**
 * Builds the canonical Otzaria catalogue order:
 * 1. FIRST: All foundational base texts (תנ"ך -> משנה -> תלמוד בבלי -> ירושלמי -> מדרש -> רמב"ם -> טור -> שו"ע)
 * 2. SECOND: All commentaries and remaining books (מפרשי תנ"ך -> מפרשי משנה -> מפרשי ש"ס -> נושאי כלים -> אחרונים)
 */
export function buildOtzariaCatalogueOrder(catalog: CatalogData): BookItem[] {
  if (!catalog || !catalog.books || catalog.books.length === 0) {
    return [];
  }

  // Deduplicate books by id
  const seen = new Set<string | number>();
  const uniqueBooks = catalog.books.filter(b => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  // Pre-calculate score for every unique book ONCE (O(N) instead of O(N log N * 50 operations))
  const scoreMap = new Map<string | number, number>();
  for (const book of uniqueBooks) {
    scoreMap.set(book.id, FoundationalBookClassifier.getGlobalBookOrderScore(book));
  }

  // Sort strictly using precomputed scores
  return [...uniqueBooks].sort((a, b) => {
    const scoreA = scoreMap.get(a.id) ?? 9999;
    const scoreB = scoreMap.get(b.id) ?? 9999;

    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    const orderA = normalizeOrder(a.order);
    const orderB = normalizeOrder(b.order);
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return (a.title || '').localeCompare(b.title || '', 'he');
  });
}
