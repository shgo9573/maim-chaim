import { BookmarkItem } from '../types/otzaria';

export interface ReadingHistoryItem {
  id: string;
  bookId: number | string;
  bookTitle: string;
  category?: string;
  lastPosition?: number;
  lastSection?: string;
  lastReadAt: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  category?: string;
  searchedAt: string;
}

export interface PersonalNoteItem {
  id: string;
  bookId: number | string;
  bookTitle: string;
  ref?: string;
  selectedText?: string;
  noteContent: string;
  updatedAt: string;
}

const LOCAL_UID_KEY = 'otzaria_user_uuid';
const LOCAL_BOOKMARKS_KEY = 'otzaria_bookmarks_cache';
const LOCAL_HISTORY_KEY = 'otzaria_history_cache';

// Active memory listeners
const bookmarkListeners = new Set<(bookmarks: BookmarkItem[]) => void>();
const historyListeners = new Set<(history: ReadingHistoryItem[]) => void>();

let currentBookmarks: BookmarkItem[] = [];
let currentHistory: ReadingHistoryItem[] = [];
let cachedUserId: string = '';
let isInitialized = false;

function getStoredUID(): string {
  if (cachedUserId) return cachedUserId;
  try {
    const stored = localStorage.getItem(LOCAL_UID_KEY);
    if (stored) {
      cachedUserId = stored;
      return stored;
    }
  } catch {}
  return '';
}

function setStoredUID(uid: string) {
  if (!uid) return;
  cachedUserId = uid;
  try {
    localStorage.setItem(LOCAL_UID_KEY, uid);
  } catch {}
}

export function getUserToken(): string {
  if (typeof window !== 'undefined') {
    const stored = getStoredUID();
    if (stored && stored.length >= 10) return stored;

    const match = document.cookie.match(/(?:^|;\s*)otzaria_uid=([^;]+)/);
    if (match && match[1] && match[1].length >= 10) {
      const cookieUid = decodeURIComponent(match[1]);
      setStoredUID(cookieUid);
      return cookieUid;
    }

    try {
      const generated = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'usr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      setStoredUID(generated);
      document.cookie = `otzaria_uid=${generated}; Path=/; Max-Age=34560000; SameSite=Lax`;
      return generated;
    } catch {}
  }
  return '';
}


function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  const uid = getStoredUID();
  if (uid) {
    headers['X-Otzaria-UID'] = uid;
  }
  return headers;
}

// Load cached data from localStorage for instant initial paint
function loadLocalCache() {
  try {
    const rawBm = localStorage.getItem(LOCAL_BOOKMARKS_KEY);
    if (rawBm) currentBookmarks = JSON.parse(rawBm);

    const rawHist = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (rawHist) currentHistory = JSON.parse(rawHist);
  } catch {}
}

loadLocalCache();

/**
 * Initializes user session from server, synchronizing bookmarks & reading history from disk
 */
export async function initializeUserSession(): Promise<{ userId: string; bookmarks: BookmarkItem[]; history: ReadingHistoryItem[] }> {
  try {
    const res = await fetch('/api/user/data', {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      const serverUid = res.headers.get('X-Otzaria-UID');
      if (serverUid) setStoredUID(serverUid);

      const data = await res.json();
      if (data.userId) setStoredUID(data.userId);

      if (Array.isArray(data.bookmarks)) {
        currentBookmarks = data.bookmarks;
        try {
          localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
        } catch {}
        bookmarkListeners.forEach(cb => cb(currentBookmarks));
      }

      if (Array.isArray(data.history)) {
        currentHistory = data.history;
        try {
          localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(currentHistory));
        } catch {}
        historyListeners.forEach(cb => cb(currentHistory));
      }

      isInitialized = true;
      return {
        userId: data.userId || getStoredUID(),
        bookmarks: currentBookmarks,
        history: currentHistory
      };
    }
  } catch (err: any) {
    console.warn('[UserService] Server sync deferred:', err.message);
  }

  isInitialized = true;
  return {
    userId: getStoredUID(),
    bookmarks: currentBookmarks,
    history: currentHistory
  };
}

/**
 * Subscribe to bookmarks changes
 */
export function subscribeToBookmarks(onUpdate: (bookmarks: BookmarkItem[]) => void): () => void {
  bookmarkListeners.add(onUpdate);
  onUpdate(currentBookmarks);

  if (!isInitialized) {
    initializeUserSession();
  }

  return () => {
    bookmarkListeners.delete(onUpdate);
  };
}

/**
 * Add bookmark to persistent server storage
 */
export async function addBookmarkToCloud(bookmark: Omit<BookmarkItem, 'id' | 'createdAt'>): Promise<string> {
  const tempId = `bm_${Date.now()}`;
  const optimisticItem: BookmarkItem = {
    ...bookmark,
    id: tempId,
    createdAt: new Date().toISOString()
  };

  currentBookmarks = [
    optimisticItem,
    ...currentBookmarks.filter(b => !(b.bookId === bookmark.bookId && b.lineIndex === bookmark.lineIndex))
  ];
  try {
    localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
  } catch {}
  bookmarkListeners.forEach(cb => cb(currentBookmarks));

  try {
    const res = await fetch('/api/user/bookmarks', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(bookmark)
    });

    if (res.ok) {
      const serverUid = res.headers.get('X-Otzaria-UID');
      if (serverUid) setStoredUID(serverUid);

      const data = await res.json();
      if (Array.isArray(data.bookmarks)) {
        currentBookmarks = data.bookmarks;
        try {
          localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
        } catch {}
        bookmarkListeners.forEach(cb => cb(currentBookmarks));
      }
      return data.item?.id || tempId;
    }
  } catch (err: any) {
    console.warn('[UserService] Add bookmark server error:', err.message);
  }

  return tempId;
}

/**
 * Remove bookmark from persistent server storage
 */
export async function removeBookmarkFromCloud(bookmarkId: string): Promise<void> {
  currentBookmarks = currentBookmarks.filter(b => b.id !== bookmarkId);
  try {
    localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
  } catch {}
  bookmarkListeners.forEach(cb => cb(currentBookmarks));

  try {
    const res = await fetch(`/api/user/bookmarks/${encodeURIComponent(bookmarkId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      const serverUid = res.headers.get('X-Otzaria-UID');
      if (serverUid) setStoredUID(serverUid);

      const data = await res.json();
      if (Array.isArray(data.bookmarks)) {
        currentBookmarks = data.bookmarks;
        try {
          localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
        } catch {}
        bookmarkListeners.forEach(cb => cb(currentBookmarks));
      }
    }
  } catch (err: any) {
    console.warn('[UserService] Remove bookmark server error:', err.message);
  }
}

/**
 * Reading History
 */
export function subscribeToReadingHistory(onUpdate: (history: ReadingHistoryItem[]) => void): () => void {
  historyListeners.add(onUpdate);
  onUpdate(currentHistory);

  if (!isInitialized) {
    initializeUserSession();
  }

  return () => {
    historyListeners.delete(onUpdate);
  };
}

export async function saveReadingProgress(
  bookId: number | string,
  bookTitle: string,
  categoryOrPosition?: string | number,
  lastPosition: number = 1,
  lastSection: string = ''
): Promise<void> {
  const category = typeof categoryOrPosition === 'string' ? categoryOrPosition : '';
  const position = typeof categoryOrPosition === 'number' ? categoryOrPosition : lastPosition;

  const optimisticItem: ReadingHistoryItem = {
    id: `hist_${bookId}`,
    bookId,
    bookTitle,
    category,
    lastPosition: position,
    lastSection,
    lastReadAt: new Date().toISOString()
  };

  currentHistory = [
    optimisticItem,
    ...currentHistory.filter(h => String(h.bookId) !== String(bookId))
  ].slice(0, 100);

  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(currentHistory));
  } catch {}
  historyListeners.forEach(cb => cb(currentHistory));

  try {
    const res = await fetch('/api/user/history', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        bookId,
        bookTitle,
        category,
        lastPosition: position,
        lastSection
      })
    });

    if (res.ok) {
      const serverUid = res.headers.get('X-Otzaria-UID');
      if (serverUid) setStoredUID(serverUid);

      const data = await res.json();
      if (Array.isArray(data.history)) {
        currentHistory = data.history;
        try {
          localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(currentHistory));
        } catch {}
        historyListeners.forEach(cb => cb(currentHistory));
      }
    }
  } catch (err: any) {
    console.warn('[UserService] Save history server error:', err.message);
  }
}

export async function clearReadingHistoryFromCloud(): Promise<void> {
  currentHistory = [];
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify([]));
  } catch {}
  historyListeners.forEach(cb => cb([]));

  try {
    await fetch('/api/user/history', {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders()
    });
  } catch {}
}

// Search History
const searchListeners = new Set<(searches: SearchHistoryItem[]) => void>();
const LOCAL_SEARCHES_KEY = 'otzaria_searches_cache';
let currentSearches: SearchHistoryItem[] = [];

try {
  const rawSearch = localStorage.getItem(LOCAL_SEARCHES_KEY);
  if (rawSearch) currentSearches = JSON.parse(rawSearch);
} catch {}

export function subscribeToSearchHistory(onUpdate: (searches: SearchHistoryItem[]) => void): () => void {
  searchListeners.add(onUpdate);
  onUpdate(currentSearches);
  return () => {
    searchListeners.delete(onUpdate);
  };
}

export async function saveSearchHistory(query: string, category: string = ''): Promise<void> {
  if (!query.trim()) return;
  const newItem: SearchHistoryItem = {
    id: `search_${Date.now()}`,
    query: query.trim(),
    category,
    searchedAt: new Date().toISOString()
  };
  currentSearches = [newItem, ...currentSearches.filter(s => s.query !== query.trim())].slice(0, 30);
  try {
    localStorage.setItem(LOCAL_SEARCHES_KEY, JSON.stringify(currentSearches));
  } catch {}
  searchListeners.forEach(cb => cb(currentSearches));
}

export const saveSearchQuery = saveSearchHistory;

export async function removeSearchQuery(id: string): Promise<void> {
  currentSearches = currentSearches.filter(s => s.id !== id);
  try {
    localStorage.setItem(LOCAL_SEARCHES_KEY, JSON.stringify(currentSearches));
  } catch {}
  searchListeners.forEach(cb => cb(currentSearches));
}

export async function clearSearchHistory(): Promise<void> {
  currentSearches = [];
  try {
    localStorage.setItem(LOCAL_SEARCHES_KEY, JSON.stringify([]));
  } catch {}
  searchListeners.forEach(cb => cb(currentSearches));
}

// Personal Notes
const noteListeners = new Set<(notes: PersonalNoteItem[]) => void>();
const LOCAL_NOTES_KEY = 'otzaria_notes_cache';
let currentNotes: PersonalNoteItem[] = [];

try {
  const rawNotes = localStorage.getItem(LOCAL_NOTES_KEY);
  if (rawNotes) currentNotes = JSON.parse(rawNotes);
} catch {}

export function subscribeToPersonalNotes(onUpdate: (notes: PersonalNoteItem[]) => void): () => void {
  noteListeners.add(onUpdate);
  onUpdate(currentNotes);
  return () => {
    noteListeners.delete(onUpdate);
  };
}

export async function savePersonalNote(
  bookId: number | string,
  bookTitle: string,
  noteContent: string,
  ref?: string,
  selectedText?: string
): Promise<string> {
  const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const newItem: PersonalNoteItem = {
    id,
    bookId,
    bookTitle,
    ref,
    selectedText,
    noteContent,
    updatedAt: new Date().toISOString()
  };
  currentNotes = [newItem, ...currentNotes];
  try {
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(currentNotes));
  } catch {}
  noteListeners.forEach(cb => cb(currentNotes));
  return id;
}

export async function deletePersonalNote(noteId: string): Promise<void> {
  currentNotes = currentNotes.filter(n => n.id !== noteId);
  try {
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(currentNotes));
  } catch {}
  noteListeners.forEach(cb => cb(currentNotes));
}

export function getCurrentUserUUID(): string {
  return getStoredUID();
}

/**
 * Settings Synchronization (Disk-Persistent)
 */
const settingsListeners = new Set<(settings: any) => void>();
const LOCAL_SETTINGS_KEY = 'otzaria_reader_settings';

export function subscribeToUserSettings(onUpdate: (settings: any) => void): () => void {
  settingsListeners.add(onUpdate);
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) onUpdate(JSON.parse(raw));
  } catch {}

  // Fetch latest from server
  fetch('/api/user/settings', {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
    .then(r => r.json())
    .then(data => {
      if (data.settings && Object.keys(data.settings).length > 0) {
        try {
          localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(data.settings));
        } catch {}
        onUpdate(data.settings);
      }
    })
    .catch(() => {});

  return () => {
    settingsListeners.delete(onUpdate);
  };
}

export async function saveUserSettingsToCloud(settings: any): Promise<void> {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  settingsListeners.forEach(cb => cb(settings));

  try {
    await fetch('/api/user/settings', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings)
    });
  } catch (err: any) {
    console.warn('[UserService] Save settings error:', err.message);
  }
}

export async function resetUserSettingsOnCloud(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_SETTINGS_KEY);
  } catch {}

  try {
    await fetch('/api/user/reset-settings', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders()
    });
  } catch {}
}

export async function downloadBackupJson(): Promise<void> {
  try {
    const res = await fetch('/api/user/backup', {
      method: 'GET',
      credentials: 'include',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Backup failed');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otzaria_web_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error('Download backup failed:', err);
    throw err;
  }
}

export async function restoreBackupFromJson(backupData: any, mode: 'merge' | 'replace' = 'merge'): Promise<any> {
  const res = await fetch('/api/user/restore', {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ backupData, mode })
  });

  if (!res.ok) throw new Error('Restore failed');
  const result = await res.json();

  if (result.bookmarks) {
    currentBookmarks = result.bookmarks;
    try {
      localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(currentBookmarks));
    } catch {}
    bookmarkListeners.forEach(cb => cb(currentBookmarks));
  }

  if (result.history) {
    currentHistory = result.history;
    try {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(currentHistory));
    } catch {}
    historyListeners.forEach(cb => cb(currentHistory));
  }

  if (result.settings && Object.keys(result.settings).length > 0) {
    try {
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(result.settings));
    } catch {}
    settingsListeners.forEach(cb => cb(result.settings));
  }

  return result;
}
