import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { searchLibrary, getBookContent } from '../services/api';
import { SearchResultItem, ReaderSettings, BookFacetCount } from '../types/otzaria';
import { sysLogger } from '../services/logger';
import {
  subscribeToSearchHistory,
  saveSearchQuery,
  SearchHistoryItem,
  removeSearchQuery,
  clearSearchHistory
} from '../services/userService';
import {
  Search,
  Filter,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Hash,
  Clock,
  SlidersHorizontal,
  Settings2,
  ArrowUpDown,
  X,
  ExternalLink,
  Maximize2,
  Minimize2,
  Loader2,
  AlertTriangle
} from 'lucide-react';
// Lazy load SmartSearchView for optimized bundle sizing
const SmartSearchView = lazy(() => import('./SmartSearchView').then(m => ({ default: m.SmartSearchView })));
import { FoundationalBookClassifier } from '../utils/foundationalBookClassifier';
import { sanitizeSnippetHtml, sanitizeBookHtml } from '../utils/sanitizeHtml';
import { buildHebrewSearchRegex, highlightSearchText } from '../utils/searchHelpers';

interface SearchViewProps {
  settings?: ReaderSettings;
  onOpenBookAtLine: (bookId: number | string, bookTitle: string, lineIndex: number, initialSearch?: string) => void;
}

export interface GroupedBookResult {
  bookId: number | string;
  bookTitle: string;
  categoryPath: string;
  totalFacetHits?: number;
  hits: SearchResultItem[];
}

// Smart Hebrew normalization for client-side facet filtering
function normalizeHebrew(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u0591-\u05C7]/g, '') // remove nikud & teamim
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .toLowerCase()
    .trim();
}

export const SearchView: React.FC<SearchViewProps> = ({ settings, onOpenBookAtLine }) => {
  const [query, setQuery] = useState('');
  const [executedQuery, setExecutedQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [exactMatch, setExactMatch] = useState(false);
  const [gematriaSearch, setGematriaSearch] = useState(false);

  // Advanced search parameters matching Otzaria SearchConfiguration
  const [mode, setMode] = useState<'advanced' | 'exact' | 'phrase' | 'fuzzy'>('advanced');
  const [slop, setSlop] = useState<number>(0);
  const [proximityScope, setProximityScope] = useState<'wordDistance' | 'sameParagraph' | 'sameSection'>('wordDistance');
  const [sortBy, setSortBy] = useState<'relevance' | 'generation'>('relevance');
  const [resultGrouping, setResultGrouping] = useState<'none' | 'sameSection' | 'identicalText'>('none');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [bookFacets, setBookFacets] = useState<BookFacetCount[]>([]);
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const [totalBooks, setTotalBooks] = useState<number | null>(null);
  const [hasMoreResults, setHasMoreResults] = useState<boolean>(false);
  const [resultsLimit, setResultsLimit] = useState<number>(50);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingBookHits, setIsLoadingBookHits] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [tab, setTab] = useState<'normal' | 'smart'>('normal');

  // Post-search filtering & sorting controls (default: relevance)
  const [filterBookQuery, setFilterBookQuery] = useState('');
  const [activeSortOrder, setActiveSortOrder] = useState<'relevance' | 'generation' | 'title'>('relevance');

  // Preview Pane & Selection States
  const [showPreviewPane, setShowPreviewPane] = useState<boolean>(true);
  const [selectedBookIndex, setSelectedBookIndex] = useState<number>(0);
  const [selectedHitIndex, setSelectedHitIndex] = useState<number>(0);

  const [previewLines, setPreviewLines] = useState<Array<{ lineIndex: number; text: string }>>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  const previewScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const isDark = settings?.theme === 'dark';

  const activeTabClass = `px-4 py-2 rounded-lg font-bold text-sm ${
    isDark ? 'bg-amber-800 text-white' : 'bg-amber-800 text-white'
  }`;
  const inactiveTabClass = `px-4 py-2 rounded-lg font-bold text-sm ${
    isDark ? 'bg-stone-800 text-stone-300' : 'bg-stone-200 text-stone-700'
  }`;

  // Group search results by book
  const groupedBookResults = useMemo<GroupedBookResult[]>(() => {
    const map = new Map<string, GroupedBookResult>();

    // First populate from bookFacets if available
    if (bookFacets.length > 0) {
      for (const facet of bookFacets) {
        const key = `${facet.bookId}_${facet.title}`;
        map.set(key, {
          bookId: facet.bookId,
          bookTitle: facet.title,
          categoryPath: facet.categoryPath || facet.category || 'כללי',
          totalFacetHits: facet.count,
          hits: []
        });
      }
    }

    // Populate actual hit snippets
    for (const res of results) {
      const key = `${res.bookId}_${res.bookTitle}`;
      if (!map.has(key)) {
        map.set(key, {
          bookId: res.bookId,
          bookTitle: res.bookTitle,
          categoryPath: res.categoryPath,
          hits: []
        });
      }
      map.get(key)!.hits.push(res);
    }

    let list = Array.from(map.values());

    // Filter by book title or category using normalized Hebrew
    if (filterBookQuery.trim()) {
      const normQ = normalizeHebrew(filterBookQuery);
      list = list.filter(
        b =>
          normalizeHebrew(b.bookTitle).includes(normQ) ||
          normalizeHebrew(b.categoryPath).includes(normQ)
      );
    }

    // Sort books list
    if (activeSortOrder === 'generation') {
      list.sort((a, b) => {
        const scoreA = FoundationalBookClassifier.getGlobalBookOrderScore({
          categoryPath: a.categoryPath,
          title: a.bookTitle
        });
        const scoreB = FoundationalBookClassifier.getGlobalBookOrderScore({
          categoryPath: b.categoryPath,
          title: b.bookTitle
        });
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.bookTitle.localeCompare(b.bookTitle, 'he');
      });
    } else if (activeSortOrder === 'title') {
      list.sort((a, b) => (a.bookTitle || '').localeCompare(b.bookTitle || '', 'he'));
    } else if (activeSortOrder === 'relevance') {
      list.sort((a, b) => {
        const countA = a.totalFacetHits ?? a.hits.length;
        const countB = b.totalFacetHits ?? b.hits.length;
        return countB - countA;
      });
    }

    return list;
  }, [results, bookFacets, filterBookQuery, activeSortOrder]);

  // Active book & active hit
  const activeBook: GroupedBookResult | null = useMemo(() => {
    if (groupedBookResults.length === 0) return null;
    const safeBookIdx = Math.min(Math.max(0, selectedBookIndex), groupedBookResults.length - 1);
    return groupedBookResults[safeBookIdx] || null;
  }, [groupedBookResults, selectedBookIndex]);

  const activeHit: SearchResultItem | null = useMemo(() => {
    if (!activeBook || activeBook.hits.length === 0) return null;
    const safeHitIdx = Math.min(Math.max(0, selectedHitIndex), activeBook.hits.length - 1);
    return activeBook.hits[safeHitIdx] || null;
  }, [activeBook, selectedHitIndex]);

  // Memoized search highlight regex for preview pane:
  // Strictly extracts ONLY the terms highlighted by the server in activeHit.snippet,
  // without adding extraneous words from query, as requested by user.
  const highlightRegex = useMemo(() => {
    const effectiveQuery = (executedQuery || query).trim();
    if (!activeHit && !effectiveQuery) return null;

    const terms = new Set<string>();

    // 1. חילוץ אך ורק המילים והביטויים שהשרת סימן בהדגשה בתוצאה הספציפית הזו (snippet)
    if (activeHit?.snippet) {
      // פענוח ישויות HTML כגון &quot;, &#x27;, &amp;, &lt;, &gt;
      const decodedSnippet = activeHit.snippet
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const regexTag = /(?:<b>|<em>|<mark[^>]*>)(.*?)(?:<\/b>|<\/em>|<\/mark>)/gi;
      let match;
      while ((match = regexTag.exec(decodedSnippet)) !== null) {
        if (match[1]) {
          const cleanTerm = match[1].replace(/<[^>]*>/g, '').trim();
          if (cleanTerm) {
            // הוספת הביטוי השלם שהשרת הדגיש
            terms.add(cleanTerm);
            // והוספת כל מילה מתוכו בנפרד (תוך ניקוי סימני פיסוק חיצוניים כגון סוגריים, מרכאות או פסיקים)
            cleanTerm.split(/\s+/).forEach(w => {
              const cleanW = w.replace(/^[^\u0590-\u05FF0-9]+|[^\u0590-\u05FF0-9]+$/g, '');
              if (cleanW.length > 1) {
                terms.add(cleanW);
              }
            });
          }
        }
      }
    }

    // 2. רק במקרה חריג שבו השרת לא סימן שום תגית הדגשה ב-snippet, נשתמש במילות השאילתה כגיבוי
    if (terms.size === 0 && effectiveQuery) {
      const cleanQ = effectiveQuery
        .replace(/[~*?^()+/\\-]/g, ' ')
        .replace(/\b(AND|OR|NOT)\b/gi, ' ')
        .trim();

      if (cleanQ) {
        const noQuotes = cleanQ.replace(/["״]/g, '').trim();
        if (noQuotes) terms.add(noQuotes);

        noQuotes.split(/\s+/).forEach(w => {
          const cleanW = w.replace(/^[^\u0590-\u05FF0-9]+|[^\u0590-\u05FF0-9]+$/g, '');
          if (cleanW.length > 1) terms.add(cleanW);
        });
      }
    }

    const termArray = Array.from(terms).filter(Boolean);
    if (termArray.length === 0) return buildHebrewSearchRegex(effectiveQuery);

    const patterns: string[] = [];
    for (const t of termArray) {
      const reg = buildHebrewSearchRegex(t);
      if (reg) {
        let src = reg.source;
        if (src.startsWith('(') && src.endsWith(')')) {
          src = src.slice(1, -1);
        }
        if (src) patterns.push(src);
      }
    }

    if (patterns.length === 0) return buildHebrewSearchRegex(effectiveQuery);

    // מיון לפי אורך יורד כדי שביטויים שלמים יתפסו לפני מילים בודדות
    patterns.sort((a, b) => b.length - a.length);
    return new RegExp(`(${patterns.join('|')})`, 'gi');
  }, [activeHit, query, executedQuery]);

  // Handle book selection - loads hits on-demand if not already fetched
  const handleSelectBook = async (bookIdx: number, gb: GroupedBookResult) => {
    setSelectedBookIndex(bookIdx);
    setSelectedHitIndex(0);
    if (!showPreviewPane) setShowPreviewPane(true);

    // If hits already loaded for this book, nothing more to fetch
    if (gb.hits.length > 0) return;

    // Fetch hits for this specific book on-demand
    setIsLoadingBookHits(true);
    try {
      const activeMode = exactMatch ? 'exact' : (mode === 'exact' ? 'advanced' : mode);
      const activeSlop = exactMatch ? 0 : slop;

      const data = await searchLibrary(
        query.trim(),
        category,
        exactMatch,
        gematriaSearch,
        50,
        {
          mode: activeMode,
          slop: activeSlop,
          bookId: gb.bookId,
          proximityScope,
          sortBy,
          resultGrouping
        }
      );

      if (data.results && data.results.length > 0) {
        setResults(prev => {
          const existingIds = new Set(prev.map(r => `${r.bookId}_${r.lineIndex}`));
          const newHits = data.results.filter(r => !existingIds.has(`${r.bookId}_${r.lineIndex}`));
          return [...prev, ...newHits];
        });
      }
    } catch (err: any) {
      console.error('Failed to load on-demand hits for book:', err);
    } finally {
      setIsLoadingBookHits(false);
    }
  };

  // Subscribe to persistent search history
  useEffect(() => {
    const unsubscribe = subscribeToSearchHistory((searches) => {
      setRecentSearches(searches);
    });
    return () => unsubscribe();
  }, []);

  // Reset selection indices on new search results
  useEffect(() => {
    setSelectedBookIndex(0);
    setSelectedHitIndex(0);
  }, [results]);

  // Fetch book content preview whenever active hit changes
  useEffect(() => {
    if (!activeHit) {
      setPreviewLines([]);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);

    const startLine = Math.max(1, activeHit.lineIndex - 15);
    const endLine = activeHit.lineIndex + 25;

    getBookContent(activeHit.bookId, startLine, endLine)
      .then(res => {
        if (!isMounted) return;
        if (res.lines && res.lines.length > 0) {
          setPreviewLines(res.lines.map(l => ({ lineIndex: l.lineIndex, text: l.content })));
        } else if (res.content) {
          const lines = res.content.split('\n').map((text, idx) => ({
            lineIndex: startLine + idx,
            text
          }));
          setPreviewLines(lines);
        } else {
          setPreviewLines([{ lineIndex: activeHit.lineIndex, text: activeHit.snippet }]);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch preview content:', err);
        if (isMounted) {
          setPreviewLines([{ lineIndex: activeHit.lineIndex, text: activeHit.snippet }]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeHit]);

  // Scroll active line into view in preview pane
  useEffect(() => {
    if (activeLineRef.current && previewScrollRef.current) {
      setTimeout(() => {
        activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [previewLines, selectedHitIndex, selectedBookIndex]);

  const handleSearch = async (e?: React.FormEvent, explicitQuery?: string, explicitLimit?: number) => {
    if (e) e.preventDefault();
    const targetQuery = (explicitQuery !== undefined ? explicitQuery : query).trim();
    if (!targetQuery) return;

    setExecutedQuery(targetQuery);
    if (explicitQuery !== undefined) {
      setQuery(targetQuery);
    }

    const currentLimit = explicitLimit || resultsLimit;
    setIsSearching(true);
    setSelectedBookIndex(0);
    setSelectedHitIndex(0);
    const activeMode = exactMatch ? 'exact' : (mode === 'exact' ? 'advanced' : mode);
    const activeSlop = exactMatch ? 0 : slop;

    sysLogger.addLog(
      'info',
      'Search',
      `ביצוע חיפוש במאגר: "${targetQuery}" (מצב: ${activeMode}, מרווח slop: ${activeSlop}, קטגוריה: ${category}, כמות: ${currentLimit})`
    );

    // Save search history
    saveSearchQuery(targetQuery, category);

    try {
      const data = await searchLibrary(
        targetQuery,
        category,
        exactMatch,
        gematriaSearch,
        currentLimit,
        {
          mode: activeMode,
          slop: activeSlop,
          proximityScope,
          sortBy,
          resultGrouping
        }
      );
      setResults(data.results);
      setBookFacets(data.bookCounts || []);
      setResultsCount(data.resultsCount);
      setTotalBooks(data.totalBooks ?? null);
      setHasMoreResults(data.hasMore || (data.resultsCount > 5000));
      sysLogger.addLog(
        'success',
        'Search',
        `החיפוש עבור "${targetQuery}" הושלם: נמצאו ${data.resultsCount} מופעים ב-${data.totalBooks ?? (data.bookCounts ? data.bookCounts.length : 'מספר')} ספרים (מוצגים ${data.results.length})`
      );
    } catch (err: any) {
      console.error('Search error', err);
      sysLogger.addLog('error', 'Search', `שגיאה בחיפוש "${targetQuery}": ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || isSearching || !query.trim()) return;
    const currentOffset = results.length;
    setIsLoadingMore(true);

    const activeMode = exactMatch ? 'exact' : (mode === 'exact' ? 'advanced' : mode);
    const activeSlop = exactMatch ? 0 : slop;

    try {
      const data = await searchLibrary(
        query.trim(),
        category,
        exactMatch,
        gematriaSearch,
        50,
        {
          mode: activeMode,
          slop: activeSlop,
          offset: currentOffset,
          proximityScope,
          sortBy,
          resultGrouping
        }
      );
      if (data.results && data.results.length > 0) {
        setResults(prev => {
          const existingIds = new Set(prev.map(r => `${r.bookId}_${r.lineIndex}`));
          const newHits = data.results.filter(r => !existingIds.has(`${r.bookId}_${r.lineIndex}`));
          return [...prev, ...newHits];
        });
      }
      setResultsCount(data.resultsCount);
      if (data.totalBooks) setTotalBooks(data.totalBooks);
      if (data.bookCounts && data.bookCounts.length > 0) setBookFacets(data.bookCounts);
      setHasMoreResults(data.hasMore || (data.resultsCount > 5000));
    } catch (err: any) {
      console.error('Failed to load more results:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden select-none ${
      isDark ? 'bg-[#18110D] text-stone-100' : 'bg-[#FAF8F5] text-stone-900'
    }`}>
      {/* Search Header Bar / Tabs */}
      <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
        isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
      }`}>
        <div className="flex gap-2">
          <button
            className={tab === 'normal' ? activeTabClass : inactiveTabClass}
            onClick={() => setTab('normal')}
          >
            חיפוש במאגר
          </button>
          <button
            className={tab === 'smart' ? activeTabClass : inactiveTabClass}
            onClick={() => setTab('smart')}
          >
            חיפוש חכם בתוך המאגר
          </button>
        </div>

        {tab === 'normal' && results.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPreviewPane(!showPreviewPane)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              showPreviewPane
                ? 'bg-amber-800 text-white border-amber-800'
                : isDark
                ? 'bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700'
                : 'bg-stone-100 border-stone-300 text-stone-800 hover:bg-stone-200'
            }`}
            title={showPreviewPane ? 'חזור למצב חיפוש ברוחב מלא' : 'פתח פאנל תצוגה מקדימה'}
          >
            {showPreviewPane ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>חזור למסך מלא (הסתר תצוגה מקדימה)</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>הצג תצוגה מקדימה לצד הכלים</span>
              </>
            )}
          </button>
        )}
      </div>

      {tab === 'smart' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 md:p-5">
          <Suspense fallback={<div className="p-8 text-center text-amber-200/60 font-serif">טוען חיפוש חכם...</div>}>
            <SmartSearchView settings={settings} onOpenBookAtLine={onOpenBookAtLine} />
          </Suspense>
        </div>
      )}

      {tab === 'normal' && (
        <div className="flex-1 flex overflow-hidden p-4 md:p-6 gap-6">
          {/* Main Layout Split View:
              - FIRST DOM CHILD (RIGHT SIDE in RTL): Search Controls & Grouped Results Sidebar
              - SECOND DOM CHILD (LEFT SIDE in RTL): Preview Pane (Wide Center Section)
          */}

          {/* 1. RIGHT SIDE: Search Controls & Grouped Results Sidebar */}
          <div className={`flex flex-col gap-4 overflow-y-auto min-w-0 ${
            showPreviewPane && results.length > 0 && activeBook
              ? 'w-full lg:w-[420px] xl:w-[460px] shrink-0 border-l pl-0 lg:pl-6 border-stone-200 dark:border-stone-800'
              : 'max-w-4xl w-full mx-auto'
          }`}>
            {/* Search Header Card */}
            <div className={`p-5 rounded-3xl border shadow-xs flex flex-col gap-4 ${
              isDark ? 'bg-[#211711] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-amber-800 text-amber-100 rounded-2xl shadow-inner">
                    <Search className="w-5 h-5 text-amber-200" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold font-serif ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                      חיפוש במאגר הספרים
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    showAdvancedOptions
                      ? 'bg-amber-800 text-white border-amber-800'
                      : isDark
                      ? 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                      : 'bg-stone-100 border-stone-300 text-stone-800 hover:bg-stone-200'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>מתקדם</span>
                </button>
              </div>

              {/* Search Form Input & Scope */}
              <form onSubmit={handleSearch} className="flex flex-col gap-3">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="הקלד מילה, פסוק או ביטוי לחיפוש..."
                    className={`w-full rounded-2xl pr-10 pl-24 py-3 text-sm font-serif focus:outline-none focus:ring-2 focus:ring-amber-700/50 ${
                      isDark
                        ? 'bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500'
                        : 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400'
                    }`}
                  />
                  <Search className={`w-4 h-4 absolute right-3.5 pointer-events-none ${isDark ? 'text-stone-500' : 'text-stone-400'}`} />

                  <button
                    type="submit"
                    disabled={isSearching}
                    className="absolute left-1.5 bg-amber-800 hover:bg-amber-900 text-amber-50 px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSearching ? (
                      <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-100 border-t-transparent" />
                    ) : (
                      <>
                        <span>חפש</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {/* Scope & Checkboxes */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className={`border rounded-lg px-2.5 py-1 text-xs focus:outline-none ${
                        isDark ? 'bg-stone-900 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                      }`}
                    >
                      <option value="all">כל המאגר</option>
                      <option value='תנ"ך'>תנ"ך</option>
                      <option value='מפרשי תנ"ך'>מפרשי תנ"ך</option>
                      <option value="משנה">משנה</option>
                      <option value="מפרשי משנה">מפרשי משנה</option>
                      <option value="גמרא">גמרא (בבלי וירושלמי)</option>
                      <option value="הלכה">הלכה ושולחן ערוך</option>
                      <option value="ראשונים">שו"ת וראשונים</option>
                      <option value="מדרש">מדרשים</option>
                      <option value="מוסר">מחשבה ומוסר</option>
                      <option value="חסידות">חסידות</option>
                      <option value="קבלה">קבלה וסוד</option>
                      <option value="תפילה">תפילה ומנהגים</option>
                    </select>
                  </div>

                  <div className={`flex items-center gap-3 font-medium ${isDark ? 'text-stone-300' : 'text-stone-800'}`}>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exactMatch}
                        onChange={e => {
                          const isChecked = e.target.checked;
                          setExactMatch(isChecked);
                          setMode(isChecked ? 'exact' : 'advanced');
                        }}
                        className="accent-amber-800 rounded"
                      />
                      <span>מדויק</span>
                    </label>

                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gematriaSearch}
                        onChange={e => setGematriaSearch(e.target.checked)}
                        className="accent-amber-800 rounded"
                      />
                      <span className="flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-amber-600" />
                        גימטריא
                      </span>
                    </label>
                  </div>
                </div>

                {/* Full Complete Advanced Search Options Panel */}
                {showAdvancedOptions && (
                  <div className={`p-3.5 rounded-2xl border mt-1 flex flex-col gap-3 text-xs ${
                    isDark ? 'bg-stone-900/90 border-stone-700' : 'bg-amber-50/90 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-1 font-bold text-amber-900 dark:text-amber-300 border-b pb-1.5 dark:border-stone-800">
                      <Settings2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>הגדרות חיפוש מתקדם (Otzaria Search Engine):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Mode Selector */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">מצב חיפוש:</label>
                        <select
                          value={mode}
                          onChange={e => setMode(e.target.value as any)}
                          className={`border rounded-lg p-1.5 ${
                            isDark ? 'bg-stone-950 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                          }`}
                        >
                          <option value="advanced">מתקדם (קידומות/סיומות/מרווחים)</option>
                          <option value="exact">מדויק (ללא התאמות מקורבות)</option>
                          <option value="phrase">ביטוי ("רצף מילים מדויק")</option>
                          <option value="fuzzy">מקורב (שיבושי כתיב קלים/Fuzzy)</option>
                        </select>
                      </div>

                      {/* Slop / Word Distance */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">מרווח מילים (Slop): {slop}</label>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={slop}
                          onChange={e => setSlop(Number(e.target.value))}
                          className="accent-amber-800 cursor-pointer"
                        />
                      </div>

                      {/* Proximity Scope */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">טווח הקרבה:</label>
                        <select
                          value={proximityScope}
                          onChange={e => setProximityScope(e.target.value as any)}
                          className={`border rounded-lg p-1.5 ${
                            isDark ? 'bg-stone-950 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                          }`}
                        >
                          <option value="wordDistance">מרווח בין מילים</option>
                          <option value="sameParagraph">באותה פסקה</option>
                          <option value="sameSection">תחת אותה כותרת/סעיף</option>
                        </select>
                      </div>

                      {/* Result Grouping */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">איחוד תוצאות:</label>
                        <select
                          value={resultGrouping}
                          onChange={e => setResultGrouping(e.target.value as any)}
                          className={`border rounded-lg p-1.5 ${
                            isDark ? 'bg-stone-950 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                          }`}
                        >
                          <option value="none">ללא איחוד (רשימה שטוחה)</option>
                          <option value="sameSection">לפי טווח/סעיף</option>
                          <option value="identicalText">טקסט זהה בין ספרים</option>
                        </select>
                      </div>

                      {/* Results Limit Selector */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">כמות תוצאות להצגה:</label>
                        <select
                          value={resultsLimit}
                          onChange={e => {
                            const newLim = Number(e.target.value);
                            setResultsLimit(newLim);
                            if (query.trim() && results.length > 0) {
                              handleSearch(undefined, query.trim(), newLim);
                            }
                          }}
                          className={`border rounded-lg p-1.5 ${
                            isDark ? 'bg-stone-950 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                          }`}
                        >
                          <option value={50}>50 תוצאות</option>
                          <option value={100}>100 תוצאות</option>
                          <option value={250}>250 תוצאות</option>
                          <option value={500}>500 תוצאות</option>
                        </select>
                      </div>

                      {/* Engine Sort Order */}
                      <div className="flex flex-col gap-0.5">
                        <label className="font-bold text-stone-700 dark:text-stone-300">מיון מנוע החיפוש:</label>
                        <select
                          value={sortBy}
                          onChange={e => setSortBy(e.target.value as any)}
                          className={`border rounded-lg p-1.5 ${
                            isDark ? 'bg-stone-950 border-stone-700 text-stone-200' : 'bg-white border-stone-300 text-stone-800'
                          }`}
                        >
                          <option value="relevance">לפי רלוונטיות (Relevance Score)</option>
                          <option value="generation">לפי סדר הדורות (ספרי יסוד ומפרשים)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </form>

              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className={`pt-2 border-t flex flex-col gap-1 ${isDark ? 'border-stone-800' : 'border-stone-100'}`}>
                  <div className={`flex items-center justify-between text-xs font-semibold ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>חיפושים אחרונים:</span>
                    </div>
                    <button
                      onClick={() => clearSearchHistory()}
                      className="text-[11px] text-stone-400 hover:text-red-500 transition-colors cursor-pointer"
                      title="מחק הכל"
                    >
                      מחק הכל
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {recentSearches.slice(0, 6).map(s => (
                      <div
                        key={s.id}
                        onClick={() => handleSearch(undefined, s.query)}
                        className={`group relative px-2.5 py-0.5 border rounded-lg text-xs font-serif transition-colors flex items-center gap-1.5 cursor-pointer ${
                          isDark
                            ? 'bg-stone-800/80 hover:bg-stone-700 border-stone-700 text-stone-200'
                            : 'bg-stone-100 hover:bg-stone-200 border-stone-200 text-stone-800'
                        }`}
                      >
                        <span>{s.query}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSearchQuery(s.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500 text-stone-400 cursor-pointer"
                          title="הסר חיפוש"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Searching State */}
            {isSearching && (
              <div className={`p-4 rounded-2xl border shadow-xs flex items-center gap-3 animate-pulse ${
                isDark ? 'bg-stone-900 border-amber-900/60 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-amber-800 border-t-transparent" />
                <span className="text-sm font-bold font-serif">סורק את המאגר עבור: "{query}"...</span>
              </div>
            )}

            {/* Search Results Summary & Controls Header */}
            {resultsCount !== null && (
              <div className="flex flex-col gap-2">
                {/* 5,000+ Results Warning Banner */}
                {(resultsCount > 5000 || hasMoreResults) && (
                  <div className={`p-3 rounded-2xl border text-xs font-serif flex items-center gap-2.5 shadow-xs ${
                    isDark ? 'bg-amber-950/40 border-amber-800/80 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}>
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold">נמצאו מעל 5,000 מופעים ({resultsCount.toLocaleString()} תוצאות). </span>
                      <span className="opacity-90">מומלץ למקד את מילות החיפוש או לבחור ספר ספציפי מהרשימה לתוצאות מדויקות יותר.</span>
                    </div>
                  </div>
                )}

                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-4 py-2.5 rounded-2xl border font-serif text-xs ${
                  isDark ? 'bg-stone-900 border-stone-800 text-amber-300' : 'bg-amber-100/70 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center gap-1.5 font-bold">
                    {resultsCount > results.length ? (
                      <span>
                        נמצאו כ-<strong>{resultsCount.toLocaleString()}</strong> מופעים ב-<strong>{(totalBooks ?? groupedBookResults.length).toLocaleString()}</strong> ספרים במאגר
                        <span className="font-normal opacity-90 mr-1.5 text-[11px]">
                          (מוצגים כעת <strong>{groupedBookResults.length}</strong> ספרים)
                        </span>
                      </span>
                    ) : (
                      <span>
                        נמצאו <strong>{resultsCount.toLocaleString()}</strong> מופעים ב-<strong>{(totalBooks ?? groupedBookResults.length).toLocaleString()}</strong> ספרים
                      </span>
                    )}
                    {filterBookQuery && (
                      <span className="text-stone-500 font-normal mr-1">
                        (מסוננים {groupedBookResults.length} ספרים)
                      </span>
                    )}
                  </div>

                  {resultsCount > results.length && (
                    <span className="text-[11px] font-sans font-medium text-amber-700 dark:text-amber-400">
                      מוצגות {results.length} שורות מתוך {resultsCount.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Results Filtering & Sorting Toolbar */}
                {(results.length > 0 || groupedBookResults.length > 0) && (
                  <div className={`p-3 rounded-2xl border shadow-xs flex flex-col gap-2 ${
                    isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
                  }`}>
                    {/* Filter within results by book title */}
                    <div className="relative">
                      <input
                        type="text"
                        value={filterBookQuery}
                        onChange={e => setFilterBookQuery(e.target.value)}
                        placeholder="סינון מתוך רשימת הספרים והתוצאות..."
                        className={`w-full rounded-xl pr-8 pl-7 py-1.5 text-xs font-serif focus:outline-none focus:ring-1 focus:ring-amber-700/50 ${
                          isDark
                            ? 'bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500'
                            : 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400'
                        }`}
                      />
                      <Search className={`w-3 h-3 absolute right-2.5 top-2 pointer-events-none ${isDark ? 'text-stone-500' : 'text-stone-400'}`} />
                      {filterBookQuery && (
                        <button
                          type="button"
                          onClick={() => setFilterBookQuery('')}
                          className="absolute left-2 top-2 text-stone-400 hover:text-stone-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Sort Controls */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-semibold flex items-center gap-1 shrink-0 ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                        <ArrowUpDown className="w-3 h-3 text-amber-600" />
                        <span>מיון:</span>
                      </span>

                      <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 p-0.5 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setActiveSortOrder('relevance')}
                          className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                            activeSortOrder === 'relevance'
                              ? 'bg-amber-800 text-white font-bold shadow-xs'
                              : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800'
                          }`}
                          title="לפי כמות מופעים ורלוונטיות"
                        >
                          רלוונטיות
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSortOrder('generation')}
                          className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                            activeSortOrder === 'generation'
                              ? 'bg-amber-800 text-white font-bold shadow-xs'
                              : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800'
                          }`}
                          title="סדר הדורות: תנ״ך, משנה, ש״ס, ראשונים"
                        >
                          סדר דורות
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSortOrder('title')}
                          className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                            activeSortOrder === 'title'
                              ? 'bg-amber-800 text-white font-bold shadow-xs'
                              : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800'
                          }`}
                          title="לפי שם הספר א-ת"
                        >
                          שם ספר
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Grouped Book Results List */}
            <div className="flex flex-col gap-2.5">
              {groupedBookResults.map((gb, bookIdx) => {
                const isBookSelected = activeBook && activeBook.bookId === gb.bookId && activeBook.bookTitle === gb.bookTitle;
                const hitCount = gb.totalFacetHits ?? gb.hits.length;

                return (
                  <div
                    key={`${gb.bookId}_${gb.bookTitle}_${bookIdx}`}
                    onClick={() => handleSelectBook(bookIdx, gb)}
                    className={`group p-4 rounded-2xl border shadow-xs transition-all cursor-pointer flex flex-col gap-2.5 relative ${
                      isBookSelected
                        ? isDark
                          ? 'bg-amber-950/40 border-amber-600 text-stone-100 ring-2 ring-amber-600/50'
                          : 'bg-amber-50/90 border-amber-500 text-stone-900 ring-2 ring-amber-500/30'
                        : isDark
                        ? 'bg-[#211711] border-stone-800 hover:border-amber-700/60'
                        : 'bg-white border-stone-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className={`w-4 h-4 shrink-0 ${isBookSelected ? 'text-amber-500' : 'text-amber-600'}`} />
                        <h3 className={`text-sm font-bold font-serif truncate ${
                          isBookSelected
                            ? 'text-amber-800 dark:text-amber-300 font-black'
                            : isDark
                            ? 'text-stone-100 group-hover:text-amber-300'
                            : 'text-stone-900 group-hover:text-amber-900'
                        }`}>
                          {gb.bookTitle}
                        </h3>

                        {/* Circular badge with hit count in this book */}
                        {hitCount > 0 && (
                          <span
                            className="px-2 py-0.5 rounded-full bg-amber-800 dark:bg-amber-700 text-amber-50 font-sans text-[11px] font-extrabold flex items-center justify-center shadow-xs shrink-0"
                            title={`${hitCount} מופעים בספר זה`}
                          >
                            {hitCount.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Button to open directly in full reader tab */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const hitToOpen = (isBookSelected && activeHit) ? activeHit : (gb.hits[0] || { lineIndex: 1 });
                          sysLogger.addLog('info', 'Search', `פתיחת ספר בלשונית קריאה: "${gb.bookTitle}" (שורה ${hitToOpen.lineIndex})`);
                          onOpenBookAtLine(gb.bookId, gb.bookTitle, hitToOpen.lineIndex, query);
                        }}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                          isDark
                            ? 'bg-stone-800/80 hover:bg-amber-900/60 border-stone-700 text-amber-300'
                            : 'bg-stone-100 hover:bg-amber-100 border-stone-300 text-amber-900'
                        }`}
                        title="פתח בלשונית חדשה בקורא"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Sub-hits pill buttons if multiple hits already fetched */}
                    {gb.hits.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-stone-200/50 dark:border-stone-800/50">
                        {gb.hits.map((hit, hitIdx) => {
                          const isHitSelected = isBookSelected && selectedHitIndex === hitIdx;
                          return (
                            <button
                              key={hitIdx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBookIndex(bookIdx);
                                setSelectedHitIndex(hitIdx);
                                if (!showPreviewPane) setShowPreviewPane(true);
                              }}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-sans font-semibold transition-colors cursor-pointer border ${
                                isHitSelected
                                  ? 'bg-amber-800 text-white border-amber-800 shadow-2xs font-bold'
                                  : isDark
                                  ? 'bg-stone-900/90 border-stone-700 text-stone-300 hover:bg-stone-800'
                                  : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200'
                              }`}
                            >
                              שורה #{hit.lineIndex}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Snippet preview of active hit or first hit */}
                    {gb.hits.length > 0 ? (
                      <p
                        className={`text-xs font-serif leading-relaxed p-2.5 rounded-xl border ${
                          isBookSelected
                            ? isDark
                              ? 'bg-stone-900/90 border-amber-700/50 text-stone-100'
                              : 'bg-white border-amber-300 text-stone-900'
                            : isDark
                            ? 'bg-stone-900/80 border-stone-800 text-stone-200'
                            : 'bg-stone-50 border-stone-200/80 text-stone-800'
                        }`}
                        dangerouslySetInnerHTML={{
                          __html: `"${sanitizeSnippetHtml((isBookSelected && activeHit) ? activeHit.snippet : gb.hits[0].snippet)}"`
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-serif">
                        {isLoadingBookHits && isBookSelected ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>טוען שורות עבור {gb.bookTitle}...</span>
                          </>
                        ) : (
                          <span className="opacity-80">לחץ לטעינת כל התוצאות של ספר זה ({hitCount} מופעים)</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {results.length > 0 && groupedBookResults.length === 0 && (
                <div className={`p-6 text-center rounded-2xl border text-xs ${
                  isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-white border-stone-200 text-stone-500'
                }`}>
                  לא נמצאו תוצאות התואמות את סינון שם הספר "{filterBookQuery}".
                </div>
              )}

              {/* Load More Results Button */}
              {resultsCount !== null && resultsCount > results.length && (
                <div className="pt-2 pb-4 flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore || isSearching}
                    className={`w-full py-2.5 px-4 rounded-2xl border text-xs font-serif font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                      isDark
                        ? 'bg-[#2A180E] hover:bg-[#3D2314] text-amber-200 border-amber-800/80'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
                    } disabled:opacity-50`}
                  >
                    {isLoadingMore ? (
                      <>
                        <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-700 border-t-transparent" />
                        <span>טוען תוצאות נוספות...</span>
                      </>
                    ) : (
                      <>
                        <span>טען עוד תוצאות (מוצגות {results.length} מתוך {resultsCount.toLocaleString()})</span>
                        <ChevronLeft className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <span className={`text-[10.5px] font-sans ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    ניתן גם לשנות את כמות התוצאות מראש בתפריט "מתקדם"
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. LEFT SIDE: Preview Pane (Wide center section when showPreviewPane is true and activeBook exists) */}
          {showPreviewPane && results.length > 0 && activeBook && activeHit && (
            <div className={`flex-1 flex flex-col rounded-3xl border shadow-sm overflow-hidden min-w-0 ${
              isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
            }`}>
              {/* Preview Header Bar */}
              <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
                isDark ? 'bg-stone-900 border-stone-800' : 'bg-amber-50/80 border-stone-200'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-amber-800 text-amber-100 rounded-xl shrink-0">
                    <BookOpen className="w-5 h-5 text-amber-200" />
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={`text-lg font-bold font-serif truncate ${
                        isDark ? 'text-amber-200' : 'text-amber-950'
                      }`}>
                        {activeBook.bookTitle}
                      </h2>

                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-sans font-medium shrink-0 ${
                        isDark ? 'bg-stone-800 text-amber-300' : 'bg-amber-100 text-amber-900'
                      }`}>
                        שורה #{activeHit.lineIndex}
                      </span>

                      {activeBook.hits.length > 1 && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-sans font-extrabold bg-amber-800 text-white shrink-0">
                          מופע {selectedHitIndex + 1} מתוך {activeBook.hits.length} בספר זה
                        </span>
                      )}
                    </div>
                    <span className={`text-xs truncate ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                      {activeBook.categoryPath}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Open in full reader tab */}
                  <button
                    type="button"
                    onClick={() => {
                      sysLogger.addLog('info', 'Search', `פתיחת ספר בלשונית חדשה מתוך תצוגה מקדימה: "${activeBook.bookTitle}"`);
                      onOpenBookAtLine(activeBook.bookId, activeBook.bookTitle, activeHit.lineIndex, query);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <span>פתח בלשונית חדשה</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle back to full width search */}
                  <button
                    type="button"
                    onClick={() => setShowPreviewPane(false)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      isDark
                        ? 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                        : 'bg-stone-100 border-stone-300 text-stone-800 hover:bg-stone-200'
                    }`}
                    title="חזור למצב חיפוש במסך מלא"
                  >
                    <span>מסך מלא</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview Body Text Content */}
              <div ref={previewScrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-2 font-serif text-base leading-relaxed">
                {isLoadingPreview ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-amber-700">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm font-sans font-bold">טוען תצוגה מקדימה מתוך הספר...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-w-3xl mx-auto w-full">
                    {previewLines.map((line) => {
                      const isActive = line.lineIndex === activeHit.lineIndex;
                      return (
                        <div
                          key={line.lineIndex}
                          ref={isActive ? activeLineRef : null}
                          className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                            isActive
                              ? isDark
                                ? 'bg-amber-950/60 border-amber-700/80 text-amber-100 shadow-md ring-2 ring-amber-600/40'
                                : 'bg-amber-100/90 border-amber-400 text-amber-950 shadow-md ring-2 ring-amber-500/30'
                              : isDark
                              ? 'bg-stone-900/50 border-stone-800/60 text-stone-200'
                              : 'bg-stone-50/60 border-stone-200/60 text-stone-800'
                          }`}
                        >
                          <span className={`text-xs font-sans shrink-0 mt-1 select-none font-semibold ${
                            isActive
                              ? 'text-amber-700 dark:text-amber-300 font-extrabold'
                              : isDark
                              ? 'text-stone-500'
                              : 'text-stone-400'
                          }`}>
                            #{line.lineIndex}
                          </span>
                          <p
                            className="flex-1 text-base leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeBookHtml(highlightSearchText(line.text, highlightRegex))
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preview Footer Navigation Controls */}
              <div className={`px-6 py-3 border-t flex items-center justify-between text-xs font-sans font-bold shrink-0 ${
                isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-600'
              }`}>
                <span>
                  ספר {selectedBookIndex + 1} מתוך {groupedBookResults.length} • מופע {selectedHitIndex + 1} מתוך {activeBook.hits.length} בספר זה
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedHitIndex <= 0}
                    onClick={() => setSelectedHitIndex(prev => Math.max(0, prev - 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-stone-100 dark:bg-stone-800 dark:border-stone-700 disabled:opacity-40 cursor-pointer hover:bg-stone-200 dark:hover:bg-stone-700"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>המופע הקודם בספר</span>
                  </button>
                  <button
                    type="button"
                    disabled={selectedHitIndex >= activeBook.hits.length - 1}
                    onClick={() => setSelectedHitIndex(prev => Math.min(activeBook.hits.length - 1, prev + 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-stone-100 dark:bg-stone-800 dark:border-stone-700 disabled:opacity-40 cursor-pointer hover:bg-stone-200 dark:hover:bg-stone-700"
                  >
                    <span>המופע הבא בספר</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
