import { EXCLUDED_BOOK_NOTICE, isExcludedBook, rememberExcludedBookId } from './utils/bookFilter';
import type {
  BookmarkItem,
  BookItem,
  CatalogData,
  ContentResponse,
  ID,
  LinksResponse,
  ReadingHistoryItem,
  ReaderSettings,
  SearchResponse,
  SearchResultItem,
  ServerStatus,
  TocEntry,
} from './types';

export const API_BASE = '/api';

function makeUid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
}

export function getUid(): string {
  let uid = '';
  try {
    uid = localStorage.getItem('otzaria_uid') || '';
  } catch {
    /* ignore */
  }
  if (!uid) {
    uid = makeUid();
    try {
      localStorage.setItem('otzaria_uid', uid);
    } catch {
      /* ignore */
    }
  }
  return uid;
}

export function setUid(uid: string) {
  try {
    localStorage.setItem('otzaria_uid', uid);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Otzaria-UID': getUid(),
    Accept: 'application/json',
  };
  let body: BodyInit | undefined = init.body ?? undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const res = await fetch(API_BASE + path, { ...init, headers, body });
  if (!res.ok) {
    let msg = `שגיאת שרת (${res.status})`;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

const enc = (id: ID) => encodeURIComponent(String(id));

export const api = {
  status: () => request<ServerStatus>('/status'),
  searchHealth: () => request<{ status: string; engine?: string; indexedBooks?: number }>('/search-health'),
  libraryTree: async (): Promise<CatalogData> => {
    const data = await request<CatalogData>('/library/tree');
    // The server intentionally omits mapped books from the catalog; keep their
    // IDs in the shared predicate so old tabs/direct links cannot reopen them.
    for (const id of data.excludedBookIds || []) rememberExcludedBookId(id);
    return data;
  },
  bookInfo: (id: ID): Promise<{ book: BookItem; source?: string }> =>
    request<{ book: BookItem; source?: string }>(`/books/${enc(id)}/info`),
  content: (id: ID, start: number, end: number) => {
    if (isExcludedBook({ id })) return Promise.reject(new Error(EXCLUDED_BOOK_NOTICE));
    return request<ContentResponse>(`/books/${enc(id)}/content?start=${start}&end=${end}`);
  },
  toc: async (id: ID): Promise<TocEntry[]> => {
    if (isExcludedBook({ id })) throw new Error(EXCLUDED_BOOK_NOTICE);
    const r = await request<{ toc: TocEntry[] }>(`/books/${enc(id)}/toc`);
    return r.toc || [];
  },
  links: (id: ID, line: number) => {
    if (isExcludedBook({ id })) return Promise.reject(new Error(EXCLUDED_BOOK_NOTICE));
    return request<LinksResponse>(`/books/${enc(id)}/links?line=${line}`);
  },
  commentators: (id: ID) => {
    if (isExcludedBook({ id })) return Promise.reject(new Error(EXCLUDED_BOOK_NOTICE));
    return request<{ commentators: string[] }>(`/books/${enc(id)}/commentators`);
  },

  search: async (params: Record<string, unknown>): Promise<SearchResponse> => {
    const raw = await request<any>('/search', { method: 'POST', json: params });
    const arr: any[] = Array.isArray(raw) ? raw : raw.results || [];
    const normalizedResults: SearchResultItem[] = arr.map((r) => ({
      // Preserve any provenance/source metadata returned by the API. The shared
      // exclusion predicate needs it to remove mapped Wikisource results too.
      ...r,
      bookId: r.bookId ?? r.book_id ?? r.id,
      bookTitle: r.bookTitle ?? r.book_title ?? r.title ?? '',
      categoryPath: r.categoryPath ?? r.category_path ?? r.category ?? '',
      lineIndex: Number(r.lineIndex ?? r.line_index ?? r.line ?? 1),
      snippet: [r.snippet, r.text, r.content, r.lineText, r.line_text, r.textStored, r.text_stored, r.textVocalizedStored, r.text_vocalized_stored]
        .find((value) => typeof value === 'string' && value.trim().length > 0) ?? '',
      reference: r.reference ?? r.heRef ?? r.he_ref ?? '',
    }));
    const results = normalizedResults.filter((result) => !isExcludedBook(result));
    const resultsCount = Number(raw.resultsCount ?? raw.total_hits ?? raw.totalHits ?? raw.total ?? arr.length);
    return {
      query: raw.query ?? String(params.query ?? ''),
      // Keep the server's total as the pagination bound; scannedCount separately
      // tracks raw rows so filtered hits don't cause duplicate/skip pagination.
      resultsCount: Number.isFinite(resultsCount) ? Math.max(results.length, resultsCount) : results.length,
      totalBooks: raw.totalBooks ?? raw.total_books,
      results,
      scannedCount: Math.max(0, Number(raw.scannedCount ?? arr.length)),
    };
  },
  deleteHistoryItem: (id: string) =>
    request<{ success: boolean; history: ReadingHistoryItem[] }>(`/user/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  userData: () => request<any>('/user/data'),
  bookmarks: async (): Promise<BookmarkItem[]> => (await request<{ bookmarks: BookmarkItem[] }>('/user/bookmarks')).bookmarks || [],
  addBookmark: (b: Partial<BookmarkItem>) =>
    request<{ success: boolean; item: BookmarkItem; bookmarks: BookmarkItem[] }>('/user/bookmarks', { method: 'POST', json: b }),
  deleteBookmark: (id: string) =>
    request<{ success: boolean; bookmarks: BookmarkItem[] }>(`/user/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  history: async (): Promise<ReadingHistoryItem[]> => (await request<{ history: ReadingHistoryItem[] }>('/user/history')).history || [],
  saveHistory: (h: Partial<ReadingHistoryItem>) =>
    request<{ success: boolean; item?: ReadingHistoryItem; history: ReadingHistoryItem[] }>('/user/history', { method: 'POST', json: h }),
  clearHistory: () => request<{ success: boolean; history: ReadingHistoryItem[] }>('/user/history', { method: 'DELETE' }),
  linkEmail: (email: string) =>
    request<{ success: boolean; email: string; userId: string }>('/user/link-email', { method: 'POST', json: { email } }),
  getSettings: async (): Promise<Partial<ReaderSettings>> => (await request<{ settings: Partial<ReaderSettings> }>('/user/settings')).settings || {},
  saveSettings: (s: Partial<ReaderSettings>) =>
    request<{ success: boolean; settings: Partial<ReaderSettings> }>('/user/settings', { method: 'POST', json: s }),
  resetSettings: () => request<{ success: boolean; settings: Partial<ReaderSettings> }>('/user/reset-settings', { method: 'POST', json: {} }),
  backup: async (): Promise<Blob> => {
    const res = await fetch(API_BASE + '/user/backup', { headers: { 'X-Otzaria-UID': getUid() } });
    if (!res.ok) throw new Error(`שגיאת שרת (${res.status})`);
    return res.blob();
  },
  restore: (backupData: unknown, mode: 'merge' | 'replace') =>
    request<{ success: boolean; bookmarks: BookmarkItem[]; history: ReadingHistoryItem[]; settings: Partial<ReaderSettings> }>(
      '/user/restore',
      { method: 'POST', json: { backupData, mode } },
    ),

  submitFeedback: (message: string) =>
    request<{ success: boolean; message?: string }>('/feedback', { method: 'POST', json: { message } }),

  adminVerify: async (code: string): Promise<{ ok: boolean; key: string; raw: unknown }> => {
    const raw = await request<any>('/admin/verify', { method: 'POST', json: { code, adminCode: code, key: code } });
    const ok = !!(raw && (raw.success === true || raw.ok === true || raw.valid === true || raw.verified === true || raw.authenticated === true));
    const key = String(raw?.adminKey || raw?.key || raw?.token || code);
    if (!ok && raw && typeof raw === 'object' && 'error' in raw && raw.error) throw new Error(String((raw as any).message || (raw as any).error));
    return { ok: ok || !raw?.error, key, raw };
  },
  adminFetch: async <T,>(
    path: string,
    adminKey: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> => {
    const { json, ...requestInit } = init;
    const headers: Record<string, string> = { Accept: 'application/json', 'x-admin-key': adminKey };
    new Headers(requestInit.headers).forEach((value, name) => { headers[name] = value; });
    let body: BodyInit | undefined = requestInit.body ?? undefined;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const res = await fetch(API_BASE + path, { ...requestInit, headers, body });
    if (!res.ok) {
      let msg = `שגיאת שרת (${res.status})`;
      try {
        const j = await res.json();
        msg = j.message || j.error || msg;
      } catch { /* ignore */ }
      const err = new Error(msg) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  },
};
