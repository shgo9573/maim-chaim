import type { Highlight, SearchResultItem } from '../types';

export interface SearchResultBackgroundOpen {
  book: {
    id: SearchResultItem['bookId'];
    title: string;
    categoryPath?: string;
  };
  line: number;
  highlight: Highlight;
}

/**
 * Builds the exact location/highlight used when opening a search result,
 * without coupling the UI action to the search request or response pipeline.
 */
export function buildSearchResultBackgroundOpen(
  result: SearchResultItem,
  results: readonly SearchResultItem[],
  query: string,
): SearchResultBackgroundOpen {
  const matches = results
    .filter((item) => String(item.bookId) === String(result.bookId))
    .map((item) => item.lineIndex)
    .sort((a, b) => a - b);

  return {
    book: {
      id: result.bookId,
      title: result.bookTitle,
      categoryPath: result.categoryPath,
    },
    line: result.lineIndex,
    highlight: { text: query, matches },
  };
}
