import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock3, Search, SlidersHorizontal, Settings2, X, ChevronDown } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { ContentLine, SearchResultItem, SearchTab } from '../types';
import { highlight, normalizeHe, processHtml } from '../utils/text';
import { Btn, EmptyState, Select, Spinner, Switch } from './ui';
import { fontStack } from './CommentaryPanel';
import { t } from '../i18n';
import { isExcludedBook } from '../utils/bookFilter';
import { GEMINI_API_KEY_STORAGE, GEMINI_SEARCH_MODE_STORAGE, searchWithGemini } from '../services/geminiSearch';

interface Opts {
  mode: 'advanced' | 'exact' | 'phrase' | 'fuzzy';
  category: string;
  limit: number;
  sortBy: 'catalogue' | 'relevance' | 'generation';
  gematria: boolean;
  slop: number;
  proximityScope: 'wordDistance' | 'sameParagraph' | 'sameSection';
  grouping: 'none' | 'sameSection' | 'identicalText' | 'byBook';
}
interface Cached {
  results: SearchResultItem[] | null;
  total: number;
  scannedCount?: number;
  totalBooks?: number;
  error: string;
  q: string;
  opts: Opts;
}
const cache = new Map<string, Cached>();
const defaultOpts: Opts = { mode: 'advanced', category: 'all', limit: 100, sortBy: 'relevance', gematria: false, slop: 0, proximityScope: 'wordDistance', grouping: 'none' };
const resultKey = (r: SearchResultItem) => `${r.bookId}:${r.lineIndex}:${r.bookTitle}`;

function hasVisibleSnippet(value: string | undefined): boolean {
  return Boolean(
    String(value ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
      .trim(),
  );
}

function normalizeEra(value: string | undefined): string {
  return normalizeHe(value || '')
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ');
}

export function generationRank(value: string | undefined): number {
  const era = normalizeEra(value);
  if (!era) return 99;
  if (era.includes('מקרא') || era.includes('תנכ') || era.includes('bible') || era.includes('tanakh')) return 0;
  if (era.includes('תנא') || era.includes('tanna') || era.includes('mishna')) return 1;
  if (era.includes('אמורא') || era.includes('amora') || era.includes('talmud')) return 2;
  if (era.includes('סבורא') || era.includes('savora')) return 3;
  if (era.includes('גאונ') || era.includes('gaon') || era.includes('geonim')) return 4;
  if (era.includes('ראשונ') || era.includes('rishon')) return 5;
  if (era.includes('אחרונ') || era.includes('acharon') || era.includes('achron')) return 6;
  if (era.includes('חסיד') || era.includes('kabbal') || era.includes('קבל')) return 6;
  if (era.includes('זמנ') || era.includes('עכשו') || era.includes('מודרנ') || era.includes('modern') || era.includes('contemporary')) return 7;
  return 50;
}

export function generationLabel(value: string | undefined): string {
  const rank = generationRank(value);
  return (
    {
      0: 'מקרא',
      1: 'תנאים',
      2: 'אמוראים',
      3: 'סבוראים',
      4: 'גאונים',
      5: 'ראשונים',
      6: 'אחרונים',
      7: 'זמננו',
    } as Record<number, string>
  )[rank] || (value?.trim() ? value.trim() : 'תקופה לא ידועה');
}

function generationRankForResult(heEra: string | undefined, categoryPath: string | undefined): number {
  const eraRank = generationRank(heEra);
  if (eraRank !== 50 && eraRank !== 99) return eraRank;

  // When a book has no explicit era, infer only from its catalogue category.
  // This keeps base Tanach texts before Talmud results without guessing from
  // words in the matched snippet itself.
  const category = normalizeEra(categoryPath || '');
  if (category.includes('מקרא') || category.includes('תנכ') || category.includes('תורה שבכתב')) return 0;
  if (category.includes('תנאים') || category.includes('משנה') || category.includes('תוספתא')) return 1;
  if (category.includes('אמורא') || category.includes('תלמוד') || category.includes('גמרא')) return 2;
  if (category.includes('סבורא')) return 3;
  if (category.includes('גאונ')) return 4;
  if (category.includes('ראשונ')) return 5;
  if (category.includes('אחרונ')) return 6;
  if (category.includes('זמנ') || category.includes('עכשו') || category.includes('מודרנ')) return 7;
  return eraRank;
}

export default function SearchTabView({ tab }: { tab: SearchTab }) {
  const { library, updateTab, openBookInNewTab, settings, recentSearches, recordSearch, removeRecentSearch, clearRecentSearches } = useApp();
  const lang = settings.interfaceLanguage;
  const cached = cache.get(tab.id);
  const [q, setQ] = useState(cached?.q ?? tab.query);
  const [opts, setOpts] = useState<Opts>(cached?.opts ?? defaultOpts);
  const [results, setResults] = useState<SearchResultItem[] | null>(cached?.results ?? null);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [scannedCount, setScannedCount] = useState(cached?.scannedCount ?? cached?.results?.length ?? 0);
  const [totalBooks, setTotalBooks] = useState<number | undefined>(cached?.totalBooks);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(cached?.error ?? '');
  const [showOpts, setShowOpts] = useState(false);
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);
  const [geminiEnabled, setGeminiEnabled] = useState(() => {
    try { return localStorage.getItem(GEMINI_SEARCH_MODE_STORAGE) === 'true'; } catch { return false; }
  });
  const [geminiKeyDraft, setGeminiKeyDraft] = useState('');
  const [geminiKeySaved, setGeminiKeySaved] = useState(() => {
    try { return Boolean(localStorage.getItem(GEMINI_API_KEY_STORAGE)); } catch { return false; }
  });
  const [geminiStatus, setGeminiStatus] = useState('');
  const [lastQ, setLastQ] = useState(cached?.q ?? '');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ lines: ContentLine[]; error: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const topCats = useMemo(() => library?.root.children.map((c) => c.name) ?? [], [library]);

  const persist = (patch: Partial<Cached>) => {
    const prev = cache.get(tab.id) ?? { results: null, total: 0, scannedCount: 0, error: '', q: '', opts };
    cache.set(tab.id, { ...prev, ...patch });
  };

  const sorted = useMemo(() => {
    if (!results) return null;
    // Enforce exclusions here as well as in api.search so cached results and
    // rows returned before the catalogue finished loading cannot reappear.
    const visible = results.filter((result) => {
      const catalogBook = library?.byId.get(String(result.bookId));
      return !isExcludedBook({ ...result, ...(catalogBook || {}) });
    });
    // Relevance and generation ordering must come from the search engine.
    // Client-side generation sorting would only reorder the loaded page and break pagination.
    if (opts.sortBy === 'relevance' || opts.sortBy === 'generation') return visible;
    const catalogueIndex = new Map(library?.books.map((b, i) => [String(b.id), i]) ?? []);
    return visible
      .map((result, index) => ({ result, index }))
      .sort((a, b) => {
        const ai = catalogueIndex.get(String(a.result.bookId)) ?? Number.MAX_SAFE_INTEGER;
        const bi = catalogueIndex.get(String(b.result.bookId)) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi || a.result.lineIndex - b.result.lineIndex || a.index - b.index;
      })
      .map((x) => x.result);
  }, [results, opts.sortBy, library]);

  const selectedResult = useMemo(() => (sorted?.length ? sorted.find((r) => resultKey(r) === previewKey) ?? null : null), [sorted, previewKey]);

  // client-side grouping of the displayed page
  const grouped = useMemo(() => {
    if (!sorted) return null;
    if (opts.grouping === 'identicalText') {
      const seen = new Set<string>();
      const out: SearchResultItem[] = [];
      for (const r of sorted) {
        const k = normalizeHe(r.snippet || '').slice(0, 160);
        // Empty snippets are not equal text; keep those results distinct.
        const dedupeKey = k || `missing:${resultKey(r)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(r);
      }
      return [{ title: '', items: out }];
    }
    if (opts.grouping === 'byBook' || opts.grouping === 'sameSection') {
      const map = new Map<string, SearchResultItem[]>();
      for (const r of sorted) {
        const k = opts.grouping === 'byBook' ? r.bookTitle : `${r.bookTitle} · ${r.reference || ''}`;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      }
      return Array.from(map.entries()).map(([title, items]) => ({ title, items }));
    }
    return [{ title: '', items: sorted }];
  }, [sorted, opts.grouping, opts.sortBy, library]);

  const buildParams = (text: string, o: Opts, offset: number) => ({
    query: text,
    limit: o.limit,
    offset,
    category: o.category,
    exactMatch: o.mode === 'exact',
    gematriaSearch: o.gematria,
    mode: o.mode,
    sortBy: o.sortBy,
    slop: o.slop,
    proximityScope: o.proximityScope,
    resultGrouping: o.grouping === 'byBook' ? 'none' : o.grouping,
  });

  const run = useCallback(
    async (query: string, o: Opts) => {
      const text = query.trim();
      if (!text) return;
      setLoading(true);
      setError('');
      setLastQ(text);
      setResults(null);
      setPreviewKey(null);
      setPreview(null);
      setShowOpts(false);
      recordSearch(text);
      updateTab(tab.id, { query: text, title: 'חיפוש' });
      try {
        const r = await api.search(buildParams(text, o, 0));
        setResults(r.results);
        setTotal(Math.max(r.resultsCount, r.results.length));
        setScannedCount(r.scannedCount ?? r.results.length);
        setTotalBooks(r.totalBooks ?? new Set(r.results.map((x) => String(x.bookId))).size);
        persist({
          results: r.results,
          total: Math.max(r.resultsCount, r.results.length),
          scannedCount: r.scannedCount ?? r.results.length,
          totalBooks: r.totalBooks,
          error: '',
          q: text,
          opts: o,
        });
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        persist({ results: null, error: msg, q: text, opts: o });
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordSearch, tab.id, updateTab],
  );

  const runGemini = async (query: string, o: Opts) => {
    const text = query.trim();
    if (!text) return;

    let apiKey = '';
    try {
      apiKey = localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
    } catch {
      setError('לא ניתן לקרוא את המפתח מהדפדפן. בדוק את הגדרות האחסון בדפדפן.');
      setShowGeminiSettings(true);
      return;
    }
    if (!apiKey) {
      setError('כדי להשתמש בחיפוש החכם יש להוסיף מפתח Gemini אישי בחלונית ההגדרות שליד החיפוש.');
      setShowGeminiSettings(true);
      return;
    }

    // Keep the user's selected ordering. Candidate retrieval and Gemini relevance
    // ranking are separate from the final display order.
    const rankedOpts: Opts = { ...o, grouping: 'none' };
    setOpts(rankedOpts);
    setLoading(true);
    setError('');
    setGeminiStatus('מתחיל חיפוש חכם...');
    setLastQ(text);
    setQ(text);
    setResults(null);
    setTotal(0);
    setScannedCount(0);
    setTotalBooks(undefined);
    setPreviewKey(null);
    setPreview(null);
    setShowOpts(false);
    setShowGeminiSettings(false);
    recordSearch(text);
    updateTab(tab.id, { query: text, title: 'חיפוש' });

    try {
      const ranked = await searchWithGemini(text, apiKey, o.category, setGeminiStatus);
      const displayResults = rankedOpts.sortBy === 'generation'
        ? ranked
            .map((result, index) => {
              const book = library?.byId.get(String(result.bookId));
              return {
                result,
                index,
                eraRank: generationRankForResult(book?.heEra, book?.categoryPath || result.categoryPath),
              };
            })
            .sort((a, b) => a.eraRank - b.eraRank || a.index - b.index)
            .map(({ result }) => result)
        : ranked;
      const bookCount = new Set(displayResults.map((item) => String(item.bookId))).size;
      setResults(displayResults);
      setTotal(displayResults.length);
      setScannedCount(displayResults.length);
      setTotalBooks(bookCount);
      persist({
        results: displayResults,
        total: displayResults.length,
        scannedCount: displayResults.length,
        totalBooks: bookCount,
        error: '',
        q: text,
        opts: rankedOpts,
      });
    } catch (e) {
      const msg = (e as Error).message || 'החיפוש החכם נכשל. בדוק את מפתח Gemini ונסה שוב.';
      setError(msg);
      setResults(null);
      persist({ results: null, total: 0, scannedCount: 0, error: msg, q: text, opts: rankedOpts });
    } finally {
      setLoading(false);
      setGeminiStatus('');
    }
  };

  const submitSearch = (query: string, o: Opts) => {
    if (geminiEnabled) void runGemini(query, o);
    else void run(query, o);
  };

  const saveGeminiKey = () => {
    const value = geminiKeyDraft.trim();
    if (!value) {
      setError('יש להדביק מפתח Gemini לפני השמירה.');
      return;
    }
    try {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, value);
      setGeminiKeySaved(true);
      setGeminiKeyDraft('');
      setError('');
    } catch {
      setError('לא ניתן לשמור את המפתח בדפדפן. בדוק שהאחסון המקומי מופעל.');
    }
  };

  const removeGeminiKey = () => {
    try {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      setGeminiKeySaved(false);
      setGeminiKeyDraft('');
      setError('');
    } catch {
      setError('לא ניתן למחוק את המפתח מהדפדפן.');
    }
  };

  const loadMore = async () => {
    if (!results || loadingMore || scannedCount >= total) return;
    setLoadingMore(true);
    try {
      let offset = scannedCount;
      let scanned = scannedCount;
      let next = results.filter((result) => {
        const catalogBook = library?.byId.get(String(result.bookId));
        return !isExcludedBook({ ...result, ...(catalogBook || {}) });
      });
      let nextTotal = total;
      let noProgress = false;

      // A raw server page may contain only excluded books. Keep paging past
      // those pages instead of stopping early or using the shorter visible
      // result count as the server offset.
      for (let page = 0; page < 10 && scanned < nextTotal; page += 1) {
        const r = await api.search(buildParams(lastQ, opts, offset));
        const consumed = Math.max(0, Number(r.scannedCount ?? r.results.length));
        if (consumed === 0) {
          noProgress = true;
          break;
        }

        const seen = new Set(next.map(resultKey));
        const fresh = r.results.filter((result) => !seen.has(resultKey(result)));
        next = [...next, ...fresh];
        offset += consumed;
        scanned += consumed;
        nextTotal = Math.max(r.resultsCount, next.length);

        if (fresh.length > 0) break;
      }

      const finished = noProgress || scanned >= nextTotal;
      const finalTotal = finished ? next.length : nextTotal;
      setResults(next);
      setScannedCount(scanned);
      setTotal(finalTotal);
      persist({ results: next, total: finalTotal, scannedCount: scanned });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!cached && tab.query) submitSearch(tab.query, opts);
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab.query && tab.query !== lastQ && tab.query !== q) {
      setQ(tab.query);
      submitSearch(tab.query, opts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.query]);

  // Do not fetch book content for every search hit. Missing snippets stay lazy;
  // the content endpoint is called only for the selected result's preview.

  useEffect(() => {
    if (!selectedResult) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    api
      .content(selectedResult.bookId, Math.max(1, selectedResult.lineIndex - 4), selectedResult.lineIndex + 12)
      .then((d) => !cancelled && setPreview({ lines: d.lines, error: '' }))
      .catch((e) => !cancelled && setPreview({ lines: [], error: e.message || 'לא ניתן לטעון תצוגה מקדימה' }))
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedResult?.bookId, selectedResult?.lineIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Center the exact matched line inside the scrollable preview, rather than
  // merely showing the surrounding excerpt from the content API.
  useEffect(() => {
    if (!preview || preview.error || !selectedResult || preview.lines.length === 0) return;
    const container = previewScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>('[data-preview-target="true"]');
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = container.scrollTop + targetRect.top - containerRect.top;
    container.scrollTop = Math.max(
      0,
      targetTop - Math.max(0, (container.clientHeight - target.offsetHeight) / 2),
    );
  }, [preview, selectedResult?.bookId, selectedResult?.lineIndex]);

  const textOpts = useMemo(
    () => ({ nikud: settings.showNikud, teamim: settings.showTeamim, punctuation: settings.showPunctuation, holyName: settings.holyNameReplacement }),
    [settings.showNikud, settings.showTeamim, settings.showPunctuation, settings.holyNameReplacement],
  );

  const openResult = (r: SearchResultItem) => {
    const matches = (results ?? []).filter((x) => String(x.bookId) === String(r.bookId)).map((x) => x.lineIndex).sort((a, b) => a - b);
    openBookInNewTab({ id: r.bookId, title: r.bookTitle, categoryPath: r.categoryPath }, r.lineIndex, { text: lastQ, matches });
  };

  const hasMore = !!results && total > scannedCount;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="border-b border-outline-variant px-3 py-2.5 md:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(q, opts);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative max-w-3xl flex-1">
            <Search size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-variant" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                if (!v.trim()) {
                  setResults(null);
                  setError('');
                  setPreviewKey(null);
                  persist({ results: null, error: '', q: '' });
                }
              }}
              placeholder={t('חיפוש בכל הספרייה', lang)}
              className="h-11 w-full rounded-full border border-outline-variant bg-surface-2 pr-11 pl-10 text-[15px] outline-none focus:border-primary focus:bg-surface"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-variant">
                <X size={18} />
              </button>
            )}
          </div>
          <Btn type="submit" variant="filled">
            {t('חפש', lang)}
          </Btn>
          <button
            type="button"
            onClick={() => setShowOpts((s) => !s)}
            className={`flex h-10 items-center gap-1 rounded-full px-3 text-sm ${showOpts ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`}
            title="אפשרויות חיפוש"
          >
            <SlidersHorizontal size={18} /> <ChevronDown size={14} className={`transition ${showOpts ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowGeminiSettings((open) => !open)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${showGeminiSettings || geminiEnabled ? 'border-primary/50 bg-primary/5 text-primary' : 'border-outline-variant text-on-variant hover:bg-surface-3'}`}
            title="הגדרות חיפוש חכם"
            aria-label="הגדרות חיפוש חכם"
            aria-expanded={showGeminiSettings}
          >
            <Settings2 size={17} />
          </button>
        </form>

        {showOpts && (
          <div className="fade-in mt-2 flex max-w-4xl flex-wrap items-end gap-3 rounded-2xl border border-outline-variant bg-surface-1 px-4 py-3">
            <label className="text-xs text-on-variant">
              סוג חיפוש
              <Select
                className="mt-1 block"
                value={opts.mode}
                onChange={(mode) => setOpts({ ...opts, mode })}
                options={[
                  { value: 'advanced', label: 'חיפוש מתקדם' },
                  { value: 'exact', label: 'התאמה מדויקת' },
                  { value: 'phrase', label: 'ביטוי' },
                  { value: 'fuzzy', label: 'חיפוש מקורב' },
                ]}
              />
            </label>
            <label className="text-xs text-on-variant">
              קטגוריה
              <Select className="mt-1 block max-w-[180px]" value={opts.category} onChange={(category) => setOpts({ ...opts, category })} options={[{ value: 'all', label: 'כל הספרייה' }, ...topCats.map((c) => ({ value: c, label: c }))]} />
            </label>
            <label className="text-xs text-on-variant">
              מיון
              <Select
                className="mt-1 block"
                value={opts.sortBy}
                onChange={(sortBy) => setOpts({ ...opts, sortBy })}
                options={[
                  { value: 'relevance', label: 'לפי רלוונטיות' },
                  { value: 'catalogue', label: 'לפי סדר הספרייה' },
                  { value: 'generation', label: 'לפי תקופה' },
                ]}
              />
            </label>
            <label className="text-xs text-on-variant">
              תוצאות בכל טעינה
              <Select className="mt-1 block" value={opts.limit} onChange={(limit) => setOpts({ ...opts, limit })} options={[50, 100, 200, 500].map((n) => ({ value: n, label: String(n) }))} />
            </label>
            <label className="text-xs text-on-variant">
              מרחק בין מילים
              <Select
                className="mt-1 block"
                value={opts.slop}
                onChange={(slop) => setOpts({ ...opts, slop })}
                options={[
                  { value: 0, label: 'צמודות' },
                  { value: 2, label: 'עד 2 מילים' },
                  { value: 5, label: 'עד 5 מילים' },
                  { value: 10, label: 'עד 10 מילים' },
                  { value: 30, label: 'עד 30 מילים' },
                ]}
              />
            </label>
            <label className="text-xs text-on-variant">
              תחום הקרבה
              <Select
                className="mt-1 block"
                value={opts.proximityScope}
                onChange={(proximityScope) => setOpts({ ...opts, proximityScope })}
                options={[
                  { value: 'wordDistance', label: 'מרחק מילים' },
                  { value: 'sameParagraph', label: 'אותה פסקה' },
                  { value: 'sameSection', label: 'אותו קטע' },
                ]}
              />
            </label>
            <label className="text-xs text-on-variant">
              קיבוץ תוצאות
              <Select
                className="mt-1 block"
                value={opts.grouping}
                onChange={(grouping) => setOpts({ ...opts, grouping })}
                options={[
                  { value: 'none', label: 'ללא' },
                  { value: 'byBook', label: 'לפי ספר' },
                  { value: 'sameSection', label: 'אותו קטע' },
                  { value: 'identicalText', label: 'טקסט זהה' },
                ]}
              />
            </label>
            <label className="flex items-center gap-2 pb-1 text-sm">
              <Switch checked={opts.gematria} onChange={(gematria) => setOpts({ ...opts, gematria })} /> גימטריה
            </label>
            <Btn variant="tonal" onClick={() => submitSearch(q, opts)} disabled={!q.trim()}>
              החל וחפש
            </Btn>
          </div>
        )}

        {showGeminiSettings && (
          <section className="fade-in mt-2 max-w-3xl rounded-2xl border border-outline-variant bg-surface-1 px-4 py-3.5" dir="rtl" aria-label="הגדרות חיפוש חכם">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={geminiEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setGeminiEnabled(enabled);
                    setError('');
                    try { localStorage.setItem(GEMINI_SEARCH_MODE_STORAGE, String(enabled)); } catch { /* local preference only */ }
                  }}
                  className="h-4 w-4 accent-[var(--c-primary)]"
                />
                הפעל חיפוש חכם באמצעות Gemini
              </label>
              <span className="text-xs text-on-variant">
                {geminiKeySaved ? 'מפתח אישי שמור בדפדפן' : 'לא הוגדר מפתח'}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-on-variant">
              Gemini יציע ניסוחי חיפוש, יבדוק תוצאות קיימות במאגר וידרג אותן. יוצגו ספרים וקטעים בלבד, ללא תשובה מילולית מהמודל.
            </p>

            <div className="mt-3">
              <label htmlFor="gemini-api-key" className="mb-1.5 block text-xs font-medium text-on-surface">
                מפתח API אישי של Gemini
              </label>
              <input
                id="gemini-api-key"
                type="password"
                value={geminiKeyDraft}
                onChange={(e) => setGeminiKeyDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={geminiKeySaved ? 'מפתח שמור — הדבק כאן רק אם רוצים להחליף אותו' : 'הדבק כאן את המפתח האישי'}
                className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary"
                dir="ltr"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveGeminiKey}
                  disabled={!geminiKeyDraft.trim()}
                  className="rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  שמירת המפתח בדפדפן
                </button>
                {geminiKeySaved && (
                  <button
                    type="button"
                    onClick={removeGeminiKey}
                    className="rounded-full border border-outline-variant px-3.5 py-2 text-xs text-on-variant transition hover:bg-surface-3"
                  >
                    מחיקת המפתח
                  </button>
                )}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline underline-offset-2"
                >
                  ניהול מפתח ב-Google AI Studio
                </a>
              </div>
            </div>

            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs leading-5 text-on-variant">
              חשוב: אין להכניס מפתח שמחויב בתשלום או מפתח משותף — השתמשו במפתח אישי עם מכסה חינמית בלבד, ובדקו את התנאים והמכסה בחשבון Google. המפתח נשמר באחסון המקומי של הדפדפן ונשלח ישירות ל-Google; אין אחריות לדליפה, לשימוש לא מורשה, לחריגה מהמכסה או לחיובים.
            </p>
          </section>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        {/* results – right side (first in RTL) */}
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 pb-8 md:px-6" style={{ order: 1 }}>
          {loading && <Spinner label={geminiEnabled ? (geminiStatus || 'מחפש...') : 'מחפש...'} />}
          {error && !loading && <div className="m-4 rounded-xl bg-surface-2 p-4 text-sm text-error">{error}</div>}

          {!loading && !results && !error && !q.trim() && recentSearches.length > 0 && (
            <div className="mx-auto max-w-3xl py-4">
              <div className="mb-3 flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-sm font-medium text-on-variant">
                  <Clock3 size={17} /> חיפושים אחרונים
                </div>
                <button onClick={clearRecentSearches} className="text-xs text-primary hover:underline">
                  מחיקת הכול
                </button>
              </div>
              {recentSearches.map((item) => (
                <div key={`${item.query}-${item.searchedAt}`} className="mb-1 flex items-center rounded-xl hover:bg-surface-3">
                  <button
                    onClick={() => {
                      setQ(item.query);
                      submitSearch(item.query, opts);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-start"
                  >
                    <Search size={16} className="shrink-0 text-on-variant" />
                    <span className="truncate">{item.query}</span>
                  </button>
                  <button onClick={() => removeRecentSearch(item.query)} className="rounded-full p-2 text-on-variant hover:bg-surface-2" title="מחק חיפוש">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {!loading && !results && !error && !q.trim() && recentSearches.length === 0 && (
            <EmptyState icon={<Search size={60} />} title="חיפוש בכל הספרייה" hint="הקלידו מילה או ביטוי ולחצו Enter. ניתן לדייק את החיפוש באמצעות האפשרויות." />
          )}
          {!loading && !results && !error && q.trim() && <EmptyState icon={<Search size={44} />} title="לחצו Enter כדי להתחיל בחיפוש" />}

          {!loading && sorted && (
            <div className="mx-auto max-w-4xl">
              <div className="py-3 text-sm text-on-variant">
                {sorted.length === 0 ? (
                  'לא נמצאו תוצאות'
                ) : total > sorted.length ? (
                  <>
                    נמצאו <b>{total.toLocaleString('he-IL')}</b> מופעים{totalBooks ? <> ב־<b>{totalBooks}</b> ספרים</> : null} עבור "{lastQ}" · מוצגות <b>{sorted.length}</b> תוצאות
                  </>
                ) : (
                  <>
                    נמצאו <b>{sorted.length.toLocaleString('he-IL')}</b> תוצאות{totalBooks ? <> ב־<b>{totalBooks}</b> ספרים</> : null} עבור "{lastQ}"
                  </>
                )}
                <span className="mr-2 text-xs">(לחיצה – תצוגה מקדימה, לחיצה כפולה – פתיחה בלשונית)</span>
              </div>
              {sorted.length > 0 && (
                <div className="sticky top-0 z-[2] mb-2 flex flex-wrap items-center gap-2 bg-surface/95 py-2 backdrop-blur">
                  <span className="text-xs text-on-variant">{t('מיון', lang)}:</span>
                  {(
                    [
                      ['relevance', 'רלוונטיות'],
                      ['catalogue', 'סדר הספרייה'],
                      ['generation', 'תקופה'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => {
                        const nextOpts = { ...opts, sortBy: v };
                        setOpts(nextOpts);
                        if (lastQ.trim()) void submitSearch(lastQ, nextOpts);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        opts.sortBy === v ? 'border-transparent bg-sec-container text-on-sec-container' : 'border-outline-variant text-on-variant hover:bg-surface-3'
                      }`}
                    >
                      {t(label, lang)}
                    </button>
                  ))}
                  <span className="mr-3 text-xs text-on-variant">{t('קיבוץ', lang)}:</span>
                  {(
                    [
                      ['none', 'ללא'],
                      ['byBook', 'לפי ספר'],
                      ['sameSection', 'קטע'],
                      ['identicalText', 'טקסט זהה'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setOpts((o) => ({ ...o, grouping: v }))}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        opts.grouping === v ? 'border-transparent bg-sec-container text-on-sec-container' : 'border-outline-variant text-on-variant hover:bg-surface-3'
                      }`}
                    >
                      {t(label, lang)}
                    </button>
                  ))}
                  <span className="text-[11px] text-on-variant">{lang === 'en' ? 'Sorting is handled by the search engine across pages' : 'המיון מתבצע במנוע החיפוש ונשמר בין עמודים'}</span>
                </div>
              )}
              {grouped?.map((group) => (
                <div key={group.title || 'all'}>
                  {group.title && (
                    <div className="sticky top-0 z-[1] bg-surface/95 py-1.5 text-sm font-bold text-primary backdrop-blur">
                      {group.title} <span className="font-normal text-on-variant">({group.items.length})</span>
                    </div>
                  )}
                  {group.items.map((r) => {
                    const k = resultKey(r);
                    const sel = k === previewKey;
                    const displaySnippet = hasVisibleSnippet(r.snippet) ? String(r.snippet) : '';
                    return (
                      <button
                        key={k}
                        onClick={() => setPreviewKey(k)}
                        onDoubleClick={() => openResult(r)}
                        className={`fade-in mb-2 block w-full rounded-2xl border px-4 py-3 text-start transition ${sel ? 'border-primary/50 bg-primary/5' : 'border-outline-variant bg-surface-1 hover:bg-surface-3'}`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-primary">{r.bookTitle}</span>
                          {r.reference && <span className="text-sm text-on-variant">{r.reference}</span>}
                          <span className="shrink-0 text-xs text-on-variant">שורה {r.lineIndex}</span>
                          {opts.sortBy === 'generation' &&
                            (() => {
                              const era = library?.byId.get(String(r.bookId))?.heEra;
                              return era ? (
                                <span className="shrink-0 rounded-full bg-sec-container px-2 py-0.5 text-[11px] text-on-sec-container">
                                  {era}
                                </span>
                              ) : null;
                            })()}
                        </div>
                        {r.categoryPath && <div className="mb-1 text-xs text-on-variant">{r.categoryPath}</div>}
                        {hasVisibleSnippet(displaySnippet) ? (
                          <div
                            dir="rtl"
                            className="book-text mt-1 line-clamp-4 text-[17px] leading-relaxed"
                            style={{ fontFamily: fontStack(settings.fontFamily) }}
                            dangerouslySetInnerHTML={{ __html: highlight(processHtml(displaySnippet, textOpts), lastQ) }}
                          />
                        ) : (
                          <div dir="rtl" className="mt-1 text-sm text-on-variant" role="status">לחצו על התוצאה כדי לטעון את התצוגה המקדימה</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              {hasMore && (
                <div className="py-3 text-center">
                  <Btn variant="tonal" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'טוען…' : `טען עוד תוצאות (מוצגות ${sorted.length} מתוך ${total.toLocaleString('he-IL')})`}
                  </Btn>
                </div>
              )}
            </div>
          )}
        </section>

        {/* preview – left side */}
        {selectedResult && (
          <aside
            className="flex max-h-[55vh] min-h-[320px] shrink-0 flex-col border-t border-outline-variant bg-surface-1 lg:max-h-none lg:min-h-0 lg:w-[min(460px,42%)] lg:border-t-0 lg:border-r"
            style={{ order: 2 }}
          >
            <div className="border-b border-outline-variant p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-medium">{selectedResult.bookTitle}</div>
                  <div className="text-xs text-on-variant">
                    {selectedResult.reference || `שורה ${selectedResult.lineIndex}`}
                    {selectedResult.categoryPath && ` · ${selectedResult.categoryPath}`}
                  </div>
                </div>
                <button onClick={() => setPreviewKey(null)} className="rounded-full p-1 text-on-variant hover:bg-surface-3" aria-label="סגור תצוגה מקדימה">
                  <X size={18} />
                </button>
              </div>
              <Btn variant="filled" className="mt-3 w-full" onClick={() => openResult(selectedResult)}>
                <BookOpen size={16} /> פתח בלשונית חדשה
              </Btn>
            </div>
            <div ref={previewScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              {previewLoading && <Spinner label="טוען תצוגה מקדימה..." />}
              {preview?.error && <div className="text-sm text-error">{preview.error}</div>}
              {preview && !preview.error && preview.lines.length > 0 && (
                <div className="book-text" style={{ fontFamily: fontStack(settings.fontFamily), fontSize: Math.max(16, settings.fontSize - 3), lineHeight: settings.lineHeight }}>
                  {preview.lines.map((line) => {
                    const isTarget = line.lineIndex === selectedResult.lineIndex;
                    return (
                      <div key={line.lineIndex} data-preview-target={isTarget ? 'true' : undefined} className={`mb-1 rounded px-2 py-1 ${isTarget ? 'bg-primary/15' : ''}`}>
                        {line.heRef && (
                          <div className="mb-0.5 text-[11px] text-on-variant" style={{ fontFamily: 'Heebo, sans-serif' }}>
                            {line.heRef}
                          </div>
                        )}
                        <div dangerouslySetInnerHTML={{ __html: highlight(processHtml(line.content, textOpts), lastQ) }} />
                      </div>
                    );
                  })}
                </div>
              )}
              {preview && !preview.error && preview.lines.length === 0 && (
                <div className="book-text text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: highlight(processHtml(selectedResult.snippet, textOpts), lastQ) }} />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
