import { TabItem } from '../types/otzaria';

export interface SavedSession {
  savedAt: string;
  activeTabId: string;
  tabs: TabItem[];
}

const SESSION_STORAGE_KEY = 'otzaria_saved_session';
const LAST_READING_SESSION_KEY = 'otzaria_last_reading_session';

/**
 * Save current session state into localStorage and optionally cloud/server
 */
export function saveCurrentSession(tabs: TabItem[], activeTabId: string): void {
  try {
    if (!tabs || tabs.length === 0) return;

    // Filter serializable tabs
    const cleanTabs: TabItem[] = tabs.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      bookId: t.bookId,
      bookTitle: t.bookTitle,
      initialLine: t.initialLine,
      initialSearch: t.initialSearch,
      initialHighlight: t.initialHighlight,
      initialDaf: t.initialDaf
    }));

    const session: SavedSession = {
      savedAt: new Date().toISOString(),
      activeTabId,
      tabs: cleanTabs
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

    // If there is at least one open book or Tzurat HaDaf tab, save it as last reading session
    const hasBookTabs = cleanTabs.some(t => t.type === 'book' || t.type === 'tzurat-hadaf');
    if (hasBookTabs) {
      localStorage.setItem(LAST_READING_SESSION_KEY, JSON.stringify(session));
    }

    // Async save to server
    try {
      fetch('/api/user/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
        keepalive: true
      }).catch(() => {});
    } catch {}
  } catch (err: any) {
    console.warn('[SessionService] Failed to save session:', err.message);
  }
}

/**
 * Retrieve saved session from storage
 */
export function getSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return parsed as SavedSession;
      }
    }
  } catch {}
  return null;
}

/**
 * Retrieve the last session that had open books
 */
export function getLastReadingSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(LAST_READING_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return parsed as SavedSession;
      }
    }
  } catch {}
  return null;
}

/**
 * Clear saved session
 */
export function clearSavedSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LAST_READING_SESSION_KEY);
  } catch {}
}
