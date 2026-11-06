import { BookItem } from '../types/otzaria.js';
import { sysLogger } from './logger.js';
import { searchDatabase } from './seforimDatabase.js';

export interface SearchResultItem {
  bookId: number | string;
  bookTitle: string;
  categoryPath: string;
  lineIndex: number;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  resultsCount: number;
  results: SearchResultItem[];
  indexingProgress?: { indexedBooks: number; totalBooks: number };
}

export function normalizeHebrewForSearch(text: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

export async function executeLibrarySearch(
  query: string,
  category?: string,
  exactMatch?: boolean,
  gematriaSearch?: boolean,
  books: BookItem[] = []
): Promise<SearchResponse> {
  try {
    const dbResults = searchDatabase(query);
    if (dbResults && dbResults.results.length > 0) {
      return {
        query,
        resultsCount: dbResults.totalHits,
        results: dbResults.results
      };
    }
  } catch (err: any) {
    sysLogger.addLog('error', 'Search', `שגיאה בחיפוש ב-DB: ${err.message}`);
  }

  return {
    query,
    resultsCount: 0,
    results: []
  };
}
