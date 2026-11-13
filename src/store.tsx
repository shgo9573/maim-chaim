import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getUid } from './api';
import { buildLibrary, type Library } from './utils/library';
import { parseDeepLink } from './utils/text';
import { applyTheme } from './utils/theme';
import { EXCLUDED_BOOK_NOTICE, isExcludedBook } from './utils/bookFilter';
import { masechtaForName } from './utils/talmud';
import { currentAccount, logout as authLogout, type Account } from './auth';
import {
  insertRestoredTab,
  listRecentlyClosedTabs,
  rememberRecentlyClosedTab,
  takeRecentlyClosedTab,
  type RecentlyClosedTabEntry,
} from './utils/recentlyClosedTabs';
import { duplicateTabWithId, planTabClose } from './utils/tabContextMenu';

type BookRef = { id: ID; title: string; categoryPath?: string };
import {
  DEFAULT_SETTINGS,
  type BookItem,
  type BookmarkItem,
  type BookTab,
  type Highlight,
  type ID,
  type PersonalNote,
  type ReaderSettings,
  type RecentSearchItem,
  type ReadingHistoryItem,
  type Screen,
  type SearchTab,
  type Tab,
  type TzuratHaDafTab,
} from './types';

interface Ctx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  library: Library | null;
  libraryLoading: boolean;
  libraryError: string;
  reloadLibrary: () => void;

  settings: ReaderSettings;
  updateSettings: (p: Partial<ReaderSettings>) => void;
  resetSettings: () => Promise<void>;

  tabs: Tab[];
  recentlyClosedTabs: Tab[];
  activeTabId: string | null;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  duplicateTab: (id: string) => void;
  closeAllTabs: () => void;
  restoreClosedTab: (id: string) => void;
  clearRecentlyClosedTabs: () => void;
  updateTab: (id: string, patch: Partial<BookTab> | Partial<SearchTab> | Partial<TzuratHaDafTab>) => void;
  openTzuratHaDaf: (ref: BookRef, daf?: number, amud?: 'a' | 'b', mode?: 'reuse' | 'new' | 'replace') => boolean;
  openBook: (ref: BookRef, line?: number, highlight?: Highlight) => void;
  openBookInNewTab: (ref: BookRef, line?: number, highlight?: Highlight) => void;
  openBookInActiveTab: (ref: BookRef, line?: number) => void;
  removeHistoryItem: (item: ReadingHistoryItem) => Promise<void>;
  notes: PersonalNote[];
  saveNote: (n: Omit<PersonalNote, 'id' | 'updatedAt'> & { id?: string }) => void;
  deleteNote: (id: string) => void;
  openBookByTitle: (title: string, line?: number) => void;
  openSearch: (query?: string) => void;
  recentSearches: RecentSearchItem[];
  recordSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;

  bookmarks: BookmarkItem[];
  history: ReadingHistoryItem[];
  refreshUser: () => Promise<void>;
  addBookmark: (b: Partial<BookmarkItem>) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  saveHistory: (h: Partial<ReadingHistoryItem>) => void;
  clearHistory: () => Promise<void>;
  setBookmarks: (b: BookmarkItem[]) => void;
  setHistory: (h: ReadingHistoryItem[]) => void;

  account: Account | null;
  setAccount: (a: Account | null) => void;
  signOut: () => void;

  toast: (msg: string) => void;
  toastMsg: string;
  dialog: null | 'about';
  setDialog: (d: null | 'about') => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function resolveMainTalmudTractate(ref: BookRef, book?: BookItem) {
  const title = String(book?.title || ref.title || '').trim();
  if (!title) return null;

  // Never redirect a commentary or a secondary work whose title merely mentions a tractate.
  if (/(?:רש[״׳']?י|תוספות|חידושי|מהרש|רמב[״׳']?[םן]|רא[״׳']?ש|ריטב[״׳']?א|רשב[״׳']?א|ר[״׳']?ן|שו[״׳']?ת|הלכות|מדרש|ילקוט|פירוש|ביאור|הגהות|עיונים)/u.test(title)) {
    return null;
  }

  const baseTitle = title
    .replace(/^(?:תלמוד(?:\s+בבלי)?|בבלי|גמרא|מסכת)\s*/u, '')
    .replace(/\s*(?:[-–—:]\s*)?(?:\(|\[)?\s*(?:תלמוד\s*)?בבלי\s*(?:\)|\])?\s*$/u, '')
    .trim();
  const tractate = masechtaForName(baseTitle);
  if (!tractate) return null;

  const normalize = (value: string) => value.toLocaleLowerCase()
    .replace(/[^a-z\u0590-\u05ff]/g, '');
  const exactTractateTitle = [tractate.he, tractate.english, ...(tractate.aliases || [])]
    .some(name => normalize(name) === normalize(baseTitle));

  return exactTractateTitle ? tractate : null;
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

let tabCounter = Date.now();
const newTabId = () => 't' + tabCounter++;

export function AppProvider({ children }: { children: ReactNode }) {
  // Parse the link inside the provider (not at module evaluation) so it works
  // with client-side navigation, wrappers and every browser startup order.
  const [linkedTab] = useState<BookTab | null>(() => {
    const d = typeof window === 'undefined' ? null : parseDeepLink();
    if (!d) return null;
    const linkedBookId = /^\d+$/.test(d.book) ? Number(d.book) : d.book;
    if (isExcludedBook({ id: linkedBookId, title: d.title || d.book })) return null;
    return {
      id: newTabId(),
      kind: 'book',
      bookId: /^\d+$/.test(d.book) ? Number(d.book) : d.book,
      title: d.title || d.book,
      line: d.line,
      highlight: d.from !== undefined ? { line: d.line, from: d.from, to: d.to } : d.text ? { line: d.line, text: d.text } : undefined,
    };
  });
  const [screen, setScreenState] = useState<Screen>(() => {
    try {
      const p = window.location.pathname || '';
      const h = window.location.hash || '';
      if (p.replace(/\/$/, '').endsWith('/admin') || h.includes('admin')) return 'admin';
    } catch { /* ignore */ }
    return linkedTab ? 'reading' : load<Screen>('otz_screen', 'library');
  });
  const [library, setLibrary] = useState<Library | null>(null);
  // Start in the loading state even for deep links: direct book requests must wait
  // until the catalogue has supplied source/category metadata for the requested ID.
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [settings, setSettings] = useState<ReaderSettings>(() => ({ ...DEFAULT_SETTINGS, ...load<Partial<ReaderSettings>>('otz_settings', {}) }));
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const saved = load<Tab[]>('otz_tabs', []);
    if (!linkedTab) return saved;
    return [...saved.filter((t) => !(t.kind === 'book' && String(t.bookId) === String(linkedTab.bookId))), linkedTab];
  });
  const [activeTabId, setActiveTabId] = useState<string | null>(() => linkedTab?.id ?? load<string | null>('otz_active', null));
  const [closedTabEntries, setClosedTabEntries] = useState<RecentlyClosedTabEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const recentSearchKey = useRef(`otz_recent_searches:${getUid()}`).current;
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => load(recentSearchKey, []));
  const [toastMsg, setToastMsg] = useState('');
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [dialog, setDialog] = useState<null | 'about'>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const histRef = useRef<ReadingHistoryItem[]>([]);
  histRef.current = history;
  const libRef = useRef<Library | null>(null);
  libRef.current = library;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabRef = useRef(activeTabId);
  activeTabRef.current = activeTabId;

  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    // the hidden admin screen is never persisted – it only opens via /admin
    if (s !== 'admin') save('otz_screen', s);
    try {
      const onAdmin = (window.location.pathname || '').replace(/\/$/, '').endsWith('/admin');
      if (s === 'admin' && !onAdmin) window.history.pushState(null, '', '/admin');
      else if (s !== 'admin' && onAdmin) window.history.pushState(null, '', '/');
    } catch { /* ignore */ }
  }, []);

  // theme + seed colour + brightness
  useEffect(() => {
    applyTheme(settings.theme, settings.seedColor, Number(settings.uiBrightness) || 0);
  }, [settings.theme, settings.seedColor, settings.uiBrightness]);

  useEffect(() => {
    document.documentElement.lang = settings.interfaceLanguage === 'en' ? 'en' : 'he';
    document.documentElement.dir = settings.interfaceLanguage === 'en' ? 'ltr' : 'rtl';
  }, [settings.interfaceLanguage]);

  useEffect(() => save('otz_tabs', tabs), [tabs]);
  useEffect(() => save('otz_active', activeTabId), [activeTabId]);

  // when all tabs are closed, go back to the library
  const prevTabCount = useRef(tabs.length);
  useEffect(() => {
    if (prevTabCount.current > 0 && tabs.length === 0 && screen === 'reading') setScreen('library');
    prevTabCount.current = tabs.length;
  }, [tabs.length, screen, setScreen]);
  useEffect(() => save(recentSearchKey, recentSearches), [recentSearchKey, recentSearches]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const libraryPromise = useRef<Promise<Library | null> | null>(null);
  const loadLibrary = useCallback(() => {
    setLibraryLoading(true);
    setLibraryError('');
    const p = api
      .libraryTree()
      .then((d) => {
        const lib = buildLibrary(d);
        setLibrary(lib);
        return lib;
      })
      .catch((e) => {
        setLibraryError(e?.message || 'לא ניתן להתחבר לשרת');
        libraryPromise.current = null;
        return null;
      })
      .finally(() => setLibraryLoading(false));
    libraryPromise.current = p;
    return p;
  }, []);
  /** Loads the catalogue once, on demand. */
  const ensureLibrary = useCallback((): Promise<Library | null> => {
    if (libRef.current) return Promise.resolve(libRef.current);
    return libraryPromise.current ?? loadLibrary();
  }, [loadLibrary]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const refreshUser = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([api.bookmarks(), api.history()]);
      const hidden = new Set(settingsRef.current.hiddenHistoryIds || []);
      setBookmarks(b.filter((item) => !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category })));
      setHistory(h.filter((item) =>
        !hidden.has(item.id) && !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
      ));
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    // Load the catalogue in the background even for deep links so book IDs resolve to titles.
    loadLibrary();
    refreshUser();
    api
      .getSettings()
      .then((s) => {
        if (s && Object.keys(s).length) {
          setSettings((prev) => {
            const next = { ...prev, ...s } as ReaderSettings;
            save('otz_settings', next);
            return next;
          });
        }
      })
      .catch(() => undefined);
  }, [loadLibrary, refreshUser]);

  // Direct links render immediately while the catalogue loads in the background.
  useEffect(() => {
    if (!library && screen !== 'reading') ensureLibrary();
  }, [screen, library, ensureLibrary]);

  useEffect(() => {
    if (!library) return;
    // Old bookmarks/history can be loaded before the catalogue; re-filter them
    // once the complete source-to-book ID set has been discovered.
    setBookmarks((current) => current.filter((item) =>
      !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
    ));
    setHistory((current) => current.filter((item) =>
      !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
    ));
    setClosedTabEntries((current) => {
      const visible = current.filter(({ tab }) => {
        if (tab.kind === 'search') return true;
        const book = library.byId.get(String(tab.bookId));
        const candidate = book || {
          id: tab.bookId,
          title: tab.title,
          categoryPath: tab.kind === 'book' ? tab.category || '' : '',
        };
        return !isExcludedBook(candidate);
      });
      return visible.length === current.length ? current : visible;
    });
    const currentTabs = tabsRef.current;
    let excludedActiveTab = false;
    const visibleTabs = currentTabs
      .filter((tab) => {
        if (tab.kind !== 'book') return true;
        const book = library.byId.get(String(tab.bookId));
        const candidate = book || { id: tab.bookId, title: tab.title, categoryPath: tab.category || '' };
        const blocked = isExcludedBook(candidate);
        if (blocked && tab.id === activeTabId) excludedActiveTab = true;
        return !blocked;
      })
      .map((tab) => {
        if (tab.kind !== 'book') return tab;
        const book = library.byId.get(String(tab.bookId));
        return book && (book.title !== tab.title || book.categoryPath !== tab.category)
          ? { ...tab, title: book.title, category: book.categoryPath }
          : tab;
      });
    const tabsChanged = visibleTabs.length !== currentTabs.length ||
      visibleTabs.some((tab, index) => tab !== currentTabs[index]);
    if (tabsChanged) {
      setTabs(visibleTabs);
      setActiveTabId((currentActive) =>
        visibleTabs.some((tab) => tab.id === currentActive)
          ? currentActive
          : visibleTabs[visibleTabs.length - 1]?.id ?? null,
      );
      if (excludedActiveTab && visibleTabs.length === 0) setScreen('library');
      if (excludedActiveTab) toast(EXCLUDED_BOOK_NOTICE);
    }
  }, [library, activeTabId, setScreen, toast]);

  const updateSettings = useCallback((p: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      save('otz_settings', next);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        api.saveSettings(next).catch(() => undefined);
      }, 800);
      return next;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings({ ...DEFAULT_SETTINGS });
    save('otz_settings', DEFAULT_SETTINGS);
    try {
      await api.resetSettings();
    } catch {
      /* ignore */
    }
  }, []);

  // tabs
  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
    setScreen('reading');
  }, [setScreen]);

  const closeTabs = useCallback((ids: string[]) => {
    const plan = planTabClose(tabsRef.current, activeTabRef.current, ids);
    if (plan.closing.length === 0) return;
    setClosedTabEntries((entries) => {
      let next = entries;
      for (const entry of [...plan.closing].reverse()) {
        next = rememberRecentlyClosedTab(next, entry.tab, entry.originalIndex);
      }
      return next;
    });
    setTabs(plan.remaining);
    setActiveTabId(plan.nextActiveTabId);
  }, []);

  const closeTab = useCallback((id: string) => closeTabs([id]), [closeTabs]);

  const duplicateTab = useCallback((id: string) => {
    const source = tabsRef.current.find((tab) => tab.id === id);
    if (!source) return;
    const duplicate = duplicateTabWithId(source, newTabId());
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index < 0) return current;
      const next = [...current];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
    setActiveTabId(duplicate.id);
    setScreen('reading');
  }, [setScreen]);

  const closeAllTabs = useCallback(() => {
    const current = tabsRef.current;
    if (current.length) {
      setClosedTabEntries((entries) => {
        let next = entries;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          next = rememberRecentlyClosedTab(next, current[index], index);
        }
        return next;
      });
    }
    setTabs([]);
    setActiveTabId(null);
    setScreen('library');
  }, [setScreen]);

  const restoreClosedTab = useCallback((id: string) => {
    const taken = takeRecentlyClosedTab(closedTabEntries, id);
    if (!taken.entry) return;
    const { tab, originalIndex } = taken.entry;

    if (tab.kind !== 'search') {
      const book = libRef.current?.byId.get(String(tab.bookId));
      const candidate = book || {
        id: tab.bookId,
        title: tab.title,
        categoryPath: tab.kind === 'book' ? tab.category || '' : '',
      };
      if (isExcludedBook(candidate)) {
        setClosedTabEntries(taken.entries);
        toast(EXCLUDED_BOOK_NOTICE);
        return;
      }
    }

    setClosedTabEntries(taken.entries);
    const existing = tabsRef.current.find((current) => {
      if (tab.kind === 'book') {
        return current.kind === 'book' && String(current.bookId) === String(tab.bookId);
      }
      if (tab.kind === 'search') {
        return current.kind === 'search' && current.query.trim().toLocaleLowerCase() === tab.query.trim().toLocaleLowerCase();
      }
      return current.kind === 'tzurat-hadaf' &&
        String(current.bookId) === String(tab.bookId) &&
        current.daf === tab.daf && current.amud === tab.amud;
    });

    if (existing) {
      setActiveTabId(existing.id);
      setScreen('reading');
      return;
    }

    const restored = { ...tab, id: newTabId() } as Tab;
    setTabs((current) => insertRestoredTab(current, { tab, originalIndex }, restored));
    setActiveTabId(restored.id);
    setScreen('reading');
  }, [closedTabEntries, setScreen, toast]);

  const clearRecentlyClosedTabs = useCallback(() => setClosedTabEntries([]), []);

  const updateTab = useCallback((id: string, patch: Partial<BookTab> | Partial<SearchTab> | Partial<TzuratHaDafTab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? ({ ...t, ...patch } as Tab) : t)));
  }, []);

  const openTzuratHaDaf = useCallback((
    ref: BookRef,
    daf = 2,
    amud: 'a' | 'b' = 'a',
    mode: 'reuse' | 'new' | 'replace' = 'reuse',
  ): boolean => {
    const knownBook = libRef.current?.byId.get(String(ref.id));
    const tractate = resolveMainTalmudTractate(ref, knownBook);
    if (!tractate) return false;

    const title = `צורת הדף · ${tractate.he}`;
    const existing = mode === 'reuse'
      ? tabsRef.current.find(tab => tab.kind === 'tzurat-hadaf' && String(tab.bookId) === String(ref.id))
      : undefined;

    if (existing) {
      updateTab(existing.id, { tractate: tractate.he, title, daf, amud });
      setActiveTabId(existing.id);
    } else {
      const id = mode === 'replace'
        ? (activeTabRef.current ?? tabsRef.current[0]?.id ?? newTabId())
        : newTabId();
      const tab: TzuratHaDafTab = {
        id,
        kind: 'tzurat-hadaf',
        title,
        bookId: ref.id,
        tractate: tractate.he,
        daf: Math.max(2, Math.floor(Number(daf) || 2)),
        amud,
      };
      setTabs((current) => {
        if (mode !== 'replace') return [...current, tab];
        const index = current.findIndex((item) => item.id === id);
        return index < 0
          ? [...current, tab]
          : current.map((item, i) => i === index ? tab : item);
      });
      setActiveTabId(id);
    }
    setScreen('reading');
    return true;
  }, [setScreen, updateTab]);

  const openBook = useCallback(
    (ref: BookRef, line?: number, highlight?: Highlight) => {
      const knownBook = libRef.current?.byId.get(String(ref.id));
      if (isExcludedBook(knownBook || ref)) {
        toast(EXCLUDED_BOOK_NOTICE);
        return;
      }
      if (settings.talmudBavliOpenFormat === 'pdf' && openTzuratHaDaf(ref, 2, 'a', 'reuse')) return;
      const existing = tabsRef.current.find((t) => t.kind === 'book' && String(t.bookId) === String(ref.id)) as BookTab | undefined;
      if (existing) {
        if (line !== undefined) {
          updateTab(existing.id, { jump: { line, n: Date.now() }, highlight });
        } else if (highlight) {
          updateTab(existing.id, { highlight });
        }
        setActiveTabId(existing.id);
      } else {
        const h = histRef.current.find((x) => String(x.bookId) === String(ref.id));
        const start = line ?? h?.lastPosition ?? 1;
        const tab: BookTab = {
          id: newTabId(),
          kind: 'book',
          bookId: ref.id,
          title: ref.title,
          category: ref.categoryPath,
          line: start,
          highlight,
        };
        setTabs((ts) => [...ts, tab]);
        setActiveTabId(tab.id);
      }
      setScreen('reading');
    },
    [setScreen, updateTab, toast, settings.talmudBavliOpenFormat, openTzuratHaDaf],
  );

  const openBookInNewTab = useCallback(
    (ref: BookRef, line?: number, highlight?: Highlight) => {
      const knownBook = libRef.current?.byId.get(String(ref.id));
      if (isExcludedBook(knownBook || ref)) {
        toast(EXCLUDED_BOOK_NOTICE);
        return;
      }
      if (settings.talmudBavliOpenFormat === 'pdf' && openTzuratHaDaf(ref, 2, 'a', 'new')) return;
      const h = histRef.current.find((x) => String(x.bookId) === String(ref.id));
      const tab: BookTab = {
        id: newTabId(),
        kind: 'book',
        bookId: ref.id,
        title: ref.title,
        category: ref.categoryPath,
        line: line ?? h?.lastPosition ?? 1,
        highlight,
      };
      setTabs((ts) => [...ts, tab]);
      setActiveTabId(tab.id);
      setScreen('reading');
    },
    [setScreen, toast, settings.talmudBavliOpenFormat, openTzuratHaDaf],
  );

  const openBookInActiveTab = useCallback(
    (ref: BookRef, line?: number) => {
      const knownBook = libRef.current?.byId.get(String(ref.id));
      if (isExcludedBook(knownBook || ref)) {
        toast(EXCLUDED_BOOK_NOTICE);
        return;
      }
      if (settings.talmudBavliOpenFormat === 'pdf' && openTzuratHaDaf(ref, 2, 'a', 'replace')) return;
      const current = activeTabRef.current ?? tabsRef.current[0]?.id;
      const id = current || newTabId();
      const h = histRef.current.find((x) => String(x.bookId) === String(ref.id));
      const tab: BookTab = {
        id,
        kind: 'book',
        bookId: ref.id,
        title: ref.title,
        category: ref.categoryPath,
        line: line ?? h?.lastPosition ?? 1,
      };
      setTabs((ts) => {
        const index = ts.findIndex((t) => t.id === id);
        if (index < 0) return [...ts, tab];
        return ts.map((t, i) => (i === index ? tab : t));
      });
      setActiveTabId(id);
      setScreen('reading');
    },
    [setScreen, toast, settings.talmudBavliOpenFormat, openTzuratHaDaf],
  );

  const openBookByTitle = useCallback(
    (title: string, line?: number) => {
      if (isExcludedBook({ title })) {
        toast(EXCLUDED_BOOK_NOTICE);
        return;
      }
      ensureLibrary().then((lib) => {
        let b: BookItem | undefined = lib?.byTitle.get(title);
        if (!b && lib) {
          const t = title.trim();
          b = lib.books.find((x) => x.title === t || x.title.includes(t));
        }
        if (b && !isExcludedBook(b)) openBook(b, line);
        else if (b) toast(EXCLUDED_BOOK_NOTICE);
        else toast('הספר "' + title + '" לא נמצא בספרייה');
      });
    },
    [openBook, toast, ensureLibrary],
  );

  // a link pasted into an already-open tab only changes the fragment (no reload) – handle it live
  useEffect(() => {
    const onHash = () => {
      const d = parseDeepLink();
      if (!d) return;
      const bookId = /^\d+$/.test(d.book) ? Number(d.book) : d.book;
      const highlight: Highlight | undefined =
        d.from !== undefined ? { line: d.line, from: d.from, to: d.to } : d.text ? { line: d.line, text: d.text } : undefined;
      const known = libRef.current?.byId.get(String(bookId));
      openBook({ id: bookId, title: known?.title || d.title || d.book, categoryPath: known?.categoryPath }, d.line, highlight);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [openBook]);

  const openSearch = useCallback(
    (query?: string) => {
      // The global Search button and its keyboard shortcuts call this without a
      // query: each click should open a fresh search tab, not reuse an old one.
      if (query === undefined) {
        const tab: SearchTab = { id: newTabId(), kind: 'search', title: 'חיפוש', query: '' };
        setTabs((ts) => [...ts, tab]);
        setActiveTabId(tab.id);
      } else {
        const existing = tabsRef.current.find((t) => t.kind === 'search') as SearchTab | undefined;
        if (existing) {
          updateTab(existing.id, { query });
          setActiveTabId(existing.id);
        } else {
          const tab: SearchTab = { id: newTabId(), kind: 'search', title: 'חיפוש', query };
          setTabs((ts) => [...ts, tab]);
          setActiveTabId(tab.id);
        }
      }
      setScreen('reading');
    },
    [setScreen, updateTab],
  );

  const recordSearch = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setRecentSearches((current) => {
      const next = [
        { query: q, searchedAt: new Date().toISOString() },
        ...current.filter((x) => x.query.trim().toLocaleLowerCase() !== q.toLocaleLowerCase()),
      ].slice(0, 30);
      save(recentSearchKey, next);
      return next;
    });
  }, [recentSearchKey]);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches((current) => current.filter((x) => x.query !== query));
  }, []);

  const clearRecentSearches = useCallback(() => setRecentSearches([]), []);

  // notes (stored inside the user's settings object on the server + localStorage)
  const notes = useMemo(() => (Array.isArray(settings.personalNotes) ? settings.personalNotes : []), [settings.personalNotes]);
  const saveNote = useCallback(
    (n: Omit<PersonalNote, 'id' | 'updatedAt'> & { id?: string }) => {
      setSettings((prev) => {
        const cur = Array.isArray(prev.personalNotes) ? prev.personalNotes : [];
        const id = n.id || 'note_' + Date.now().toString(36);
        const item: PersonalNote = { ...n, id, updatedAt: new Date().toISOString() };
        const next = { ...prev, personalNotes: [item, ...cur.filter((x) => x.id !== id)] };
        save('otz_settings', next);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => api.saveSettings(next).catch(() => undefined), 500);
        return next;
      });
    },
    [],
  );
  const deleteNote = useCallback((id: string) => {
    setSettings((prev) => {
      const cur = Array.isArray(prev.personalNotes) ? prev.personalNotes : [];
      const next = { ...prev, personalNotes: cur.filter((x) => x.id !== id) };
      save('otz_settings', next);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => api.saveSettings(next).catch(() => undefined), 500);
      return next;
    });
  }, []);

  const removeHistoryItem = useCallback(
    async (item: ReadingHistoryItem) => {
      // optimistic local removal
      setHistory((h) => h.filter((x) => x.id !== item.id));
      try {
        const r = await api.deleteHistoryItem(item.id);
        if (r.history) setHistory(r.history.filter((entry) =>
          !isExcludedBook({ id: entry.bookId, title: entry.bookTitle, categoryPath: entry.category }),
        ));
      } catch {
        // no per-item endpoint on the server yet – remember it as hidden in the user's settings
        setSettings((prev) => {
          const hidden = Array.isArray(prev.hiddenHistoryIds) ? prev.hiddenHistoryIds : [];
          const next = { ...prev, hiddenHistoryIds: Array.from(new Set([...hidden, item.id, String(item.bookId)])) };
          save('otz_settings', next);
          api.saveSettings(next).catch(() => undefined);
          return next;
        });
      }
    },
    [],
  );

  const addBookmark = useCallback(
    async (b: Partial<BookmarkItem>) => {
      try {
        const r = await api.addBookmark(b);
        setBookmarks((r.bookmarks || []).filter((entry) =>
          !isExcludedBook({ id: entry.bookId, title: entry.bookTitle, categoryPath: entry.category }),
        ));
        toast('הסימניה נוספה');
      } catch (e) {
        toast((e as Error).message || 'שגיאה בהוספת סימניה');
      }
    },
    [toast],
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      try {
        const r = await api.deleteBookmark(id);
        setBookmarks((r.bookmarks || []).filter((item) =>
          !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
        ));
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [toast],
  );

  const saveHistory = useCallback((h: Partial<ReadingHistoryItem>) => {
    api
      .saveHistory(h)
      .then((r) => {
        if (!r.history) return;
        const hidden = new Set(settingsRef.current.hiddenHistoryIds || []);
        // Only keep visible-book history entries; never reintroduce a restricted source.
        const visibleHistory = r.history.filter((item) =>
          !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
        );
        // reading a book again un-hides it
        if (hidden.size && h.bookId !== undefined && hidden.has(String(h.bookId))) {
          setSettings((prev) => {
            const next = { ...prev, hiddenHistoryIds: (prev.hiddenHistoryIds || []).filter((x) => x !== String(h.bookId) && x !== r.item?.id) };
            save('otz_settings', next);
            return next;
          });
        }
        setHistory(visibleHistory.filter((x) => !hidden.has(x.id) || String(x.bookId) === String(h.bookId)));
      })
      .catch(() => undefined);
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      const r = await api.clearHistory();
      setHistory((r.history || []).filter((entry) =>
        !isExcludedBook({ id: entry.bookId, title: entry.bookTitle, categoryPath: entry.category }),
      ));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);

  // when the signed-in user changes, pull that profile from the server
  const accountRef = useRef<string | null>(account?.uid ?? null);
  useEffect(() => {
    if (accountRef.current === (account?.uid ?? null)) return;
    accountRef.current = account?.uid ?? null;
    refreshUser();
    api
      .getSettings()
      .then((s) => {
        if (s && Object.keys(s).length) {
          setSettings((prev) => {
            const next = { ...DEFAULT_SETTINGS, ...prev, ...s } as ReaderSettings;
            save('otz_settings', next);
            return next;
          });
        }
      })
      .catch(() => undefined);
  }, [account?.uid, refreshUser]);

  const signOut = useCallback(() => {
    authLogout();
    setAccount(null);
    setBookmarks([]);
    setHistory([]);
    setSettings({ ...DEFAULT_SETTINGS });
    save('otz_settings', DEFAULT_SETTINGS);
    toast('התנתקת מהחשבון');
  }, [toast]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        const lastClosed = closedTabEntries[closedTabEntries.length - 1];
        if (lastClosed) restoreClosedTab(lastClosed.tab.id);
        return;
      }
      // Command/Ctrl+R must remain the browser's native refresh shortcut, even when the Hebrew keyboard layout makes e.key equal to 'ר'.
      if (e.code === 'KeyR') return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        l: () => setScreen('library'),
        m: () => setScreen('more'),
        ',': () => setScreen('settings'),
        o: () => setScreen('find'),
        q: () => openSearch(),
        // hebrew keyboard fallbacks
        'ך': () => setScreen('library'),
        'ר': () => setScreen('reading'),
        'צ': () => setScreen('more'),
        'ם': () => setScreen('find'),
        '/': () => openSearch(),
      };
      const fn = map[k];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setScreen, openSearch, closedTabEntries, restoreClosedTab]);

  const setVisibleBookmarks = useCallback((items: BookmarkItem[]) => {
    setBookmarks(items.filter((item) =>
      !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
    ));
  }, []);

  const setVisibleHistory = useCallback((items: ReadingHistoryItem[]) => {
    setHistory(items.filter((item) =>
      !isExcludedBook({ id: item.bookId, title: item.bookTitle, categoryPath: item.category }),
    ));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      screen, setScreen, library, libraryLoading, libraryError, reloadLibrary: loadLibrary,
      settings, updateSettings, resetSettings,
      tabs, recentlyClosedTabs: listRecentlyClosedTabs(closedTabEntries), activeTabId, setActiveTab, closeTab, closeTabs, duplicateTab, closeAllTabs, restoreClosedTab, clearRecentlyClosedTabs, updateTab, openTzuratHaDaf, openBook, openBookInNewTab, openBookInActiveTab, openBookByTitle, openSearch,
      recentSearches, recordSearch, removeRecentSearch, clearRecentSearches,
      bookmarks, history, refreshUser, addBookmark, removeBookmark, saveHistory, clearHistory,
      setBookmarks: setVisibleBookmarks, setHistory: setVisibleHistory,
      removeHistoryItem, notes, saveNote, deleteNote,
      account, setAccount, signOut,
      toast, toastMsg, dialog, setDialog,
    }),
    [screen, setScreen, library, libraryLoading, libraryError, loadLibrary, settings, updateSettings, resetSettings, tabs, closedTabEntries, activeTabId, setActiveTab, closeTab, closeTabs, duplicateTab, closeAllTabs, restoreClosedTab, clearRecentlyClosedTabs, updateTab, openTzuratHaDaf, openBook, openBookInNewTab, openBookInActiveTab, openBookByTitle, openSearch, recentSearches, recordSearch, removeRecentSearch, clearRecentSearches, bookmarks, history, refreshUser, addBookmark, removeBookmark, saveHistory, clearHistory, setVisibleBookmarks, setVisibleHistory, removeHistoryItem, notes, saveNote, deleteNote, account, signOut, toast, toastMsg, dialog],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
