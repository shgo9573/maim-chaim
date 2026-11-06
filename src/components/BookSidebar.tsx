import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, Search, X } from 'lucide-react';
import { api } from '../api';
import type { ID, SearchResultItem, TocEntry } from '../types';
import { highlight, normalizeHe, processHtml, type TextOpts } from '../utils/text';
import { Spinner } from './ui';

interface TocNode {
  entry: TocEntry;
  children: TocNode[];
}

function buildToc(entries: TocEntry[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: { level: number; node: TocNode }[] = [];
  for (const e of entries) {
    const level = e.level ?? 1;
    const node: TocNode = { entry: e, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else root.push(node);
    stack.push({ level, node });
  }
  return root;
}

function TocItem({ node, depth, current, onGo }: { node: TocNode; depth: number; current: number; onGo: (i: number) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const has = node.children.length > 0;
  const active = node.entry.index === current;
  return (
    <div>
      <div className={`flex items-center rounded-lg ${active ? 'bg-sec-container text-on-sec-container' : 'hover:bg-surface-3'}`} style={{ paddingRight: depth * 14 }}>
        {has ? (
          <button onClick={() => setOpen((o) => !o)} className="p-1.5 text-on-variant">
            {open ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
          </button>
        ) : (
          <span className="w-[28px]" />
        )}
        <button onClick={() => onGo(node.entry.index)} className="min-w-0 flex-1 truncate py-1.5 pl-2 text-start text-[15px]">
          {node.entry.title}
        </button>
      </div>
      {has && open && node.children.map((c, i) => <TocItem key={i} node={c} depth={depth + 1} current={current} onGo={onGo} />)}
    </div>
  );
}

export default function BookSidebar({
  bookId,
  bookTitle,
  tab,
  setTab,
  currentLine,
  onGo,
  opts,
  searchSeed,
  toc,
  tocError,
}: {
  bookId: ID;
  bookTitle: string;
  tab: 'toc' | 'search';
  setTab: (t: 'toc' | 'search') => void;
  currentLine: number;
  onGo: (line: number, highlightText?: string) => void;
  opts: TextOpts;
  searchSeed: number;
  toc: TocEntry[] | null;
  tocError: string;
}) {
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    setResults(null);
    setQ('');
    setCursor(-1);
  }, [bookId]);

  useEffect(() => {
    if (searchSeed > 0) {
      setTab('search');
      setTimeout(() => document.getElementById('book-search-input')?.focus(), 50);
    }
  }, [searchSeed, setTab]);

  const tree = useMemo(() => buildToc(toc || []), [toc]);
  const filtered = useMemo(() => {
    if (!filter.trim() || !toc) return null;
    const f = normalizeHe(filter.trim());
    return toc.filter((t) => normalizeHe(t.title).includes(f));
  }, [filter, toc]);

  const currentIdx = useMemo(() => {
    if (!toc) return -1;
    let best = -1;
    for (const t of toc) if (t.index <= currentLine && t.index > best) best = t.index;
    return best;
  }, [toc, currentLine]);

  const doSearch = async () => {
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    setSearchError('');
    setLastQuery(query);
    setCursor(-1);
    try {
      const idNum = Number(bookId);
      const r = await api.search({ query, limit: 500, category: 'all', bookId: Number.isFinite(idNum) ? idNum : bookId, bookTitle, mode: 'advanced' });
      const own = r.results.filter((x) => String(x.bookId) === String(bookId) || (!x.bookId && x.bookTitle === bookTitle));
      own.sort((a, b) => a.lineIndex - b.lineIndex);
      setResults(own);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const goResult = (i: number) => {
    if (!results || !results[i]) return;
    setCursor(i);
    onGo(results[i].lineIndex, lastQuery);
    document.getElementById(`bres-${i}`)?.scrollIntoView({ block: 'nearest' });
  };

  const tabBtn = (k: 'toc' | 'search', label: string) => (
    <button key={k} onClick={() => setTab(k)} className={`relative flex-1 py-2.5 text-sm font-medium ${tab === k ? 'text-primary' : 'text-on-variant hover:bg-surface-3'}`}>
      {label}
      {tab === k && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full bg-primary" />}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex border-b border-outline-variant">
        {tabBtn('toc', 'ניווט')}
        {tabBtn('search', 'חיפוש בספר')}
      </div>

      {tab === 'toc' ? (
        <>
          <div className="p-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="סינון תוכן העניינים"
                className="h-9 w-full rounded-full border border-outline-variant bg-surface pr-9 pl-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
            {!toc && !tocError && <Spinner />}
            {tocError && <div className="p-3 text-sm text-error">{tocError}</div>}
            {toc && toc.length === 0 && <div className="p-4 text-center text-sm text-on-variant">אין תוכן עניינים לספר זה</div>}
            {filtered
              ? filtered.map((t, i) => (
                  <button key={i} onClick={() => onGo(t.index)} className="block w-full truncate rounded-lg px-3 py-1.5 text-start text-[15px] hover:bg-surface-3">
                    {t.title}
                  </button>
                ))
              : tree.map((n, i) => <TocItem key={i} node={n} depth={0} current={currentIdx} onGo={(l) => onGo(l)} />)}
          </div>
        </>
      ) : (
        <>
          <form
            className="p-2"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              doSearch();
            }}
          >
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
              <input
                id="book-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש בתוך הספר (Enter)"
                className="h-9 w-full rounded-full border border-outline-variant bg-surface pr-9 pl-8 text-sm outline-none focus:border-primary"
              />
              {q && (
                <button type="button" onClick={() => { setQ(''); setResults(null); }} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-variant">
                  <X size={15} />
                </button>
              )}
            </div>
          </form>
          {results && results.length > 0 && (
            <div className="flex items-center gap-1 border-b border-outline-variant px-2 pb-2 text-xs text-on-variant">
              <span className="flex-1">
                {cursor >= 0 ? `${cursor + 1} / ${results.length}` : `${results.length} תוצאות`}
              </span>
              <button onClick={() => goResult(cursor <= 0 ? results.length - 1 : cursor - 1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה קודמת">
                <ChevronUp size={16} />
              </button>
              <button onClick={() => goResult(cursor >= results.length - 1 ? 0 : cursor + 1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה הבאה">
                <ChevronDown size={16} />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1">
            {searching && <Spinner label="מחפש..." />}
            {searchError && <div className="p-3 text-sm text-error">{searchError}</div>}
            {results && !searching && results.length === 0 && <div className="px-2 py-4 text-center text-sm text-on-variant">לא נמצאו תוצאות בספר זה</div>}
            {!searching &&
              results?.map((r, i) => (
                <button
                  key={i}
                  id={`bres-${i}`}
                  onClick={() => goResult(i)}
                  className={`mb-1 block w-full rounded-lg px-3 py-2 text-start hover:bg-surface-3 ${cursor === i ? 'bg-sec-container text-on-sec-container' : ''}`}
                >
                  <div className="text-xs font-medium text-primary">{r.reference || `שורה ${r.lineIndex}`}</div>
                  <div className="line-clamp-3 text-[15px] leading-snug" dangerouslySetInnerHTML={{ __html: highlight(processHtml(r.snippet, opts), lastQuery) }} />
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
