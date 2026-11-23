import type { RecentSearchItem, ReadingHistoryItem } from '../types';
import { normalizeHe } from './text';

export type HistoryTimelineFilter = 'all' | 'books' | 'searches';

export type HistoryTimelineEntry =
  | {
      kind: 'book';
      key: string;
      timestamp: number;
      item: ReadingHistoryItem;
    }
  | {
      kind: 'search';
      key: string;
      timestamp: number;
      item: RecentSearchItem;
    };

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Combines the separately persisted reading and search histories into one
 * newest-first timeline. Search is deliberately local and never invokes the
 * search API; selecting a search entry is handled by the existing openSearch
 * action in the UI.
 */
export function buildHistoryTimeline(
  history: readonly ReadingHistoryItem[],
  recentSearches: readonly RecentSearchItem[],
  filter: HistoryTimelineFilter = 'all',
  query = '',
): HistoryTimelineEntry[] {
  const needle = normalizeHe(query.trim());
  const matches = (...values: Array<string | number | undefined>) => {
    if (!needle) return true;
    const haystack = normalizeHe(
      values
        .filter((value): value is string | number => value !== undefined)
        .join(' '),
    );
    return haystack.includes(needle);
  };

  const entries: HistoryTimelineEntry[] = [];

  if (filter !== 'searches') {
    history.forEach((item, index) => {
      if (!matches(item.bookTitle, item.category, item.lastSection, item.lastPosition)) return;
      entries.push({
        kind: 'book',
        key: `book:${item.id}`,
        timestamp: parseTimestamp(item.lastReadAt),
        item,
      });
    });
  }

  if (filter !== 'books') {
    recentSearches.forEach((item, index) => {
      if (!matches(item.query)) return;
      entries.push({
        kind: 'search',
        key: `search:${item.query}`,
        timestamp: parseTimestamp(item.searchedAt),
        item,
      });
    });
  }

  // ECMAScript sorting is stable, so equal timestamps keep their source order.
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}
