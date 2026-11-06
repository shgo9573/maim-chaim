import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { StreamEvent, NumberedResult } from '../services/smartSearch';
import { getBookContent, getSearchToken } from '../services/api';
import { ReaderSettings } from '../types/otzaria';
import { buildHebrewSearchRegex, highlightSearchText } from '../utils/searchHelpers';
import { sanitizeSnippetHtml, sanitizeBookHtml } from '../utils/sanitizeHtml';
import {
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minimize2,
  Loader2
} from 'lucide-react';

interface SmartSearchViewProps {
  settings?: ReaderSettings;
  onOpenBookAtLine?: (bookId: number | string, bookTitle: string, lineIndex: number, initialSearch?: string) => void;
}

export interface GroupedSmartBookResult {
  bookId: number | string;
  bookTitle: string;
  hits: NumberedResult[];
}

export const SmartSearchView: React.FC<SmartSearchViewProps> = ({ settings, onOpenBookAtLine }) => {
  const [question, setQuestion] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [finalResults, setFinalResults] = useState<NumberedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ניהול תצוגה מקדימה (Preview Pane)
  const [showPreviewPane, setShowPreviewPane] = useState<boolean>(true);
  const [selectedBookIndex, setSelectedBookIndex] = useState<number>(0);
  const [selectedHitIndex, setSelectedHitIndex] = useState<number>(0);
  const [previewLines, setPreviewLines] = useState<Array<{ lineIndex: number; text: string }>>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  const previewScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const isDark = settings?.theme === 'dark';

  // קיבוץ התוצאות הנבחרות לפי ספרים בדיוק כמו בחיפוש הרגיל
  const groupedBookResults = useMemo<GroupedSmartBookResult[]>(() => {
    const map = new Map<string, GroupedSmartBookResult>();

    for (const r of finalResults) {
      const key = `${r.book_id}_${r.title}`;
      if (!map.has(key)) {
        map.set(key, {
          bookId: r.book_id,
          bookTitle: r.title,
          hits: []
        });
      }
      map.get(key)!.hits.push(r);
    }

    return Array.from(map.values());
  }, [finalResults]);

  const activeBook = groupedBookResults[selectedBookIndex] || null;
  const activeHit = activeBook ? activeBook.hits[selectedHitIndex] || activeBook.hits[0] : null;

  const highlightRegex = useMemo(() => {
    if (!activeHit) return buildHebrewSearchRegex(question);
    
    const terms = new Set<string>();
    
    // 1. חילוץ אך ורק המילים והביטויים שהשרת סימן בהדגשה בתוצאה הספציפית הזו (snippet)
    if (activeHit.snippet) {
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
            terms.add(cleanTerm);
            cleanTerm.split(/\s+/).forEach(w => {
              const cleanW = w.replace(/^[^\u0590-\u05FF0-9]+|[^\u0590-\u05FF0-9]+$/g, '');
              if (cleanW.length > 1) terms.add(cleanW);
            });
          }
        }
      }
    }
    
    // 2. רק במקרה חריג שבו ה-snippet לא הכיל תגיות הדגשה, נשתמש בשאילתה כגיבוי
    if (terms.size === 0) {
      if (activeHit.search_query) {
        const cleanSQ = activeHit.search_query.replace(/["״]/g, '').trim();
        if (cleanSQ) terms.add(cleanSQ);
        cleanSQ.split(/\s+/).forEach(w => {
          const cleanW = w.replace(/^[^\u0590-\u05FF0-9]+|[^\u0590-\u05FF0-9]+$/g, '');
          if (cleanW.length > 1) terms.add(cleanW);
        });
      } else if (question) {
        const cleanQ = question.replace(/["״]/g, '').trim();
        if (cleanQ) terms.add(cleanQ);
        cleanQ.split(/\s+/).forEach(w => {
          const cleanW = w.replace(/^[^\u0590-\u05FF0-9]+|[^\u0590-\u05FF0-9]+$/g, '');
          if (cleanW.length > 1) terms.add(cleanW);
        });
      }
    }
    
    const termArray = Array.from(terms).filter(Boolean);
    if (termArray.length === 0) return buildHebrewSearchRegex(question);
    
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
    
    if (patterns.length === 0) return buildHebrewSearchRegex(question);
    
    // מיון לפי אורך יורד כדי שביטויים שלמים יתפסו לפני מילים בודדות
    patterns.sort((a, b) => b.length - a.length);
    return new RegExp(`(${patterns.join('|')})`, 'gi');
  }, [activeHit, question]);

  // טעינת שורות ההקשר לתצוגה מקדימה מתוך הספר
  useEffect(() => {
    if (!activeHit) {
      setPreviewLines([]);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);

    const startLine = Math.max(1, activeHit.line_index - 15);
    const endLine = activeHit.line_index + 20;

    getBookContent(activeHit.book_id, startLine, endLine)
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
          setPreviewLines([{ lineIndex: activeHit.line_index, text: activeHit.snippet }]);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch preview content:', err);
        if (isMounted) {
          setPreviewLines([{ lineIndex: activeHit.line_index, text: activeHit.snippet }]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeHit]);

  // גלילה לשורה הפעילה בתצוגה המקדימה
  useEffect(() => {
    if (activeLineRef.current && previewScrollRef.current) {
      setTimeout(() => {
        activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [previewLines, selectedHitIndex, selectedBookIndex]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!question.trim() || loading) return;

    setStatusMessage('מנתח את השאלה וממיר אותה לשפת ספרי המקורות...');
    setFinalResults([]);
    setError('');
    setSelectedBookIndex(0);
    setSelectedHitIndex(0);
    setLoading(true);

    try {
      const res = await fetch('/api/smart-search/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Otzaria-UID': getSearchToken()
        },
        body: JSON.stringify({ question }),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error('Access Denied');
      }

      if (!res.body) {
        throw new Error('לא התקבל זרם נתונים מהשרת');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          try {
            const event: StreamEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'phase':
                setStatusMessage(event.message);
                break;

              case 'search_plan':
                setStatusMessage(`מבצע חיפוש במאגר הספרים (${event.searches.length} שאילתות)...`);
                break;

              case 'search_result':
                setStatusMessage(`מחפש בספרים: "${event.query}"... (${event.hits} מופעים)`);
                break;

              case 'curated_list':
                setStatusMessage(`מסנן ומעריך ${event.results.length} מקורות שנמצאו...`);
                break;

              case 'chosen':
                setStatusMessage('מעבד את המקורות הנבחרים...');
                break;

              case 'final_results':
                setFinalResults(event.results);
                setSelectedBookIndex(0);
                setSelectedHitIndex(0);
                break;

              case 'done':
                setStatusMessage('');
                break;

              case 'error':
                setError(event.message);
                break;
            }
          } catch (err) {
            console.error('Failed to parse event', line, err);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בהפעלת החיפוש החכם');
    } finally {
      setLoading(false);
    }
  };

  const hasResults = finalResults.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full h-full gap-4" dir="rtl">
      {/* ═══ סרגל עליון: כותרת וכפתור תצוגה מקדימה ═══ */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className={`text-xl font-bold font-serif ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
            חיפוש חכם בתוך המאגר
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 font-sans mt-0.5">
            הקלד שאלה חופשית — המערכת תתרגם אותה לשפת ספרי המקורות ותסנן עבורך את התוצאות המדויקות
          </p>
        </div>

        {hasResults && (
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
                <span>חזור למסך מלא</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>הצג תצוגה מקדימה</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ═══ אזור התוכן הראשי (Split View / חיפוש) ═══ */}
      <div className="flex-1 flex overflow-hidden gap-6">
        {/* צד ימין: תיבת חיפוש ורשימת ספרים ותוצאות */}
        <div className={`flex flex-col gap-4 overflow-y-auto min-w-0 ${
          showPreviewPane && hasResults && activeBook
            ? 'w-full lg:w-[430px] xl:w-[480px] shrink-0 border-l pl-0 lg:pl-6 border-stone-200 dark:border-stone-800'
            : 'max-w-4xl w-full mx-auto'
        }`}>
          {/* כרטיס שדה החיפוש */}
          <div className={`p-4 md:p-5 rounded-3xl border shadow-xs flex flex-col gap-3 shrink-0 ${
            isDark ? 'bg-[#211711] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'
          }`}>
            <form onSubmit={handleSearch} className="relative flex items-center">
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="הקלד שאלה חופשית... למשל: מה הסיבה שלא תוקעים בשופר בשבת?"
                className={`w-full rounded-2xl pr-10 pl-28 py-3 text-sm font-serif focus:outline-none focus:ring-2 focus:ring-amber-700/50 ${
                  isDark
                    ? 'bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500'
                    : 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400'
                }`}
              />
              <Search className={`w-4 h-4 absolute right-3.5 pointer-events-none ${isDark ? 'text-stone-500' : 'text-stone-400'}`} />

              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="absolute left-1.5 bg-amber-800 hover:bg-amber-900 text-amber-50 px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-100 border-t-transparent" />
                ) : (
                  <>
                    <span>חיפוש חכם</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* הודעת סטטוס מהבהבת לאט בזמן חיפוש */}
          {loading && (
            <div className={`p-8 rounded-3xl border shadow-xs flex flex-col items-center justify-center gap-3 text-center transition-all ${
              isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
            }`}>
              <div className="text-base md:text-lg font-serif font-bold text-amber-900 dark:text-amber-200 animate-pulse duration-1000 px-4 leading-relaxed">
                {statusMessage || 'מחפש במאגר הספרים ומסנן את המקורות המתאימים...'}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 font-sans animate-pulse">
                סריקה וסינון תוצאות בספריית אוצריא...
              </div>
            </div>
          )}

          {/* שגיאה */}
          {error && !loading && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 rounded-2xl text-xs font-serif">
              ⚠️ {error}
            </div>
          )}

          {/* רשימת תוצאות מקובצות לפי ספרים */}
          {!loading && groupedBookResults.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-sans text-stone-500 dark:text-stone-400 px-1">
                נבחרו {finalResults.length} מקורות ממוקדים ב-{groupedBookResults.length} ספרים:
              </div>

              {groupedBookResults.map((gb, bookIdx) => {
                const isBookSelected = activeBook && activeBook.bookId === gb.bookId && activeBook.bookTitle === gb.bookTitle;
                const hitCount = gb.hits.length;

                return (
                  <div
                    key={`${gb.bookId}_${gb.bookTitle}_${bookIdx}`}
                    onClick={() => {
                      setSelectedBookIndex(bookIdx);
                      setSelectedHitIndex(0);
                      if (!showPreviewPane) setShowPreviewPane(true);
                    }}
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
                    {/* כותרת ספר וכפתור פתיחה בקורא */}
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

                        {hitCount > 1 && (
                          <span
                            className="w-5 h-5 rounded-full bg-amber-800 dark:bg-amber-700 text-amber-50 font-sans text-[11px] font-extrabold flex items-center justify-center shadow-xs shrink-0"
                            title={`${hitCount} מופעים בספר זה`}
                          >
                            {hitCount}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const hitToOpen = (isBookSelected && activeHit) ? activeHit : gb.hits[0];
                          if (onOpenBookAtLine) {
                            onOpenBookAtLine(gb.bookId, gb.bookTitle, hitToOpen.line_index, hitToOpen.search_query);
                          } else {
                            window.location.href = `/book/${gb.bookId}?line=${hitToOpen.line_index}`;
                          }
                        }}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                          isDark
                            ? 'bg-stone-800/80 hover:bg-amber-900/60 border-stone-700 text-amber-300'
                            : 'bg-stone-100 hover:bg-amber-100 border-stone-300 text-amber-900'
                        }`}
                        title="פתח בלשונית קריאה מלאה"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* תגי שורות אם יש יותר ממופע אחד */}
                    {hitCount > 1 && (
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
                              שורה #{hit.line_index}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* ציטוט השורה הפעילה */}
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
                  </div>
                );
              })}
            </div>
          )}

          {/* ללא תוצאות */}
          {!loading && finalResults.length === 0 && !error && question.trim() && (
            <div className={`p-8 text-center rounded-2xl border text-xs font-serif ${
              isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-white border-stone-200 text-stone-500'
            }`}>
              לא נמצאו תוצאות מתאימות עבור שאלתך. נסה לנסח במילים אחרות.
            </div>
          )}
        </div>

        {/* צד שמאל: פאנל תצוגה מקדימה מלא (Preview Pane) */}
        {showPreviewPane && hasResults && activeBook && activeHit && (
          <div className={`flex-1 flex flex-col rounded-3xl border shadow-sm overflow-hidden min-w-0 ${
            isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
          }`}>
            {/* כותרת התצוגה המקדימה */}
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
                      שורה #{activeHit.line_index}
                    </span>

                    {activeBook.hits.length > 1 && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-sans font-extrabold bg-amber-800 text-white shrink-0">
                        מופע {selectedHitIndex + 1} מתוך {activeBook.hits.length} בספר זה
                      </span>
                    )}
                  </div>
                  <span className={`text-xs truncate ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                    {activeHit.reference || 'מקור נבחר במאגר'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenBookAtLine) {
                      onOpenBookAtLine(activeBook.bookId, activeBook.bookTitle, activeHit.line_index, activeHit.search_query);
                    } else {
                      window.location.href = `/book/${activeBook.bookId}?line=${activeHit.line_index}`;
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition-colors cursor-pointer"
                >
                  <span>פתח בלשונית חדשה</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

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

            {/* גוף התצוגה המקדימה - שורות ההקשר מתוך הספר */}
            <div ref={previewScrollRef} className="flex-1 overflow-y-auto p-6 flex flex-col gap-2 font-serif text-base leading-relaxed">
              {isLoadingPreview ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-amber-700">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm font-sans font-bold">טוען תצוגה מקדימה מתוך הספר...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-w-3xl mx-auto w-full">
                  {previewLines.map((line) => {
                    const isActive = line.lineIndex === activeHit.line_index;
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

            {/* ניווט בפוטר התצוגה המקדימה */}
            <div className={`px-6 py-3 border-t flex items-center justify-between text-xs font-sans font-bold shrink-0 ${
              isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-600'
            }`}>
              <span>
                ספר {selectedBookIndex + 1} מתוך {groupedBookResults.length} • מופע {selectedHitIndex + 1} מתוך {activeBook.hits.length} בספר זה
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedBookIndex === 0 && selectedHitIndex === 0}
                  onClick={() => {
                    if (selectedHitIndex > 0) {
                      setSelectedHitIndex(selectedHitIndex - 1);
                    } else if (selectedBookIndex > 0) {
                      const prevBook = groupedBookResults[selectedBookIndex - 1];
                      setSelectedBookIndex(selectedBookIndex - 1);
                      setSelectedHitIndex(prevBook.hits.length - 1);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>הקודם</span>
                </button>

                <button
                  type="button"
                  disabled={selectedBookIndex === groupedBookResults.length - 1 && selectedHitIndex === activeBook.hits.length - 1}
                  onClick={() => {
                    if (selectedHitIndex < activeBook.hits.length - 1) {
                      setSelectedHitIndex(selectedHitIndex + 1);
                    } else if (selectedBookIndex < groupedBookResults.length - 1) {
                      setSelectedBookIndex(selectedBookIndex + 1);
                      setSelectedHitIndex(0);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  <span>הבא</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartSearchView;
