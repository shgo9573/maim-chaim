import { useMemo, useRef, useState, useEffect, useLayoutEffect, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BookOpen, BookText, Check, ChevronLeft, Folder, Info, LayoutGrid, List, MoreVertical, Plus, RefreshCw, Search, X, Home } from 'lucide-react';
import { useApp } from '../store';
import { Btn, EmptyState, IconBtn, Spinner } from './ui';
import { normalizeHe } from '../utils/text';
import { api } from '../api';
import type { TocEntry } from '../types';
import { findShasTractate, parseDafString } from './TzuratHaDafModal';
import { DailyStudyStrip } from './DailyStudy';
import { t } from '../i18n';
import { placeReaderContextMenu } from '../utils/readerContextMenu';
import { getLibraryBookContextMenuAction, reconcileLibraryBookSelection, selectLibraryBookRange, shouldOfferTextOpenContextAction, toggleLibraryBookSelection } from '../utils/libraryContextMenu';
import type { BookItem } from '../types';
import BookInfoDialog from './BookInfoDialog';

interface TocNode {
  entry: TocEntry;
  children: TocNode[];
}

interface BookContextMenuState {
  bookId: string;
  x: number;
  y: number;
}

function buildTocTree(entries: TocEntry[], bookTitle: string): TocNode[] {
  const cleaned = entries.filter((e, i) => !(i === 0 && e.title.trim() === bookTitle.trim() && entries[1]?.index === e.index));
  const roots: TocNode[] = [];
  const stack: { level: number; node: TocNode }[] = [];
  for (const entry of cleaned) {
    const level = entry.level ?? 1;
    const item: TocNode = { entry, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(item);
    else roots.push(item);
    stack.push({ level, node: item });
  }
  return roots;
}

function tocLabel(nodes: TocNode[]): string {
  const first = nodes[0]?.entry.title || '';
  const match = first.match(/^(פרק|סימן|דף|הלכה|משנה|פסוק|סעיף|מזמור|שער|מאמר|חלק|פרשת)/u);
  const labels: Record<string, string> = { פרק: 'פרקים', סימן: 'סימנים', דף: 'דפים', הלכה: 'הלכות', משנה: 'משניות', פסוק: 'פסוקים', סעיף: 'סעיפים', מזמור: 'מזמורים', שער: 'שערים', מאמר: 'מאמרים', חלק: 'חלקים', פרשת: 'פרשות' };
  return match ? labels[match[1]] || 'חלקים' : 'חלקים';
}

function ChapterGrid({ label, nodes, selectedIndex, onPick, onOpen }: { label: string; nodes: TocNode[]; selectedIndex: number | null; onPick: (node: TocNode) => void; onOpen: (node: TocNode) => void }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? nodes : nodes.slice(0, 250);
  return (
    <section>
      <div className="mb-2 text-xs font-medium text-on-variant">{label} ({nodes.length})</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((item) => (
          <button
            key={item.entry.index}
            type="button"
            onClick={() => onPick(item)}
            onDoubleClick={() => onOpen(item)}
            className={`min-h-12 rounded-xl border px-2 py-2 text-sm transition ${selectedIndex === item.entry.index ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface hover:bg-surface-3'}`}
            title={`שורה ${item.entry.index}`}
          >
            <span className="line-clamp-2">{item.entry.title.replace(/^(פרק|סימן|דף|הלכה|משנה|פסוק|סעיף)\s+/u, '')}</span>
          </button>
        ))}
      </div>
      {nodes.length > 250 && <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-xs text-primary hover:underline">{showAll ? 'הצג פחות' : `הצג עוד (${nodes.length - 250})`}</button>}
    </section>
  );
}

export default function LibraryBrowser() {
  const { library, libraryLoading, libraryError, reloadLibrary, settings, updateSettings, openBook, openBooksInReadingTabs, openTzuratHaDaf, history, screen, removeHistoryItem, clearHistory, setScreen } = useApp();
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [infoBook, setInfoBook] = useState<BookItem | null>(null);
  const [previewBook, setPreviewBook] = useState<BookItem | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocPath, setTocPath] = useState<TocNode[]>([]);
  const [selectedLine, setSelectedLine] = useState(1);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [bookContextMenu, setBookContextMenu] = useState<BookContextMenuState | null>(null);
  const [bookContextMenuPosition, setBookContextMenuPosition] = useState<{ left: number; top: number; maxWidth: number; maxHeight: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bookContextMenuRef = useRef<HTMLDivElement>(null);
  const bookContextMenuActionRef = useRef<HTMLButtonElement>(null);
  const bookMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const bookTouchTimerRef = useRef<number | null>(null);
  const bookTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);
  const selectionGestureRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setTocPath([]);
    if (!previewBook) {
      setToc([]);
      setTocLoading(false);
      setSelectedLine(1);
      return;
    }
    setTocLoading(true);
    api.toc(previewBook.id)
      .then((entries) => {
        if (cancelled) return;
        setToc(entries);
        setSelectedLine(entries[0]?.index ?? 1);
      })
      .catch(() => {
        if (!cancelled) setToc([]);
      })
      .finally(() => { if (!cancelled) setTocLoading(false); });
    return () => { cancelled = true; };
  }, [previewBook?.id]);

  const tocTree = useMemo(() => previewBook ? buildTocTree(toc, previewBook.title) : [], [toc, previewBook]);
  const tocLevels: { label: string; nodes: TocNode[] }[] = [];
  if (tocTree.length) {
    tocLevels.push({ label: tocLabel(tocTree), nodes: tocTree });
    let current = tocTree;
    for (const chosen of tocPath) {
      const found = current.find((item) => item.entry.index === chosen.entry.index);
      if (!found?.children.length) break;
      tocLevels.push({ label: tocLabel(found.children), nodes: found.children });
      current = found.children;
    }
  }
  const pickTocNode = (depth: number, item: TocNode) => {
    setTocPath((previous) => [...previous.slice(0, depth), item]);
    setSelectedLine(item.entry.index);
  };
  const openPreviewAt = (line: number) => {
    if (!previewBook) return;
    if (settings.talmudBavliOpenFormat === 'pdf' && findShasTractate(previewBook.title)) {
      const entry = toc.find((item) => item.index === line);
      if (entry) {
        const label = /^דף\s/u.test(entry.title.trim()) ? entry.title : `דף ${entry.title}`;
        const parsed = parseDafString(label);
        openTzuratHaDaf(previewBook, parsed.dafNum, parsed.amud, 'replace');
        return;
      }
    }
    openBook(previewBook, line);
  };

  const goHome = () => {
    setPath('');
    setQuery('');
    setPreviewBook(null);
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (screen === 'library') inputRef.current?.focus();
  }, [screen]);

  const node = library?.nodes.get(path) ?? library?.root;
  const grid = settings.libraryViewMode === 'grid';
  const lang = settings.interfaceLanguage;

  const selectedBooks = useMemo(
    () => selectedBookIds
      .map((id) => library?.books.find((book) => String(book.id) === id))
      .filter((book): book is BookItem => Boolean(book)),
    [selectedBookIds, library],
  );

  useEffect(() => {
    if (!library) return;
    const availableIds = library.books.map((book) => String(book.id));
    setSelectedBookIds((current) => reconcileLibraryBookSelection(current, availableIds));
    setSelectionAnchorId((current) => current && availableIds.includes(current) ? current : null);
  }, [library]);

  useEffect(() => {
    selectionGestureRef.current = selectedBookIds.length > 0;
  }, [selectedBookIds.length]);

  useEffect(() => {
    if (selectedBookIds.length === 0 || bookContextMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelectedBookIds([]);
      setSelectionAnchorId(null);
      selectionGestureRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedBookIds.length, bookContextMenu]);

  const closeBookContextMenu = (restoreFocus = false) => {
    setBookContextMenu(null);
    setBookContextMenuPosition(null);
    if (restoreFocus) {
      const target = bookMenuReturnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    }
  };

  const openBookContextMenu = (book: BookItem, x: number, y: number, returnFocus: HTMLElement | null) => {
    bookMenuReturnFocusRef.current = returnFocus;
    setBookContextMenuPosition(null);
    setBookContextMenu({ bookId: String(book.id), x, y });
  };

  const getVisibleBookIds = () => (results ?? node?.books ?? []).map((book) => String(book.id));

  useLayoutEffect(() => {
    if (!bookContextMenu || !bookContextMenuRef.current) return;
    const rect = bookContextMenuRef.current.getBoundingClientRect();
    setBookContextMenuPosition(placeReaderContextMenu(
      { x: bookContextMenu.x, y: bookContextMenu.y },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [bookContextMenu]);

  useEffect(() => {
    if (!bookContextMenu) return;
    const placeMenu = () => {
      const menu = bookContextMenuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      setBookContextMenuPosition(placeReaderContextMenu(
        { x: bookContextMenu.x, y: bookContextMenu.y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    const frame = window.requestAnimationFrame(() => {
      placeMenu();
      bookContextMenuActionRef.current?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      if (!bookContextMenuRef.current?.contains(event.target as Node)) closeBookContextMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeBookContextMenu(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', placeMenu);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', placeMenu);
    };
  }, [bookContextMenu]);

  useEffect(() => () => {
    if (bookTouchTimerRef.current !== null) window.clearTimeout(bookTouchTimerRef.current);
  }, []);

  const clearBookTouchTimer = () => {
    if (bookTouchTimerRef.current !== null) {
      window.clearTimeout(bookTouchTimerRef.current);
      bookTouchTimerRef.current = null;
    }
    bookTouchStartRef.current = null;
  };

  const handleBookContextMenu = (book: BookItem, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target : null;
    openBookContextMenu(book, event.clientX, event.clientY, target?.closest('button') ?? null);
  };

  const handleBookPointerDown = (book: BookItem, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-book-action]')) return;
    clearBookTouchTimer();
    bookTouchStartRef.current = { x: event.clientX, y: event.clientY };
    const returnFocus = target?.closest('button') ?? null;
    const x = event.clientX;
    const y = event.clientY;
    bookTouchTimerRef.current = window.setTimeout(() => {
      bookTouchTimerRef.current = null;
      bookTouchStartRef.current = null;
      longPressTriggeredRef.current = true;
      openBookContextMenu(book, x, y, returnFocus);
    }, 560);
  };

  const handleBookPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = bookTouchStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) clearBookTouchTimer();
  };

  const handleBookPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (bookTouchTimerRef.current !== null) clearBookTouchTimer();
    if (longPressTriggeredRef.current) event.preventDefault();
  };

  const handleBookClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!longPressTriggeredRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    longPressTriggeredRef.current = false;
  };

  const handleBookClick = (book: BookItem, event: ReactMouseEvent<HTMLButtonElement>) => {
    const id = String(book.id);
    const selectionActive = selectedBookIds.length > 0;
    if (selectionActive || event.shiftKey || event.ctrlKey || event.metaKey) {
      if (event.shiftKey) {
        setSelectedBookIds((current) => selectLibraryBookRange(current, getVisibleBookIds(), selectionAnchorId, id));
      } else {
        setSelectedBookIds((current) => toggleLibraryBookSelection(current, id));
      }
      setSelectionAnchorId(id);
      selectionGestureRef.current = true;
      return;
    }
    selectionGestureRef.current = false;
    setPreviewBook(book);
  };

  const handleBookDoubleClick = (book: BookItem, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (selectionGestureRef.current || selectedBookIds.length > 0) {
      event.preventDefault();
      return;
    }
    openBook(book);
  };

  const handleBookKeyDown = (book: BookItem, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    openBookContextMenu(book, Math.max(8, rect.right - 220), rect.bottom, event.currentTarget);
  };

  const bookInteractionProps = (book: BookItem) => ({
    onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => handleBookContextMenu(book, event),
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => handleBookPointerDown(book, event),
    onPointerMove: handleBookPointerMove,
    onPointerUp: handleBookPointerUp,
    onPointerCancel: () => {
      clearBookTouchTimer();
      longPressTriggeredRef.current = false;
    },
    onClickCapture: handleBookClickCapture,
  });

  const handleOpenSelectedBooks = () => {
    if (selectedBooks.length === 0) return;
    const booksToOpen = selectedBooks;
    setSelectedBookIds([]);
    setSelectionAnchorId(null);
    selectionGestureRef.current = false;
    openBooksInReadingTabs(booksToOpen);
  };

  const results = useMemo(() => {
    const q = normalizeHe(query.trim());
    if (!q || !library) return null;
    const words = q.split(/\s+/);
    const out: BookItem[] = [];
    for (const b of library.books) {
      const hay = normalizeHe(b.title + ' ' + (b.author || '') + ' ' + b.categoryPath);
      if (words.every((w) => hay.includes(w))) {
        out.push(b);
        if (out.length >= 300) break;
      }
    }
    // title matches first
    out.sort((a, b) => {
      const at = normalizeHe(a.title).includes(q) ? 0 : 1;
      const bt = normalizeHe(b.title).includes(q) ? 0 : 1;
      return at - bt;
    });
    return out;
  }, [query, library]);

  const crumbs = path ? path.split('/') : [];

  const recent = useMemo(() => history.slice(0, 10), [history]);

  const BookRow = ({ b, showPath }: { b: BookItem; showPath?: boolean }) =>
    grid ? (
      <div className={`relative min-w-0 rounded-2xl ${selectedBookIds.includes(String(b.id)) ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''}`} {...bookInteractionProps(b)}>
        <button
          type="button"
          data-book-primary
          aria-pressed={selectedBookIds.includes(String(b.id))}
          aria-keyshortcuts="ContextMenu Shift+F10"
          onClick={(event) => handleBookClick(b, event)}
          onDoubleClick={(event) => handleBookDoubleClick(b, event)}
          onKeyDown={(event) => handleBookKeyDown(b, event)}
          title={settings.showBookPreview ? [b.author, b.heDesc].filter(Boolean).join(' – ') : undefined}
          className={`flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border p-3 pt-8 text-center transition hover:bg-surface-3 ${selectedBookIds.includes(String(b.id)) ? 'border-primary bg-primary-container/35' : 'border-outline-variant bg-surface-1'}`}
        >
          <BookText size={26} className="text-primary" />
          <span className="line-clamp-2 text-sm leading-tight">{b.title}</span>
          {selectedBookIds.includes(String(b.id)) && <span className="absolute bottom-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary"><Check size={13} /></span>}
        </button>
        <button
          type="button"
          data-book-action
          onClick={() => setInfoBook(b)}
          title="מידע על הספר"
          aria-label={`מידע על הספר ${b.title}`}
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs text-primary hover:bg-surface-3"
        >
          <Info size={14} /><span>מידע</span>
        </button>
        <button
          type="button"
          data-book-action
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openBookContextMenu(b, Math.max(8, rect.right - 220), rect.bottom, event.currentTarget);
          }}
          aria-label={lang === 'en' ? `Options for ${b.title}` : `אפשרויות לספר ${b.title}`}
          aria-haspopup="menu"
          aria-expanded={bookContextMenu?.bookId === String(b.id)}
          title={lang === 'en' ? 'Book options' : 'אפשרויות ספר'}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-on-variant hover:bg-surface-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MoreVertical size={15} />
        </button>
      </div>
    ) : (
      <div className={`flex w-full items-center gap-1 rounded-xl transition hover:bg-surface-3 ${selectedBookIds.includes(String(b.id)) ? 'bg-primary-container/25 ring-1 ring-primary' : ''}`} {...bookInteractionProps(b)}>
        <button
          type="button"
          data-book-primary
          aria-pressed={selectedBookIds.includes(String(b.id))}
          aria-keyshortcuts="ContextMenu Shift+F10"
          onClick={(event) => handleBookClick(b, event)}
          onDoubleClick={(event) => handleBookDoubleClick(b, event)}
          onKeyDown={(event) => handleBookKeyDown(b, event)}
          title={settings.showBookPreview ? b.heDesc || undefined : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-2.5 text-start"
        >
          <BookText size={22} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px]">{b.title}</span>
            {(showPath || b.author) && (
              <span className="block truncate text-xs text-on-variant">
                {showPath ? b.categoryPath : ''}
                {showPath && b.author ? ' • ' : ''}
                {b.author}
              </span>
            )}
          </span>
          {selectedBookIds.includes(String(b.id)) && <Check size={16} className="shrink-0 text-primary" />}
        </button>
        <button
          type="button"
          data-book-action
          onClick={() => setInfoBook(b)}
          title="מידע על הספר"
          aria-label={`מידע על הספר ${b.title}`}
          className="mr-1 shrink-0 rounded-full p-2 text-on-variant hover:bg-surface-2 hover:text-primary"
        >
          <Info size={18} />
        </button>
        <button
          type="button"
          data-book-action
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openBookContextMenu(b, Math.max(8, rect.right - 220), rect.bottom, event.currentTarget);
          }}
          aria-label={lang === 'en' ? `Options for ${b.title}` : `אפשרויות לספר ${b.title}`}
          aria-haspopup="menu"
          aria-expanded={bookContextMenu?.bookId === String(b.id)}
          title={lang === 'en' ? 'Book options' : 'אפשרויות ספר'}
          className="mr-1 shrink-0 rounded-full p-2 text-on-variant hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MoreVertical size={17} />
        </button>
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2.5 md:px-5">
        {path && !query ? (
          <IconBtn title="חזרה" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}>
            <ArrowRight size={22} />
          </IconBtn>
        ) : (
          <IconBtn title="לראש הספרייה" onClick={goHome}>
            <Home size={20} />
          </IconBtn>
        )}
        <div className="relative max-w-2xl flex-1">
          <Search size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-variant" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              // hidden admin entry: typing /admin jumps to the admin screen
              if (v.trim() === '/admin') {
                setQuery('');
                setScreen('admin');
                return;
              }
              setQuery(v);
            }}
            placeholder={t('איתור ספר בספרייה', lang)}
            className="h-11 w-full rounded-full border border-outline-variant bg-surface-2 pr-11 pl-10 text-[15px] outline-none transition focus:border-primary focus:bg-surface"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-variant">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mr-auto flex items-center gap-1">
          <IconBtn title={grid ? 'תצוגת רשימה' : 'תצוגת רשת'} onClick={() => updateSettings({ libraryViewMode: grid ? 'list' : 'grid' })}>
            {grid ? <List size={20} /> : <LayoutGrid size={20} />}
          </IconBtn>
          <IconBtn title="רענן ספרייה" onClick={reloadLibrary}>
            <RefreshCw size={19} />
          </IconBtn>
        </div>
      </div>

      {/* breadcrumbs */}
      {!query && (
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 text-sm text-on-variant md:px-6">
          <button onClick={() => setPath('')} className={`rounded px-1.5 py-0.5 hover:bg-surface-3 ${!path ? 'font-medium text-on-surface' : ''}`}>
            {t('ספרייה', lang)}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1 whitespace-nowrap">
              <ChevronLeft size={14} />
              <button
                onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}
                className={`rounded px-1.5 py-0.5 hover:bg-surface-3 ${i === crumbs.length - 1 ? 'font-medium text-on-surface' : ''}`}
              >
                {c}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden flex-col lg:flex-row">
      <div ref={listRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pb-6 md:px-5">
        {libraryLoading && !library && <Spinner label="טוען את הספרייה..." />}
        {libraryError && !library && (
          <EmptyState icon={<BookText size={56} />} title="לא ניתן לטעון את הספרייה" hint={libraryError}>
            <Btn variant="filled" onClick={reloadLibrary}>
              <RefreshCw size={16} /> נסה שוב
            </Btn>
          </EmptyState>
        )}

        {library && results && (
          <div className="fade-in mx-auto max-w-5xl">
            <div className="px-3 py-2 text-sm text-on-variant">
              {results.length === 0 ? 'לא נמצאו ספרים' : `נמצאו ${results.length}${results.length >= 300 ? '+' : ''} ספרים`}
            </div>
            <div className={grid ? 'grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 lg:grid-cols-5' : ''}>
              {results.map((b) => (
                <BookRow key={String(b.id)} b={b} showPath />
              ))}
            </div>
          </div>
        )}

        {library && !results && node && (
          <div className="fade-in mx-auto max-w-5xl">
            {!path && <DailyStudyStrip />}
            {!path && recent.length > 0 && (
              <div className="mb-4 px-2 pt-1">
                <div className="mb-2 flex items-center justify-between px-1 text-sm text-on-variant">
                  <span>{t('המשך קריאה', lang)}</span>
                  <button onClick={() => { if (confirm('למחוק את כל היסטוריית הקריאה?')) clearHistory(); }} className="text-xs text-primary hover:underline">
                    {t('נקה היסטוריה', lang)}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recent.map((h) => (
                    <div key={h.id} className="group relative min-w-[160px] max-w-[210px] shrink-0 rounded-2xl bg-sec-container text-on-sec-container transition hover:brightness-95">
                      <button onClick={() => openBook({ id: h.bookId, title: h.bookTitle, categoryPath: h.category }, h.lastPosition)} className="w-full px-4 py-2.5 pl-8 text-start">
                        <div className="truncate text-sm font-medium">{h.bookTitle}</div>
                        <div className="truncate text-xs opacity-70">{h.lastSection || `שורה ${h.lastPosition ?? 1}`}</div>
                      </button>
                      <button
                        onClick={() => removeHistoryItem(h)}
                        className="absolute left-1.5 top-1.5 rounded-full p-1 opacity-50 hover:bg-surface/50 hover:opacity-100"
                        title="הסר מההיסטוריה"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={grid ? 'grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 lg:grid-cols-5' : ''}>
              {node.children.map((c) =>
                grid ? (
                  <button
                    key={c.path}
                    onClick={() => setPath(c.path)}
                    className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-sec-container p-3 text-center text-on-sec-container transition hover:brightness-95"
                  >
                    <Folder size={28} />
                    <span className="line-clamp-2 text-sm font-medium leading-tight">{c.name}</span>
                    <span className="text-[11px] opacity-70">{c.count} ספרים</span>
                  </button>
                ) : (
                  <button
                    key={c.path}
                    onClick={() => setPath(c.path)}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-start transition hover:bg-surface-3"
                  >
                    <Folder size={22} className="shrink-0 text-primary" fill="currentColor" fillOpacity={0.15} />
                    <span className="flex-1 truncate text-[17px] font-medium">{c.name}</span>
                    <span className="text-xs text-on-variant">{c.count}</span>
                    <ChevronLeft size={16} className="text-on-variant" />
                  </button>
                ),
              )}
              {node.books.map((b) => (
                <BookRow key={String(b.id)} b={b} />
              ))}
            </div>
            {node.children.length === 0 && node.books.length === 0 && (
              <EmptyState icon={<Folder size={52} />} title="התיקייה ריקה" />
            )}
          </div>
        )}
        {selectedBooks.length > 0 && (
          <div className="sticky bottom-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant bg-surface-2/95 px-4 py-3 shadow-[0_-4px_14px_rgba(0,0,0,0.08)] backdrop-blur motion-reduce:transition-none">
            <span role="status" aria-live="polite" className="text-sm font-medium text-on-surface">
              {lang === 'en' ? `${selectedBooks.length} books selected` : `${selectedBooks.length} ספרים נבחרו`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBookIds([]);
                  setSelectionAnchorId(null);
                  selectionGestureRef.current = false;
                }}
                className="rounded-lg px-3 py-2 text-sm text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {lang === 'en' ? 'Clear selection' : 'ביטול בחירה'}
              </button>
              <button
                type="button"
                onClick={handleOpenSelectedBooks}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <BookOpen size={16} />
                {lang === 'en' ? 'Open selected' : 'פתח נבחרים'}
              </button>
            </div>
          </div>
        )}
      </div>
      {previewBook && (
        <aside className="flex max-h-[45vh] min-h-0 w-full max-w-none shrink-0 flex-col border-t border-outline-variant bg-surface-1 lg:max-h-none lg:w-[390px] lg:max-w-[390px] lg:border-t-0 lg:border-r">
          <div className="flex items-center gap-3 border-b border-outline-variant p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container"><BookOpen size={21} /></div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-medium">{previewBook.title}</h2>
              <p className="truncate text-xs text-on-variant">{previewBook.categoryPath}</p>
            </div>
            <button type="button" onClick={() => setPreviewBook(null)} className="rounded-full p-2 text-on-variant hover:bg-surface-3" title="סגור"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {tocLoading && <Spinner label="טוען תוכן עניינים..." />}
            {!tocLoading && tocLevels.length === 0 && <p className="text-xs text-on-variant">אין תוכן עניינים לספר זה.</p>}
            {tocLevels.map((level, depth) => (
              <ChapterGrid
                key={depth}
                label={level.label}
                nodes={level.nodes}
                selectedIndex={tocPath[depth]?.entry.index ?? null}
                onPick={(item) => pickTocNode(depth, item)}
                onOpen={(item) => openPreviewAt(item.entry.index)}
              />
            ))}
            {toc.length > 0 && (
              <label className="block text-xs text-on-variant">
                מספר שורה
                <input type="number" min={1} value={selectedLine} onChange={(event) => setSelectedLine(Math.max(1, Number(event.target.value) || 1))} className="mt-1 h-9 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary" />
              </label>
            )}
          </div>
          <div className="border-t border-outline-variant p-3">
            <Btn variant="filled" className="w-full" onClick={() => openPreviewAt(selectedLine)}>פתח {tocPath.length ? tocPath[tocPath.length - 1].entry.title : 'ספר'}</Btn>
            <p className="mt-1 text-center text-[11px] text-on-variant">לחיצה אחת מציגה ראשי פרקים נוספים; לחיצה כפולה פותחת בפרק הנבחר</p>
          </div>
        </aside>
      )}
      </div>
      {bookContextMenu && library && (() => {
        const contextBook = library.books.find((book) => String(book.id) === bookContextMenu.bookId);
        if (!contextBook) return null;
        const isSelected = selectedBookIds.includes(bookContextMenu.bookId);
        const action = getLibraryBookContextMenuAction(isSelected, lang === 'en' ? 'en' : 'he');
        return createPortal(
          <div
            className="fixed inset-0 z-[120] bg-transparent"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) closeBookContextMenu(false);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div
              ref={bookContextMenuRef}
              role="menu"
              aria-label={lang === 'en' ? 'Book options' : 'אפשרויות ספר'}
              dir={lang === 'en' ? 'ltr' : 'rtl'}
              className="fixed z-[121] min-w-[190px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-outline-variant bg-surface-2 p-1.5 text-sm text-on-surface shadow-2xl motion-reduce:transition-none"
              style={{
                left: bookContextMenuPosition?.left ?? bookContextMenu.x,
                top: bookContextMenuPosition?.top ?? bookContextMenu.y,
                maxWidth: bookContextMenuPosition?.maxWidth ?? 'calc(100vw - 16px)',
                maxHeight: bookContextMenuPosition?.maxHeight ?? 'calc(100vh - 16px)',
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              <button
                ref={bookContextMenuActionRef}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isSelected}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start hover:bg-surface-3 focus:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => {
                  setSelectedBookIds((current) => toggleLibraryBookSelection(current, bookContextMenu.bookId));
                  setSelectionAnchorId(bookContextMenu.bookId);
                  selectionGestureRef.current = !isSelected || selectedBookIds.length > 1;
                  closeBookContextMenu(true);
                }}
              >
                {isSelected ? <Check size={16} /> : <Plus size={16} />}
                <span>{action.label}</span>
              </button>
              {shouldOfferTextOpenContextAction(contextBook) && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start hover:bg-surface-3 focus:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    closeBookContextMenu(false);
                    openBooksInReadingTabs([contextBook]);
                  }}
                >
                  <BookOpen size={16} />
                  <span>{lang === 'en' ? 'Open as text' : 'פתיחה כטקסט'}</span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        );
      })()}
      <BookInfoDialog book={infoBook} onClose={() => setInfoBook(null)} />
    </div>
  );
}
