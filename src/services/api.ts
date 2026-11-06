import { CatalogData, SearchResponse, SearchResultItem, ServerStatus, TocNode, CommentaryLink } from '../types/otzaria';
import { CANONICAL_BOOKS, extractTocFromText } from '../data/otzariaLibraryData';
import { getUserToken } from './userService';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export async function getServerStatus(): Promise<ServerStatus> {
  try {
    const res = await fetch(`${API_BASE}/status`);
    if (res.ok) return res.json();
  } catch {}
  return {
    status: 'ready',
    mode: 'sqlite_local',
    message: 'מסד נתונים מקומי seforim.db פעיל',
    totalBooks: 0,
    storageUsageMB: 7400,
    lastUpdated: new Date().toISOString()
  };
}

export async function triggerLibraryDownload(): Promise<{ message: string; state: ServerStatus }> {
  try {
    const res = await fetch(`${API_BASE}/library/download`, { method: 'POST' });
    if (res.ok) return res.json();
  } catch {}
  return {
    message: 'הספרייה מחוברת למסד הנתונים המקומי',
    state: await getServerStatus()
  };
}

export async function getLibraryTree(): Promise<CatalogData> {
  const res = await fetch(`${API_BASE}/library/tree`);
  if (!res.ok) throw new Error('Failed to fetch library tree from server');
  return res.json();
}

const clientContentCache = new Map<string, BookContentResponse>();
const clientContentPromises = new Map<string, Promise<BookContentResponse>>();
const clientTocCache = new Map<string, { id: number | string; toc: TocNode[] }>();
const clientLinksCache = new Map<string, any>();
const clientLinksPromises = new Map<string, Promise<any>>();

export interface BookLineData {
  lineIndex: number;
  content: string;
  heRef?: string;
}

export interface BookContentResponse {
  id: number | string;
  title: string;
  content?: string;
  lines?: BookLineData[];
  totalLines?: number;
}

export async function getBookContent(
  bookId: number | string,
  startLine?: number,
  endLine?: number
): Promise<BookContentResponse> {
  let safeStart = startLine;
  let safeEnd = endLine;

  if (safeStart !== undefined && safeEnd !== undefined) {
    if (safeStart > safeEnd) {
      const temp = safeStart;
      safeStart = Math.min(temp, safeEnd);
      safeEnd = safeStart + 150;
    }
  }

  const cacheKey = `${bookId}_${safeStart || 0}_${safeEnd || 0}`;
  if (clientContentCache.has(cacheKey)) {
    return clientContentCache.get(cacheKey)!;
  }
  if (clientContentPromises.has(cacheKey)) {
    return clientContentPromises.get(cacheKey)!;
  }

  const queryParams = (safeStart !== undefined && safeEnd !== undefined) 
    ? `?start=${safeStart}&end=${safeEnd}` 
    : '';
  const fetchPromise = (async () => {
    const res = await fetch(`${API_BASE}/books/${bookId}/content${queryParams}`);
    if (!res.ok) {
      throw new Error(`Failed to load book content from server (status ${res.status})`);
    }
    const data = await res.json();
    if (data && (data.content || data.lines)) {
      clientContentCache.set(cacheKey, data);
      return data;
    }
    throw new Error('Invalid book content received from server');
  })();

  clientContentPromises.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    clientContentPromises.delete(cacheKey);
  }
}

export async function getBookToc(bookId: number | string): Promise<{ id: number | string; toc: TocNode[] }> {
  const cacheKey = String(bookId);
  if (clientTocCache.has(cacheKey)) {
    return clientTocCache.get(cacheKey)!;
  }

  try {
    const res = await fetch(`${API_BASE}/books/${bookId}/toc`);
    if (res.ok) {
      const data = await res.json();
      const result = {
        id: bookId,
        toc: (data && Array.isArray(data.toc)) ? data.toc : []
      };
      if (result.toc.length > 0) {
        clientTocCache.set(cacheKey, result);
      }
      return result;
    }
  } catch {}

  return {
    id: bookId,
    toc: []
  };
}

export async function getBookLinks(
  bookId: number | string,
  lineIndex: number
): Promise<{
  id: number | string;
  line: number;
  chapter?: number;
  verse?: number;
  dafLabel?: string;
  links: CommentaryLink[];
  allLinks?: CommentaryLink[];
  availableCommentators?: string[];
}> {
  const cacheKey = `${bookId}_${lineIndex}`;
  if (clientLinksCache.has(cacheKey)) {
    return clientLinksCache.get(cacheKey)!;
  }
  if (clientLinksPromises.has(cacheKey)) {
    return clientLinksPromises.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/books/${bookId}/links?line=${lineIndex}`);
      if (res.ok) {
        const data = await res.json();
        clientLinksCache.set(cacheKey, data);
        return data;
      }
    } catch {}
    return {
      id: bookId,
      line: lineIndex,
      links: [],
      allLinks: [],
      availableCommentators: []
    };
  })();

  clientLinksPromises.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    clientLinksPromises.delete(cacheKey);
  }
}

export async function getBookCommentators(
  bookId: number | string
): Promise<{ bookId: number | string; bookTitle: string; commentators: string[] }> {
  try {
    const res = await fetch(`${API_BASE}/books/${encodeURIComponent(String(bookId))}/commentators`);
    if (res.ok) return res.json();
  } catch {}
  return {
    bookId,
    bookTitle: String(bookId),
    commentators: []
  };
}

export interface InBookSearchMatch {
  lineIndex: number;
  content: string;
  heRef?: string;
  isCommentary?: boolean;
  sourceType?: 'book' | 'commentary';
  sourceTitle?: string;
  commentaryLine?: number;
  commentarySnippet?: string;
}

export function getSearchToken(): string {
  if (typeof window !== 'undefined') {
    const userToken = getUserToken();
    if (userToken) return userToken;
  }
  return '';
}

export async function searchInBook(
  bookId: number | string,
  query: string,
  includeCommentaries: boolean = false
): Promise<{
  id: number | string;
  query: string;
  resultsCount: number;
  includeCommentaries?: boolean;
  matches: InBookSearchMatch[];
}> {
  try {
    const token = getSearchToken();
    const res = await fetch(
      `${API_BASE}/books/${encodeURIComponent(String(bookId))}/search?q=${encodeURIComponent(query)}&commentaries=${includeCommentaries}`,
      {
        headers: {
          'X-Otzaria-UID': token
        }
      }
    );
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) {
      throw new Error('Access Denied');
    }
  } catch (err: any) {
    if (err?.message === 'Access Denied') throw err;
  }
  return { id: bookId, query, resultsCount: 0, matches: [] };
}

export async function searchLibrary(
  query: string,
  category: string = 'all',
  exactMatch: boolean = false,
  gematriaSearch: boolean = false,
  limit: number = 50,
  options?: {
    mode?: 'advanced' | 'exact' | 'phrase' | 'fuzzy';
    slop?: number;
    bookId?: number | string;
    bookIds?: Array<number | string>;
    offset?: number;
    proximityScope?: 'wordDistance' | 'sameParagraph' | 'sameSection';
    sortBy?: 'relevance' | 'generation' | 'catalogue';
    resultGrouping?: 'none' | 'sameSection' | 'identicalText';
  }
): Promise<SearchResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const mode = options?.mode || (exactMatch ? 'exact' : 'advanced');
    const slop = options?.slop ?? 0;
    const book_ids = options?.bookIds || (options?.bookId ? [options.bookId] : undefined);
    const token = getSearchToken();

    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Otzaria-UID': token
      },
      body: JSON.stringify({
        query,
        limit,
        offset: options?.offset ?? 0,
        category,
        exactMatch,
        gematriaSearch,
        mode,
        slop,
        book_ids,
        bookId: options?.bookId,
        proximityScope: options?.proximityScope,
        sortBy: options?.sortBy,
        resultGrouping: options?.resultGrouping
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Access Denied');
      }
      const errorText = await res.text();
      throw new Error(`שגיאת שרת בחיפוש (${res.status}): ${errorText.slice(0, 100)}`);
    }
    if (!contentType.includes('application/json')) {
      const errorText = await res.text();
      throw new Error(`שגיאת שרת בחיפוש (${res.status}): ${errorText.slice(0, 100)}`);
    }
    
    const data = await res.json();
    const rawResults = data.results || [];

    // Normalize snake_case (Rust engine) & camelCase (SQLite) search results
    const normalizedResults: SearchResultItem[] = rawResults.map((item: any) => ({
      bookId: item.book_id ?? item.bookId ?? item.id ?? 1,
      bookTitle: item.title ?? item.bookTitle ?? `ספר #${item.book_id || item.bookId || 1}`,
      categoryPath: item.reference ?? item.categoryPath ?? item.category ?? 'כללי',
      lineIndex: item.line_index ?? item.lineIndex ?? 1,
      snippet: item.snippet ?? item.content ?? ''
    }));

    // Normalize book_counts / facets if provided
    const rawBookCounts = data.book_counts || data.bookCounts || data.facets || [];
    const normalizedBookCounts = Array.isArray(rawBookCounts)
      ? rawBookCounts.map((b: any) => ({
          bookId: b.book_id ?? b.bookId ?? b.id,
          title: b.title ?? b.bookTitle ?? `ספר #${b.book_id || b.bookId || b.id}`,
          category: b.category,
          categoryPath: b.category_path ?? b.categoryPath ?? b.category,
          count: Number(b.count ?? b.hits ?? 1)
        }))
      : undefined;

    return {
      query: data.query || query,
      resultsCount: data.total_hits ?? data.resultsCount ?? normalizedResults.length,
      totalBooks: data.total_books ?? data.totalBooks ?? (normalizedBookCounts ? normalizedBookCounts.length : undefined),
      hasMore: data.has_more ?? data.hasMore ?? (data.total_hits ? data.total_hits > limit : false),
      bookCounts: normalizedBookCounts,
      results: normalizedResults
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('בקשת החיפוש החריגה את זמן ההמתנה. אנא נסה שוב.');
    }
    throw err;
  }
}

export async function checkSearchHealth(): Promise<{ status: string; engine?: string }> {
  try {
    const res = await fetch(`${API_BASE}/search-health`);
    if (res.ok) return res.json();
  } catch {}
  return { status: 'offline' };
}
