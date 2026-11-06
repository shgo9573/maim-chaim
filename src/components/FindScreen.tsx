import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, BookText, ChevronLeft, FileSearch, Info, Search, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import { buildLibrary } from '../utils/library';
import { normalizeHe } from '../utils/text';
import type { BookItem, TocEntry } from '../types';
import { Btn, Select, Spinner } from './ui';
import { t } from '../i18n';
import BookInfoDialog from './BookInfoDialog';
import { findShasTractate, parseDafString } from './TzuratHaDafModal';

const CHIP_LIMIT = 50;

interface Node {
  entry: TocEntry;
  children: Node[];
}

function buildTree(entries: TocEntry[], bookTitle: string): Node[] {
  // drop a leading entry that is just the book's name (duplicate of chapter 1)
  const cleaned = entries.filter((e, i) => !(i === 0 && e.title.trim() === bookTitle.trim() && entries[1]?.index === e.index));
  const root: Node[] = [];
  const stack: { level: number; node: Node }[] = [];
  for (const e of cleaned) {
    const level = e.level ?? 1;
    const node: Node = { entry: e, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else root.push(node);
    stack.push({ level, node });
  }
  return root;
}

function ChipGrid({ nodes, value, onPick, onDoublePick, label }: { nodes: Node[]; value: number | null; onPick: (n: Node) => void; onDoublePick: (n: Node) => void; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? nodes : nodes.slice(0, CHIP_LIMIT);
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-on-variant">
        {label} ({nodes.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((n, i) => (
          <button
            key={i}
            onClick={() => onPick(n)}
            onDoubleClick={() => {
              if (n.children.length === 0) onDoublePick(n);
            }}
            className={`rounded-lg border px-2.5 py-1 text-sm transition ${
              value === n.entry.index ? 'border-transparent bg-primary text-on-primary' : 'border-outline-variant bg-surface hover:bg-surface-3'
            }`}
            title={`שורה ${n.entry.index}`}
          >
            {n.entry.title.replace(/^(פרק|סימן|דף|הלכה|משנה|פסוק|סעיף)\s+/u, '')}
          </button>
        ))}
        {nodes.length > CHIP_LIMIT && (
          <button onClick={() => setShowAll((s) => !s)} className="rounded-lg px-2.5 py-1 text-sm text-primary hover:underline">
            {showAll ? 'הצג פחות' : `הצג עוד (${nodes.length - CHIP_LIMIT})`}
          </button>
        )}
      </div>
    </div>
  );
}

export default function FindScreen() {
  const { library, history, openBookInNewTab, openBookInActiveTab, openTzuratHaDaf, setScreen, settings } = useApp();
  const lang = settings.interfaceLanguage;
  const [books, setBooks] = useState<BookItem[]>(library?.books ?? []);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [query, setQuery] = useState('');
  const [infoBook, setInfoBook] = useState<BookItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [path, setPath] = useState<Node[]>([]); // chosen chapter -> section -> ...
  const [line, setLine] = useState(1);
  const [destination, setDestination] = useState<'new' | 'active'>('new');
  const inputRef = useRef<HTMLInputElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (library) setBooks(library.books);
    if (requested.current) return;
    requested.current = true;
    setLoading(true);
    api
      .libraryTree()
      .then((data) => {
        setBooks(buildLibrary(data).books);
        setServerError('');
      })
      .catch((e) => setServerError(e.message || 'לא ניתן לטעון את רשימת הספרים מהשרת'))
      .finally(() => setLoading(false));
  }, [library]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const words = normalizeHe(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return books
      .map((book) => {
        const title = normalizeHe(book.title);
        const hay = `${title} ${normalizeHe(book.categoryPath)} ${normalizeHe(book.author || '')}`;
        if (!words.every((w) => hay.includes(w))) return null;
        const score = title === words.join(' ') ? 0 : title.startsWith(words[0]) ? 1 : title.includes(words[0]) ? 2 : 3;
        return { book, score };
      })
      .filter((x): x is { book: BookItem; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.book.title.length - b.book.title.length)
      .slice(0, 100)
      .map((x) => x.book);
  }, [books, query]);

  useEffect(() => {
    if (query && results[0] && (!selectedId || !results.some((b) => String(b.id) === selectedId))) setSelectedId(String(results[0].id));
  }, [results, selectedId, query]);

  const selected = books.find((b) => String(b.id) === selectedId) ?? null;
  const lastPosition = selected ? history.find((h) => String(h.bookId) === String(selected.id))?.lastPosition : undefined;

  useEffect(() => {
    let cancelled = false;
    setPath([]);
    if (!selected) {
      setToc([]);
      setLine(1);
      return;
    }
    setTocLoading(true);
    api
      .toc(selected.id)
      .then((entries) => {
        if (cancelled) return;
        setToc(entries);
        setLine(lastPosition ?? 1);
      })
      .catch(() => {
        if (!cancelled) {
          setToc([]);
          setLine(lastPosition ?? 1);
        }
      })
      .finally(() => !cancelled && setTocLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected?.id, lastPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => (selected ? buildTree(toc, selected.title) : []), [toc, selected]);

  const levels: { label: string; nodes: Node[] }[] = [];
  if (tree.length) {
    levels.push({ label: guessLabel(tree), nodes: tree });
    let cur: Node[] = tree;
    for (const p of path) {
      const found = cur.find((n) => n === p);
      if (found && found.children.length) {
        levels.push({ label: guessLabel(found.children), nodes: found.children });
        cur = found.children;
      } else break;
    }
  }

  const pick = (depth: number, n: Node) => {
    setPath((p) => [...p.slice(0, depth), n]);
    setLine(n.entry.index);
  };

  const openAt = (targetLine: number) => {
    if (!selected) return;
    const target = { id: selected.id, title: selected.title, categoryPath: selected.categoryPath };

    // In Tzurat HaDaf mode, translate the selected TOC line to its daf/amud.
    // The generic book-opening callbacks used to intercept this route and force 2a.
    if (settings.talmudBavliOpenFormat === 'pdf' && findShasTractate(selected.title)) {
      const tocEntry = toc.find((entry) => entry.index === targetLine);
      if (tocEntry) {
        const rawDafLabel = /^דף\s/u.test(tocEntry.title.trim()) ? tocEntry.title : `דף ${tocEntry.title}`;
        const parsed = parseDafString(rawDafLabel);
        openTzuratHaDaf(target, parsed.dafNum, parsed.amud, destination === 'new' ? 'new' : 'replace');
        return;
      }
    }

    if (destination === 'new') openBookInNewTab(target, targetLine);
    else openBookInActiveTab(target, targetLine);
  };

  const openSelected = () => openAt(line);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sec-container text-on-sec-container">
            <FileSearch size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-medium leading-tight">{lang === 'en' ? 'Locate a book' : 'איתור ספר'}</h1>
            <div className="text-xs text-on-variant">{lang === 'en' ? 'Find a title and choose where to start reading' : 'חיפוש בכותרות הספרים מהשרת ובחירת מקום הפתיחה'}</div>
          </div>
          <button onClick={() => setScreen('library')} className="rounded-full p-2 text-on-variant hover:bg-surface-3" title="סגור">
            <X size={20} />
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-6xl">
          <div className="relative max-w-3xl">
            <Search size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-variant" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && selected) openSelected();
              }}
              placeholder={lang === 'en' ? 'Enter a book title or part of it' : 'הקלידו שם ספר או חלק מהכותרת'}
              className="h-11 w-full rounded-full border border-outline-variant bg-surface-2 pr-12 pl-4 text-base outline-none transition focus:border-primary focus:bg-surface"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-variant hover:bg-surface-3" aria-label="נקה">
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col lg:flex-row">
        {/* results */}
        <section className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5 lg:border-l lg:border-outline-variant" style={{ maxHeight: selected ? undefined : '100%' }}>
          <div className="mb-2 flex items-center justify-between px-2 text-sm text-on-variant">
              <span>{query ? (lang === 'en' ? `${results.length} results` : `${results.length} תוצאות`) : t('התחילו להקליד כדי לחפש', lang)}</span>
            {loading && <span className="text-xs">מרענן מהשרת...</span>}
          </div>
          {loading && books.length === 0 && <Spinner label="טוען כותרות מהשרת..." />}
          {!query && books.length > 0 && (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-center text-on-variant">
              <BookText size={44} className="opacity-50" />
              <p>חפשו כותרת כדי לבחור ספר ולכוון את מקום הפתיחה.</p>
            </div>
          )}
          {query && results.length === 0 && !loading && <div className="p-8 text-center text-sm text-on-variant">לא נמצאו ספרים בכותרות הקטלוג</div>}
          <div className="space-y-1">
            {results.map((book) => (
              <div key={String(book.id)} className="flex items-center gap-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setSelectedId(String(book.id))}
                  onDoubleClick={() => {
                    setSelectedId(String(book.id));
                    openBookInNewTab({ id: book.id, title: book.title, categoryPath: book.categoryPath });
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-2.5 text-start transition ${selectedId === String(book.id) ? 'bg-sec-container text-on-sec-container' : 'hover:bg-surface-3'}`}
                >
                  <BookText size={21} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{book.title}</span>
                    <span className="block truncate text-xs text-on-variant">{book.categoryPath}</span>
                  </span>
                  <ChevronLeft size={17} className="shrink-0 opacity-60" />
                </button>
                <button
                  type="button"
                  onClick={() => setInfoBook(book)}
                  title="מידע על הספר"
                  aria-label={`מידע על הספר ${book.title}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-xs text-primary hover:bg-surface-2"
                >
                  <Info size={17} /><span className="hidden sm:inline">מידע</span>
                </button>
              </div>
            ))}
          </div>
          {serverError && books.length === 0 && <div className="p-4 text-sm text-error">{serverError}</div>}
        </section>

        {/* location picker */}
        <aside className="flex max-h-[55vh] min-h-0 shrink-0 flex-col border-t border-outline-variant bg-surface-1 lg:max-h-none lg:w-[400px] lg:border-t-0">
          {selected ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                    <BookOpen size={22} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-medium leading-tight">{selected.title}</h2>
                    <div className="truncate text-xs text-on-variant">{selected.categoryPath}</div>
                  </div>
                </div>

                {tocLoading && <div className="text-sm text-on-variant">טוען תוכן עניינים...</div>}
                {!tocLoading && levels.length === 0 && <div className="text-xs text-on-variant">אין תוכן עניינים לספר זה – ניתן לבחור מספר שורה.</div>}
                {levels.map((lvl, depth) => (
                  <ChipGrid
                    key={depth}
                    label={lvl.label}
                    nodes={lvl.nodes}
                    value={path[depth]?.entry.index ?? null}
                    onPick={(n) => pick(depth, n)}
                    onDoublePick={(n) => {
                      if (n.children.length === 0) openAt(n.entry.index);
                    }}
                  />
                ))}

                <label className="block text-xs text-on-variant">
                  מספר שורה
                  <input
                    type="number"
                    min={1}
                    value={line}
                    onChange={(e) => setLine(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 h-9 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                {lastPosition && lastPosition !== line && (
                  <button onClick={() => { setLine(lastPosition); setPath([]); }} className="text-xs text-primary hover:underline">
                    חזרה למקום האחרון שנקרא (שורה {lastPosition})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-outline-variant p-3">
                <Select
                  value={destination}
                  onChange={setDestination}
                  options={[
                    { value: 'new', label: 'לשונית חדשה' },
                    { value: 'active', label: 'הלשונית הפעילה' },
                  ]}
                />
                  <Btn variant="filled" className="flex-1" onClick={openSelected}>
                  {t('פתח', lang)} {path.length ? path[path.length - 1].entry.title : (lang === 'en' ? `at line ${line}` : `בשורה ${line}`)}
                </Btn>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-on-variant">
              <BookText size={38} className="opacity-50" />
              <p className="text-sm">בחרו ספר מהרשימה כדי להגדיר את מיקום הפתיחה.</p>
            </div>
          )}
        </aside>
      </div>
      <BookInfoDialog book={infoBook} onClose={() => setInfoBook(null)} />
    </div>
  );
}

function guessLabel(nodes: Node[]): string {
  const t = nodes[0]?.entry.title || '';
  const m = t.match(/^(פרק|סימן|דף|הלכה|משנה|פסוק|סעיף|מזמור|שער|מאמר|חלק|פרשת)/u);
  if (!m) return 'חלקים';
  const map: Record<string, string> = { פרק: 'פרקים', סימן: 'סימנים', דף: 'דפים', הלכה: 'הלכות', משנה: 'משניות', פסוק: 'פסוקים', סעיף: 'סעיפים', מזמור: 'מזמורים', שער: 'שערים', מאמר: 'מאמרים', חלק: 'חלקים', פרשת: 'פרשות' };
  return map[m[1]] || 'חלקים';
}
