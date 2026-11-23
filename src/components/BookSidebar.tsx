import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronUp, Search, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../api';
import { useApp } from '../store';
import type { ID, SearchResultItem, TocEntry } from '../types';
import { highlight, normalizeHe, processHtml, type TextOpts } from '../utils/text';
import {
  buildTocTree,
  filterTocTree,
  flattenVisibleToc,
  getDefaultTocExpansion,
  getTocActiveIndex,
  getTocExpansionForLevel,
  getTocPath,
  getTocTreeDepth,
  getVisibleActiveTocIndex,
} from '../utils/tocNavigation';
import { Spinner } from './ui';

export default function BookSidebar({
  bookId,
  bookTitle,
  tab,
  setTab,
  currentLine,
  onGo,
  opts,
  searchSeed,
  searchQuery = '',
  searchAutoRun = false,
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
  searchQuery?: string;
  searchAutoRun?: boolean;
  toc: TocEntry[] | null;
  tocError: string;
}) {
  const { settings, updateSettings } = useApp();
  const [filter, setFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const [manualExpansion, setManualExpansion] = useState<Record<string, boolean>>({});
  const [highlightedTocIndex, setHighlightedTocIndex] = useState<number | null>(null);
  const [expandMenuOpen, setExpandMenuOpen] = useState(false);
  const autoSearchSeedRef = useRef<number | null>(null);
  const tocListRef = useRef<HTMLDivElement>(null);
  const expandMenuRef = useRef<HTMLDivElement>(null);
  const expandMenuItemsRef = useRef<HTMLDivElement>(null);
  const expandTriggerRef = useRef<HTMLButtonElement>(null);
  const manualTocScrollRef = useRef(false);
  const manualTocScrollTimerRef = useRef<number | null>(null);

  const autoExpand = settings.tocAutoExpand !== false;
  const expansionLevel = typeof settings.tocExpansionLevel === 'number'
    ? settings.tocExpansionLevel
    : null;

  useEffect(() => {
    setResults(null);
    setQ('');
    setCursor(-1);
    setFilter('');
    setAppliedFilter('');
    setManualExpansion({});
    manualTocScrollRef.current = false;
    if (manualTocScrollTimerRef.current !== null) {
      window.clearTimeout(manualTocScrollTimerRef.current);
      manualTocScrollTimerRef.current = null;
    }
    setHighlightedTocIndex(null);
    setExpandMenuOpen(false);
  }, [bookId]);

  useEffect(() => {
    if (searchSeed > 0) {
      setTab('search');
      setQ(searchQuery);
      setResults(null);
      setSearchError('');
      setLastQuery('');
      setCursor(-1);
      const timer = window.setTimeout(() => document.getElementById('book-search-input')?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [searchSeed, searchQuery, setTab]);

  const tree = useMemo(() => buildTocTree(toc || [], bookTitle), [toc, bookTitle]);
  const currentIdx = useMemo(() => getTocActiveIndex(tree, currentLine), [tree, currentLine]);
  const baseExpansion = useMemo(
    () => expansionLevel === null
      ? getDefaultTocExpansion(tree)
      : getTocExpansionForLevel(tree, expansionLevel),
    [tree, expansionLevel],
  );
  const expanded = useMemo(() => {
    const next = new Set(baseExpansion);
    if (autoExpand && currentIdx !== null) {
      for (const node of getTocPath(tree, currentIdx)) {
        if (node.children.length > 0 && manualExpansion[String(node.entry.index)] !== false) {
          next.add(node.entry.index);
        }
      }
    }
    for (const [rawIndex, isExpanded] of Object.entries(manualExpansion)) {
      const index = Number(rawIndex);
      if (isExpanded) next.add(index);
      else next.delete(index);
    }
    return next;
  }, [baseExpansion, autoExpand, currentIdx, tree, manualExpansion]);

  const normalizedInputFilter = useMemo(() => normalizeHe(filter.trim()), [filter]);
  useEffect(() => {
    if (!normalizedInputFilter) {
      setAppliedFilter('');
      setHighlightedTocIndex(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setAppliedFilter(normalizedInputFilter);
      setHighlightedTocIndex(null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [normalizedInputFilter]);
  const normalizedFilter = appliedFilter;
  const filteredTree = useMemo(
    () => normalizedFilter ? filterTocTree(tree, normalizedFilter, normalizeHe) : tree,
    [tree, normalizedFilter],
  );
  const filterExpansion = useMemo(
    () => normalizedFilter ? getTocExpansionForLevel(filteredTree, 0) : expanded,
    [filteredTree, normalizedFilter, expanded],
  );
  const rows = useMemo(
    () => flattenVisibleToc(filteredTree, filterExpansion),
    [filteredTree, filterExpansion],
  );
  const activeTocIndex = useMemo(
    () => normalizedFilter
      ? null
      : getVisibleActiveTocIndex(rows, getTocPath(tree, currentIdx), currentIdx),
    [rows, tree, currentIdx, normalizedFilter],
  );
  const treeDepth = useMemo(() => getTocTreeDepth(tree), [tree]);
  const expansionLevels = useMemo(
    () => Array.from(
      { length: Math.max(0, Math.min(5, treeDepth - 1) - 1) },
      (_, index) => index + 2,
    ),
    [treeDepth],
  );
  const hasExpandableNodes = tree.some((node) => node.children.length > 0);

  const tocVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tocListRef.current,
    estimateSize: () => 36,
    overscan: 8,
    getItemKey: (index) => `${rows[index]?.node.entry.index ?? index}-${index}`,
  });
  const virtualRows = tocVirtualizer.getVirtualItems();

  const handleTocScroll = () => {
    manualTocScrollRef.current = true;
    if (manualTocScrollTimerRef.current !== null) {
      window.clearTimeout(manualTocScrollTimerRef.current);
    }
    manualTocScrollTimerRef.current = window.setTimeout(() => {
      manualTocScrollRef.current = false;
      manualTocScrollTimerRef.current = null;
    }, 350);
  };

  useEffect(() => () => {
    if (manualTocScrollTimerRef.current !== null) {
      window.clearTimeout(manualTocScrollTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!normalizedFilter || highlightedTocIndex === null) return;
    const targetIndex = rows.findIndex((row) => row.node.entry.index === highlightedTocIndex);
    if (targetIndex >= 0) tocVirtualizer.scrollToIndex(targetIndex, { align: 'auto' });
  }, [normalizedFilter, highlightedTocIndex, rows, tocVirtualizer]);

  useEffect(() => {
    if (normalizedFilter || activeTocIndex === null || manualTocScrollRef.current) return;
    const targetIndex = rows.findIndex((row) => row.node.entry.index === activeTocIndex);
    if (targetIndex < 0) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    tocVirtualizer.scrollToIndex(targetIndex, {
      align: 'auto',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeTocIndex, normalizedFilter, rows, tocVirtualizer]);

  useEffect(() => {
    if (!expandMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!expandMenuRef.current?.contains(event.target as Node)) setExpandMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setExpandMenuOpen(false);
      expandTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [expandMenuOpen]);

  useEffect(() => {
    if (expandMenuOpen) {
      expandMenuItemsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [expandMenuOpen]);

  const doSearch = useCallback(async (queryInput: string) => {
    const query = queryInput.trim();
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
  }, [bookId, bookTitle]);

  useEffect(() => {
    if (!searchAutoRun || searchSeed <= 0 || !searchQuery.trim() || autoSearchSeedRef.current === searchSeed) return;
    autoSearchSeedRef.current = searchSeed;
    const timer = window.setTimeout(() => { void doSearch(searchQuery); }, 60);
    return () => window.clearTimeout(timer);
  }, [searchSeed, searchAutoRun, searchQuery, doSearch]);

  const goResult = (i: number) => {
    if (!results || !results[i]) return;
    setCursor(i);
    onGo(results[i].lineIndex, lastQuery);
    document.getElementById(`bres-${i}`)?.scrollIntoView({ block: 'nearest' });
  };

  const applyExpansionLevel = (level: number) => {
    setManualExpansion({});
    updateSettings({ tocExpansionLevel: level });
    setExpandMenuOpen(false);
    window.requestAnimationFrame(() => expandTriggerRef.current?.focus());
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    tocListRef.current?.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const toggleAutoExpansion = () => {
    if (autoExpand && currentIdx !== null) {
      const activePath = getTocPath(tree, currentIdx);
      setManualExpansion((previous) => {
        const next = { ...previous };
        for (const node of activePath) {
          if (node.children.length > 0 && expanded.has(node.entry.index)) {
            next[String(node.entry.index)] = true;
          }
        }
        return next;
      });
    }
    updateSettings({ tocAutoExpand: !autoExpand });
    setExpandMenuOpen(false);
    window.requestAnimationFrame(() => expandTriggerRef.current?.focus());
  };

  const handleTocFilterKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!normalizedFilter || rows.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const current = rows.findIndex((row) => row.node.entry.index === highlightedTocIndex);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const start = current < 0 ? (delta > 0 ? -1 : rows.length) : current;
      const next = (start + delta + rows.length) % rows.length;
      setHighlightedTocIndex(rows[next].node.entry.index);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const selected = rows.find((row) => row.node.entry.index === highlightedTocIndex) ?? rows[0];
      onGo(selected.node.entry.index);
    }
  };

  const handleExpansionMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      expandMenuItemsRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"], [role="menuitemcheckbox"]',
      ) ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (Math.max(0, current) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const tabBtn = (k: 'toc' | 'search', label: string) => (
    <button key={k} type="button" onClick={() => setTab(k)} className={`relative flex-1 py-2.5 text-sm font-medium ${tab === k ? 'text-primary' : 'text-on-variant hover:bg-surface-3'}`}>
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
          <div className="flex items-center gap-2 p-2" dir="rtl">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
              <input
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setHighlightedTocIndex(null);
                }}
                onKeyDown={handleTocFilterKeyDown}
                placeholder="סינון תוכן העניינים"
                aria-label="סינון תוכן העניינים"
                className="h-9 w-full rounded-full border border-outline-variant bg-surface pr-9 pl-3 text-sm outline-none focus:border-primary"
              />
            </div>
            {hasExpandableNodes && !normalizedFilter && (
              <div ref={expandMenuRef} className="relative shrink-0">
                <button
                  ref={expandTriggerRef}
                  type="button"
                  onClick={() => setExpandMenuOpen((open) => !open)}
                  aria-label="הרחבה וכיווץ של הכותרות"
                  aria-haspopup="menu"
                  aria-expanded={expandMenuOpen}
                  title="הרחבה וכיווץ של הכותרות"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronDown size={18} />
                </button>
                {expandMenuOpen && (
                  <div
                    ref={expandMenuItemsRef}
                    role="menu"
                    aria-label="אפשרויות הרחבת תוכן העניינים"
                    onKeyDown={handleExpansionMenuKeyDown}
                    className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-outline-variant bg-surface-1 p-1 shadow-lg"
                    dir="rtl"
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={expansionLevel === 1}
                      onClick={() => applyExpansionLevel(1)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span>כווץ הכל</span>
                      {expansionLevel === 1 && <Check size={16} />}
                    </button>
                    {expansionLevels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        role="menuitemradio"
                        aria-checked={expansionLevel === level}
                        onClick={() => applyExpansionLevel(level)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span>הצג עד רמה {level}</span>
                        {expansionLevel === level && <Check size={16} />}
                      </button>
                    ))}
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={expansionLevel === 0}
                      onClick={() => applyExpansionLevel(0)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span>הרחב הכל</span>
                      {expansionLevel === 0 && <Check size={16} />}
                    </button>
                    <div className="my-1 border-t border-outline-variant" role="separator" />
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={autoExpand}
                      onClick={toggleAutoExpansion}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span>פתיחה אוטומטית לפי מיקום הקריאה</span>
                      {autoExpand && <Check size={16} />}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div
            ref={tocListRef}
            role="tree"
            aria-label="תוכן העניינים"
            className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4"
            dir="rtl"
            onScroll={handleTocScroll}
          >
            {!toc && !tocError && <Spinner />}
            {tocError && <div className="p-3 text-sm text-error">{tocError}</div>}
            {toc && toc.length === 0 && <div className="p-4 text-center text-sm text-on-variant">אין תוכן עניינים לספר זה</div>}
            {toc && toc.length > 0 && rows.length === 0 && (
              <div className="p-4 text-center text-sm text-on-variant">לא נמצאו כותרות מתאימות</div>
            )}
            {rows.length > 0 && (
              <div style={{ height: tocVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  const node = row.node;
                  const hasChildren = node.children.length > 0;
                  const selected = normalizedFilter
                    ? highlightedTocIndex === node.entry.index
                    : activeTocIndex === node.entry.index;
                  const expandedRow = normalizedFilter ? hasChildren : row.expanded;
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: 36,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        role="treeitem"
                        aria-level={node.depth + 1}
                        aria-expanded={hasChildren ? expandedRow : undefined}
                        aria-selected={selected}
                        className={`flex h-9 items-center rounded-lg ${selected ? 'bg-sec-container text-on-sec-container' : 'hover:bg-surface-3'}`}
                        style={{ paddingRight: node.depth * 14 }}
                      >
                        {hasChildren && !normalizedFilter ? (
                          <button
                            type="button"
                            onClick={() => setManualExpansion((previous) => ({
                              ...previous,
                              [String(node.entry.index)]: !row.expanded,
                            }))}
                            aria-label={row.expanded ? `כווץ ${node.entry.title}` : `הרחב ${node.entry.title}`}
                            aria-expanded={row.expanded}
                            className="shrink-0 rounded p-1.5 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {row.expanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                          </button>
                        ) : (
                          <span className="w-[28px] shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => onGo(node.entry.index)}
                          title={node.entry.title}
                          className={`min-w-0 flex-1 truncate py-1.5 pl-2 text-start text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${node.matchesFilter ? 'font-semibold' : ''}`}
                        >
                          {node.entry.title}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <form
            className="p-2"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void doSearch(q);
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
              <button type="button" onClick={() => goResult(cursor <= 0 ? results.length - 1 : cursor - 1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה קודמת">
                <ChevronUp size={16} />
              </button>
              <button type="button" onClick={() => goResult(cursor >= results.length - 1 ? 0 : cursor + 1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה הבאה">
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
                  type="button"
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
