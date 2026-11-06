import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { api, getUid } from '../api';
import { useApp } from '../store';
import type { ID, LinksResponse, CommentaryLink } from '../types';
import { highlight, normalizeHe, processHtml, snippetAround, stripTags, type TextOpts } from '../utils/text';
import { Spinner } from './ui';
import { Filter, Search, X, ChevronsDownUp, ChevronsUpDown, AlignJustify, PenLine, Trash2, Check } from 'lucide-react';

interface BookFilterPreference {
  hidden: string[];
  category: string;
}
type FilterPreferences = Record<string, BookFilterPreference>;
type Expand = 'all' | 'partial' | 'none';

function readFilterPreferences(key: string): FilterPreferences {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as FilterPreferences;
  } catch {
    return {};
  }
}

const PARTIAL_WORDS = 40;

function isRashiOrTosafot(name: string): boolean {
  const compact = normalizeHe(name).replace(/[^\u0590-\u05ff]/g, '');
  return compact.includes('רשי') || compact.includes('תוספ');
}

export default function CommentaryPanel({ bookId, bookTitle, line, heRef, opts, context = 'text' }: { bookId: ID; bookTitle: string; line: number; heRef?: string; opts: TextOpts; context?: 'text' | 'tzurat-hadaf' }) {
  const isTzuratHaDaf = context === 'tzurat-hadaf';
  const { settings, updateSettings, openBookByTitle, notes, saveNote, deleteNote, toast } = useApp();
  const [data, setData] = useState<LinksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookCommentators, setBookCommentators] = useState<string[]>([]);
  const filterStorageKey = `otz_commentary_filters:${getUid()}`;
  const [filterPreferences, setFilterPreferences] = useState<FilterPreferences>(() => readFilterPreferences(filterStorageKey));
  const [showFilter, setShowFilter] = useState(false);
  const [q, setQ] = useState('');
  const [expand, setExpand] = useState<Expand>('all');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .links(bookId, line)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bookId, line]);

  // all commentators of the whole book (for the filter)
  useEffect(() => {
    let c = false;
    setBookCommentators([]);
    api
      .commentators(bookId)
      .then((r) => !c && setBookCommentators(r.commentators || []))
      .catch(() => undefined);
    return () => {
      c = true;
    };
  }, [bookId]);

  useEffect(() => {
    try {
      localStorage.setItem(filterStorageKey, JSON.stringify(filterPreferences));
    } catch {
      /* best effort */
    }
  }, [filterStorageKey, filterPreferences]);

  const remoteApplied = useRef(false);
  useEffect(() => {
    const remote = settings.commentaryFiltersByBook;
    if (remote && typeof remote === 'object' && !remoteApplied.current) {
      remoteApplied.current = true;
      setFilterPreferences((local) => ({ ...local, ...remote }));
    }
  }, [settings.commentaryFiltersByBook]);

  // Keep Tzurat HaDaf preferences separate from the regular text reader preferences.
  const preferenceKey = isTzuratHaDaf ? `tzurat-hadaf:${String(bookId)}` : String(bookId);
  const pref = filterPreferences[preferenceKey] ?? { hidden: [], category: '' };
  const hidden = useMemo(() => new Set(pref.hidden), [pref.hidden]);
  const cat = pref.category;
  const updateBookPreference = useCallback(
    (patch: Partial<BookFilterPreference>) => {
      const next: FilterPreferences = {
        ...filterPreferences,
        [preferenceKey]: { ...(filterPreferences[preferenceKey] ?? { hidden: [], category: '' }), ...patch },
      };
      setFilterPreferences(next);
      updateSettings({ commentaryFiltersByBook: next });
    },
    [preferenceKey, filterPreferences, updateSettings],
  );

  const usingAll = !!data && (!data.links || data.links.length === 0) && !!data.allLinks?.length;
  const loadedLinks: CommentaryLink[] = useMemo(() => (data ? (usingAll ? data.allLinks! : data.links || []) : []), [data, usingAll]);
  // Rashi and Tosafot remain available in the normal text reader but are intentionally
  // omitted from Tzurat HaDaf's separate commentator panel.
  const links: CommentaryLink[] = useMemo(
    () => isTzuratHaDaf ? loadedLinks.filter((link) => !isRashiOrTosafot(link.sourceBook)) : loadedLinks,
    [loadedLinks, isTzuratHaDaf],
  );
  const categoryKeys = useMemo(() => Array.from(new Set(links.map((l) => l.category).filter(Boolean))), [links]);
  const categories = useMemo(() => ['הכל', ...categoryKeys], [categoryKeys]);
  const effCat = cat === '*' ? 'הכל' : cat && categories.includes(cat) ? cat : categoryKeys.includes('COMMENTARY') ? 'COMMENTARY' : 'הכל';

  const allSources = useMemo(() => {
    const s = new Set<string>();
    const names = [...bookCommentators, ...links.map((link) => link.sourceBook), ...(data?.availableCommentators || [])];
    for (const name of names) {
      if (isTzuratHaDaf && isRashiOrTosafot(name)) continue;
      s.add(name);
    }
    return Array.from(s);
  }, [bookCommentators, links, data?.availableCommentators, isTzuratHaDaf]);

  const qn = normalizeHe(q.trim());
  const visible = useMemo(() => {
    const filtered = links.filter(
      (l) => (effCat === 'הכל' || l.category === effCat) && !hidden.has(l.sourceBook) && (!qn || normalizeHe(stripTags(l.text)).includes(qn) || normalizeHe(l.sourceBook).includes(qn)),
    );
    const groups = new Map<string, CommentaryLink[]>();
    for (const l of filtered) {
      if (!groups.has(l.sourceBook)) groups.set(l.sourceBook, []);
      groups.get(l.sourceBook)!.push(l);
    }
    return Array.from(groups.entries());
  }, [links, effCat, hidden, qn]);

  const toggleSource = (s: string) => {
    const next = new Set(hidden);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    updateBookPreference({ hidden: Array.from(next) });
  };

  const setMode = (m: Expand) => {
    setExpand(m);
    setOpenItems(new Set());
  };
  const itemKey = (src: string, i: number) => `${src}#${i}`;
  const isOpen = (k: string) => (expand === 'all' ? !openItems.has(k) : openItems.has(k));
  const toggleItem = (k: string) =>
    setOpenItems((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const myNotes = notes.filter((n) => String(n.bookId) === String(bookId) && n.line === line);

  const renderText = (l: CommentaryLink, k: string) => {
    const open = isOpen(k);
    const full = processHtml(l.text, opts);
    if (open) return <span dangerouslySetInnerHTML={{ __html: qn ? highlight(full, q) : full }} />;
    const plain = stripTags(processHtml(l.text, opts));
    const words = plain.split(/\s+/).filter(Boolean);
    const short = qn ? snippetAround(plain, q, 8) : words.slice(0, PARTIAL_WORDS).join(' ') + (words.length > PARTIAL_WORDS ? '…' : '');
    if (!qn && words.length <= PARTIAL_WORDS && expand !== 'none') return <span dangerouslySetInnerHTML={{ __html: full }} />;
    return (
      <span>
        <span dangerouslySetInnerHTML={{ __html: qn ? highlight(short, q) : short }} />{' '}
        <button onClick={() => toggleItem(k)} className="text-xs text-primary hover:underline" style={{ fontFamily: 'Heebo' }}>
          עוד
        </button>
      </span>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-1 border-b border-outline-variant px-2 py-1.5">
        <div className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{data?.dafLabel || heRef || 'מפרשים'}</div>
        <button onClick={() => setMode('all')} className={`rounded-full p-1.5 ${expand === 'all' ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`} title="פתח הכל">
          <ChevronsUpDown size={16} />
        </button>
        <button onClick={() => setMode('partial')} className={`rounded-full p-1.5 ${expand === 'partial' ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`} title="פתוח חלקי">
          <AlignJustify size={16} />
        </button>
        <button onClick={() => setMode('none')} className={`rounded-full p-1.5 ${expand === 'none' ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`} title="סגור הכל">
          <ChevronsDownUp size={16} />
        </button>
        <button
          onClick={() => setShowFilter((s) => !s)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${showFilter || hidden.size ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`}
          title="סינון מפרשים (לכל הספר)"
        >
          <Filter size={14} /> {hidden.size ? hidden.size : ''}
        </button>
      </div>

      <div className="border-b border-outline-variant px-2 py-1.5">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value && expand === 'all') setExpand('partial');
            }}
            placeholder="חיפוש במפרשים המוצגים"
            className="h-8 w-full rounded-full border border-outline-variant bg-surface-1 pr-8 pl-7 text-xs outline-none focus:border-primary"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-on-variant">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {categories.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-outline-variant px-3 py-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => updateBookPreference({ category: c === 'הכל' ? '*' : c })}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                effCat === c ? 'border-transparent bg-sec-container text-on-sec-container' : 'border-outline-variant text-on-variant hover:bg-surface-3'
              }`}
            >
              {catLabel(c)}
            </button>
          ))}
        </div>
      )}

      {showFilter && (
        <div className="max-h-48 overflow-y-auto border-b border-outline-variant px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-on-variant">
            <span>מפרשים בספר זה ({allSources.length}) – הסינון נשמר לספר</span>
            <span className="flex gap-2">
              <button onClick={() => updateBookPreference({ hidden: [] })} className="text-primary hover:underline">הצג הכל</button>
              <button onClick={() => updateBookPreference({ hidden: allSources })} className="text-primary hover:underline">הסתר הכל</button>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allSources.map((s) => (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  hidden.has(s) ? 'border-outline-variant text-on-variant line-through opacity-60' : 'border-transparent bg-sec-container text-on-sec-container'
                }`}
              >
                {s}
              </button>
            ))}
            {allSources.length === 0 && <span className="text-xs text-on-variant">אין מפרשים לספר זה</span>}
          </div>
        </div>
      )}

      <div dir="rtl" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* personal notes */}
        <section className="mb-3 rounded-xl border border-dashed border-outline-variant bg-surface-1 px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[11px] font-medium text-on-variant">
              <PenLine size={12} /> חידושי תורה
              {myNotes.length > 0 && <span className="opacity-70">({myNotes.length})</span>}
            </div>
            {noteDraft === null && (
              <button onClick={() => { setNoteDraft(''); setEditingId(undefined); }} className="text-[11px] text-primary hover:underline">
                + הוסף
              </button>
            )}
          </div>
          {noteDraft !== null && (
            <div className="mb-2">
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                placeholder={`חידוש על ${heRef || bookTitle}…`}
                className="w-full rounded-xl border border-outline-variant bg-surface p-2 text-[15px] outline-none focus:border-primary"
                style={{ fontFamily: fontStack(settings.commentaryFontFamily) }}
              />
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={() => { setNoteDraft(null); setEditingId(undefined); }} className="rounded-full px-3 py-1 text-xs text-on-variant hover:bg-surface-3">ביטול</button>
                <button
                  onClick={() => {
                    if (!noteDraft.trim()) return;
                    saveNote({ id: editingId, bookId, line, heRef, text: noteDraft.trim() });
                    setNoteDraft(null);
                    setEditingId(undefined);
                    toast('החידוש נשמר');
                  }}
                  className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs text-on-primary"
                >
                  <Check size={13} /> שמור
                </button>
              </div>
            </div>
          )}
          {myNotes.map((n) => (
            <div key={n.id} className="group mt-1 flex gap-1.5 rounded-lg bg-surface px-2 py-1">
              <div
                className="book-text min-w-0 flex-1 whitespace-pre-wrap"
                style={{ fontFamily: fontStack(settings.commentaryFontFamily), fontSize: Math.max(12, settings.commentaryFontSize - 3), lineHeight: 1.45 }}
              >
                {n.text}
              </div>
              <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => { setNoteDraft(n.text); setEditingId(n.id); }} className="rounded-full p-0.5 hover:bg-surface-3" title="ערוך"><PenLine size={11} /></button>
                <button onClick={() => deleteNote(n.id)} className="rounded-full p-0.5 hover:bg-surface-3 hover:text-error" title="מחק"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </section>

        {loading && !data && <Spinner />}
        {error && <div className="text-sm text-error">{error}</div>}
        {!loading && !error && data && visible.length === 0 && (
          <div className="p-6 text-center text-sm text-on-variant">{qn ? 'אין מפרשים התואמים לחיפוש' : 'אין מפרשים לשורה זו'}</div>
        )}
        {usingAll && visible.length > 0 && <div className="mb-2 text-xs text-on-variant">מפרשים בסביבת השורה</div>}
        <div style={{ opacity: loading ? 0.5 : 1 }} className="transition-opacity">
          {visible.map(([src, items]) => (
            <section key={src} className="mb-5">
              <button onClick={() => openBookByTitle(src, items[0].line)} className="mb-1.5 block text-start text-sm font-bold text-primary hover:underline">
                {src}
              </button>
              {items.map((l, i) => {
                const k = itemKey(src, i);
                return (
                  <div
                    key={i}
                    className="book-text mb-2 border-r-2 border-outline-variant pr-3"
                    style={{ fontFamily: fontStack(settings.commentaryFontFamily), fontSize: settings.commentaryFontSize, lineHeight: 1.55 }}
                  >
                    {l.dibburHamatchil && settings.showCommentaryMarkers && (
                      <button onClick={() => toggleItem(k)} className="block text-start text-[11px] leading-tight text-on-variant hover:text-primary" style={{ fontFamily: 'Heebo, sans-serif' }}>
                        {l.dibburHamatchil}
                      </button>
                    )}
                    {expand === 'none' && !isOpen(k) && !qn ? (
                      <button onClick={() => toggleItem(k)} className="text-xs text-primary hover:underline" style={{ fontFamily: 'Heebo' }}>
                        הצג פירוש
                      </button>
                    ) : (
                      renderText(l, k)
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const CAT_LABELS: Record<string, string> = {
  COMMENTARY: 'פירושים',
  SUPER_COMMENTARY: 'פירושים על המפרשים',
  TARGUM: 'תרגומים',
  REFERENCE: 'מראי מקומות',
  QUOTATION: 'ציטוטים',
  SOURCE: 'מקורות',
  HALACHA: 'הלכה',
  MIDRASH: 'מדרש',
  OTHER: 'אחר',
};
export function catLabel(c: string): string {
  return CAT_LABELS[c.toUpperCase()] ?? c;
}

export function fontStack(name: string): string {
  switch (name) {
    case 'David Libre':
      return '"David Libre", "Frank Ruhl Libre", serif';
    case 'Heebo':
      return '"Heebo", sans-serif';
    case 'Rashi':
      return '"Noto Rashi Hebrew", "Frank Ruhl Libre", serif';
    default:
      return '"Frank Ruhl Libre", "David Libre", serif';
  }
}
