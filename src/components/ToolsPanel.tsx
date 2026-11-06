import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BookmarkItem, ReaderSettings, BookItem } from '../types/otzaria';
import { calculateGematria, numberToHebrew, stripNikud } from '../utils/gematria';
import { getDailyStudySchedule, getHebrewDateString, findMatchingBookForDailyStudy } from '../utils/hebrewCalendar';
// Lazy-loaded CustomStudyModal to reduce initial code bundle
const CustomStudyModal = lazy(() => import('./CustomStudyModal').then(m => ({ default: m.CustomStudyModal })));
import {
  subscribeToReadingHistory,
  clearReadingHistoryFromCloud,
  ReadingHistoryItem,
  PersonalNoteItem
} from '../services/userService';
import {
  Calendar,
  Calculator,
  Bookmark,
  BookOpen,
  Clock,
  Sparkles,
  History,
  ChevronLeft,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  FileText,
  Save,
  Plus
} from 'lucide-react';

interface ToolsPanelProps {
  bookmarks: BookmarkItem[];
  settings?: ReaderSettings;
  onRemoveBookmark: (id: string) => void;
  onOpenBookAtLine: (bookId: number | string, bookTitle: string, lineIndex: number) => void;
  onOpenBookTitle: (bookTitle: string) => void;
  onOpenBook?: (bookId: number | string, bookTitle: string, lineIndex?: number, initialSearch?: string) => void;
  catalogBooks?: BookItem[];
  onUpdateSettings?: (newSettings: Partial<ReaderSettings>) => void;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  bookmarks,
  settings,
  onRemoveBookmark,
  onOpenBookAtLine,
  onOpenBookTitle,
  onOpenBook,
  catalogBooks = [],
  onUpdateSettings
}) => {
  const [activeTool, setActiveTool] = useState<'daily' | 'history' | 'gematria' | 'calendar' | 'bookmarks' | 'notes'>('daily');
  const [isCustomStudyModalOpen, setIsCustomStudyModalOpen] = useState(false);

  // Reading history from Firebase / LocalStorage
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>([]);

  useEffect(() => {
    const unsub = subscribeToReadingHistory((hist) => {
      setReadingHistory(hist);
    });
    return () => unsub();
  }, []);

  // Gematria State
  const [gematriaInput, setGematriaInput] = useState('');
  const gematriaValue = calculateGematria(gematriaInput);

  // Common Gematria references
  const gematriaMatches = [
    { value: 613, label: 'תרי"ג מצוות' },
    { value: 248, label: 'רמ"ח איברים' },
    { value: 365, label: 'שס"ה גידים' },
    { value: 26, label: 'שם הוי"ה (י-ה-ו-ה)' },
    { value: 86, label: 'אלהים' },
    { value: 18, label: 'חי' }
  ];

  // Notes state
  const [noteContent, setNoteContent] = useState<string>(() => {
    try {
      return localStorage.getItem('otzaria_personal_notes_text') || '';
    } catch {
      return '';
    }
  });
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  const handleSaveNote = () => {
    try {
      localStorage.setItem('otzaria_personal_notes_text', noteContent);
      setNoteSavedFeedback(true);
      setTimeout(() => setNoteSavedFeedback(false), 2000);
    } catch {}
  };

  const isDark = settings?.theme === 'dark';

  // Daily study items calculated based on user tracks & schedule types
  const dailyItems = getDailyStudySchedule(settings?.dailyStudyTracks, {
    halachaYomitScheduleType: settings?.halachaYomitScheduleType,
    chofetzChaimScheduleType: settings?.chofetzChaimScheduleType,
    customDailyStudies: settings?.customDailyStudies
  });
  const hebrewDate = getHebrewDateString();

  return (
    <div className={`flex-1 flex flex-col h-full ${isDark ? 'bg-[#18110D] text-stone-100' : 'bg-[#FAF8F5] text-stone-900'} select-none overflow-hidden`}>
      {/* Top Banner */}
      <div className={`${isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'} border-b px-6 py-3 flex items-center justify-between shadow-xs`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-800 text-amber-100 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h2 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>מרכז הכלים והעזרים</h2>
            <p className="text-xs text-stone-400">לוח עברי, לימוד יומי מחושב, היסטוריית קריאה, גימטריה וסימניות</p>
          </div>
        </div>

        {/* Hebrew Date Pill */}
        <div className={`flex items-center gap-2 px-3 py-1 ${isDark ? 'bg-amber-950/80 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'} border rounded-full text-xs font-serif font-bold`}>
          <Calendar className="w-3.5 h-3.5 text-amber-500" />
          <span>היום: {hebrewDate}</span>
        </div>
      </div>

      {/* Main Layout: Sub-sidebar + Content View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sub-tools Sidebar */}
        <div className={`w-full md:w-64 border-l ${isDark ? 'border-stone-800 bg-[#1C140F]' : 'border-stone-200 bg-white'} p-3 flex flex-col gap-1 shrink-0`}>
          <button
            onClick={() => setActiveTool('daily')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTool === 'daily'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : isDark
                ? 'hover:bg-stone-800 text-stone-300'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>סדרי לימוד יומיים</span>
          </button>

          <button
            onClick={() => setActiveTool('history')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center justify-between text-xs font-medium transition-colors ${
              activeTool === 'history'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <History className="w-4 h-4" />
              <span>היסטוריית קריאה</span>
            </div>
            {readingHistory.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTool === 'history' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {readingHistory.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTool('bookmarks')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center justify-between text-xs font-medium transition-colors ${
              activeTool === 'bookmarks'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bookmark className="w-4 h-4" />
              <span>סימניות שמורות</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTool === 'bookmarks' ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {bookmarks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTool('gematria')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium transition-colors ${
              activeTool === 'gematria'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>מחשבון גימטריה</span>
          </button>

          <button
            onClick={() => setActiveTool('calendar')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium transition-colors ${
              activeTool === 'calendar'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>תאריכון ולוח שנה</span>
          </button>

          <button
            onClick={() => setActiveTool('notes')}
            className={`w-full text-right px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium transition-colors ${
              activeTool === 'notes'
                ? 'bg-amber-800 text-white font-bold shadow-xs'
                : 'hover:bg-stone-100 text-stone-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>הערות וחידושים אישיים</span>
          </button>
        </div>

        {/* Content View */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Daily Study Schedule */}
          {activeTool === 'daily' && (
            <div className="max-w-4xl space-y-4">
              <div className={`${isDark ? 'bg-[#1C140F] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'} border rounded-2xl p-5 shadow-xs`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold font-serif flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-700" />
                      <span>סדרי לימוד יומיים - קביעות עיתים לתורה</span>
                    </h3>
                    <p className="text-xs text-stone-400 mt-0.5">
                      קביעות לימוד יומית המאפשרת התמדה ומעקב קבוע בכל יום
                    </p>
                  </div>

                  <button
                    onClick={() => setIsCustomStudyModalOpen(true)}
                    className="px-3.5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>הוסף לימוד יומי מותאם אישית</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dailyItems.map((item) => (
                    <div
                      key={item.id}
                      className={`border rounded-2xl p-4 transition-all flex flex-col justify-between gap-3 group ${
                        isDark
                          ? 'border-stone-800 bg-stone-900/60 hover:bg-stone-900 hover:border-amber-700/60'
                          : 'border-stone-200 bg-stone-50/70 hover:bg-amber-50/50 hover:border-amber-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.isCustom
                              ? isDark ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-purple-100 text-purple-900'
                              : isDark ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-900'
                          }`}>
                            {item.badge || item.title}
                          </span>
                          <span className={`text-xs font-bold font-serif ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                            {item.title}
                          </span>
                        </div>

                        <div className={`text-sm font-bold font-serif my-1 ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                          {item.portion}
                        </div>

                        <p className={`text-xs leading-relaxed line-clamp-2 mt-1 ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                          {item.description}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const matched = findMatchingBookForDailyStudy(item, catalogBooks);
                          let navTarget = item.navTarget || item.portion;

                          if (item.type === 'daf_yomi') {
                            const dafMatch = item.portion.match(/דף\s+[א-ת]+(?:\s*[.:])?/);
                            if (dafMatch) navTarget = dafMatch[0].trim();
                          } else if (item.type === 'chofetz_chaim') {
                            const klalMatch = item.portion.match(/כלל\s+([א-ת"״'׳]+)/);
                            const seifMatch = item.portion.match(/סעי[פף](?:ים|ו)?\s+([א-ת"״'׳]+)/);
                            const shaarMatch = item.portion.match(/שער\s+[א-ת]+(?:\s+פרק\s+[א-ת]+(?:׳|')?)?/);
                            const lavinMatch = item.portion.match(/לאווין\s+([א-ת"״'׳]+)/);
                            const asayMatch = item.portion.match(/עשין\s+([א-ת"״'׳]+)/);

                            if (klalMatch && seifMatch) {
                              const cleanKlal = klalMatch[0].replace(/['׳"״]/g, '').trim();
                              const firstSeif = seifMatch[1].replace(/['׳"״]/g, '').trim();
                              navTarget = `${cleanKlal} סעיף ${firstSeif}`;
                            } else if (klalMatch) {
                              navTarget = klalMatch[0].replace(/['׳"״]/g, '').trim();
                            } else if (shaarMatch) {
                              navTarget = shaarMatch[0].replace(/['׳"״]/g, '').trim();
                            } else if (lavinMatch) {
                              navTarget = `לאו ${lavinMatch[1].replace(/['׳"״]/g, '').trim()}`;
                            } else if (asayMatch) {
                              navTarget = `עשה ${asayMatch[1].replace(/['׳"״]/g, '').trim()}`;
                            }
                          } else if (item.type === 'parasha') {
                            const parashaMatch = item.portion.match(/פרשת\s+([א-ת]+(?:\s+[א-ת]+)?)/);
                            if (parashaMatch) navTarget = parashaMatch[0].trim();
                          } else if (item.type === 'halacha_yomit') {
                            const simanMatch = item.portion.match(/סימן\s+([א-ת"״'׳0-9]+)/);
                            if (simanMatch) navTarget = `סימן ${simanMatch[1].replace(/['׳"״]/g, '').trim()}`;
                          }

                          if (onOpenBook) {
                            if (matched) {
                              onOpenBook(matched.id, matched.title, undefined, navTarget);
                            } else {
                              onOpenBook(item.bookId || item.bookTitle, item.bookTitle, undefined, navTarget);
                            }
                          } else if (matched) {
                            onOpenBookAtLine(matched.id, matched.title, item.lineIndex || 1);
                          } else {
                            onOpenBookTitle(item.bookTitle);
                          }
                        }}
                        className={`w-full py-2 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs ${
                          isDark
                            ? 'bg-stone-800 hover:bg-amber-800 text-stone-200 hover:text-white border-stone-700 hover:border-amber-800'
                            : 'bg-white hover:bg-amber-800 text-stone-800 hover:text-white border-stone-200 hover:border-amber-800'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>פתח ספר זה ללימוד</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Reading History */}
          {activeTool === 'history' && (
            <div className="max-w-3xl space-y-4">
              <div className={`${isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-white border-stone-200'} border rounded-xl p-5 shadow-xs`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'} flex items-center gap-2`}>
                    <History className="w-4 h-4 text-amber-500" />
                    <span>ספרים אחרונים שקראת ({readingHistory.length})</span>
                  </h3>
                  {readingHistory.length > 0 && (
                    <button
                      onClick={() => clearReadingHistoryFromCloud()}
                      className="text-xs text-stone-400 hover:text-red-500 flex items-center gap-1 cursor-pointer transition-colors"
                      title="נקה היסטוריית קריאה"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>נקה היסטוריה</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-stone-400 mb-4">
                  נשמר על הדיסק בשרת ומסונכרן לפי מזהה ה-Cookie הייחודי שלך
                </p>

                {readingHistory.length === 0 ? (
                  <div className="text-center py-10 text-stone-500">
                    <History className="w-10 h-10 mx-auto mb-2 text-stone-500 opacity-40" />
                    <p className="text-xs font-serif">עדיין לא נפתחו ספרים. ברגע שתפתח ספר, הוא יישמר כאן אוטומטית.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {readingHistory.map(hist => (
                      <div
                        key={hist.id}
                        onClick={() => onOpenBookAtLine(hist.bookId, hist.bookTitle, hist.lastPosition || 1)}
                        className={`border ${isDark ? 'border-stone-800 bg-[#251B14] hover:bg-[#2F2117] hover:border-amber-700' : 'border-stone-200 bg-stone-50/50 hover:bg-amber-50/50 hover:border-amber-300'} rounded-xl p-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer group`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-amber-800 text-amber-100 group-hover:bg-amber-700 transition-colors">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className={`text-sm font-bold font-serif ${isDark ? 'text-stone-100 group-hover:text-amber-300' : 'text-stone-900 group-hover:text-amber-900'}`}>
                              {hist.bookTitle}
                            </h4>
                            <span className="text-[11px] text-stone-400 font-sans">
                              {hist.lastSection ? `קטע: ${hist.lastSection} • ` : ''}שורה #{hist.lastPosition || 1} • {new Date(hist.lastReadAt).toLocaleDateString('he-IL')}
                            </span>
                          </div>
                        </div>

                        <button className={`px-3 py-1.5 ${isDark ? 'bg-stone-800 border-stone-700 text-amber-300 group-hover:bg-amber-800 group-hover:text-white' : 'bg-white border-stone-200 text-amber-900 group-hover:bg-amber-800 group-hover:text-white'} border rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer`}>
                          <span>המשך קריאה</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bookmarks */}
          {activeTool === 'bookmarks' && (
            <div className="max-w-3xl space-y-4">
              <div className={`${isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-white border-stone-200'} border rounded-xl p-5 shadow-xs`}>
                <h3 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'} mb-1 flex items-center gap-2`}>
                  <Bookmark className="w-4 h-4 text-amber-500" />
                  <span>סימניות שמורות ({bookmarks.length})</span>
                </h3>
                <p className="text-xs text-stone-400 mb-4">
                  כל הסימניות והנקודות ששמרת בעת הלימוד בספרים
                </p>

                {bookmarks.length === 0 ? (
                  <div className="text-center py-10 text-stone-500">
                    <Bookmark className="w-10 h-10 mx-auto mb-2 text-stone-500 opacity-40" />
                    <p className="text-xs">טרם נשמרו סימניות. בעת עיון בספר לחץ על צלמית הסימנייה לשמירה.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map(bm => (
                      <div
                        key={bm.id}
                        className={`border ${isDark ? 'border-stone-800 bg-[#251B14] hover:bg-[#2F2117] hover:border-amber-700' : 'border-stone-200 bg-stone-50/50 hover:bg-white'} rounded-xl p-3.5 flex items-center justify-between gap-4 transition-colors`}
                      >
                        <div
                          className="flex-1 cursor-pointer truncate"
                          onClick={() => onOpenBookAtLine(bm.bookId, bm.bookTitle, bm.lineIndex)}
                        >
                          <div className={`flex items-center gap-2 text-xs font-bold ${isDark ? 'text-stone-100' : 'text-stone-900'} font-serif`}>
                            <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                            <span>{bm.bookTitle}</span>
                            <span className="text-stone-400 font-sans font-normal text-[11px]">
                              (שורה {bm.lineIndex})
                            </span>
                          </div>
                          <p className={`text-xs ${isDark ? 'text-stone-300' : 'text-stone-600'} truncate mt-1 font-serif`}>
                            {bm.snippet}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onOpenBookAtLine(bm.bookId, bm.bookTitle, bm.lineIndex)}
                            className={`p-1.5 rounded-lg ${isDark ? 'text-amber-400 hover:bg-stone-800' : 'text-amber-800 hover:bg-amber-50'} cursor-pointer`}
                            title="פתח בספר"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onRemoveBookmark(bm.id)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50/20 cursor-pointer"
                            title="מחק סימנייה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Gematria Calculator */}
          {activeTool === 'gematria' && (
            <div className="max-w-2xl space-y-5">
              <div className={`${isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-white border-stone-200'} border rounded-xl p-6 shadow-xs space-y-4`}>
                <h3 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'} flex items-center gap-2`}>
                  <Calculator className="w-4 h-4 text-amber-500" />
                  <span>מחשבון גימטריה</span>
                </h3>
                <p className="text-xs text-stone-400">
                  הקלד מילה, ביטוי או פסוק לחישוב הערך המספרי והשוואה עם מונחי קודש
                </p>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={gematriaInput}
                    onChange={e => setGematriaInput(e.target.value)}
                    placeholder="הקלד כאן (למשל: תורה, שבת קודש, ישראל)..."
                    className={`w-full ${isDark ? 'bg-[#251B14] border-stone-700 text-stone-100 placeholder-stone-500' : 'bg-stone-50 border-stone-300 text-stone-900'} border rounded-xl p-3 text-base font-serif focus:outline-none focus:ring-2 focus:ring-amber-700/50`}
                    autoFocus
                  />
                  {gematriaInput && (
                    <div className="text-[11px] text-stone-400">
                      טקסט ללא ניקוד: {stripNikud(gematriaInput)}
                    </div>
                  )}
                </div>

                {/* Result Display */}
                <div className={`${isDark ? 'bg-amber-950/60 border-amber-900/60' : 'bg-amber-50/70 border-amber-200/80'} border rounded-xl p-5 flex items-center justify-between`}>
                  <div>
                    <span className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>ערך הגימטריה:</span>
                    <div className={`text-3xl font-serif font-black ${isDark ? 'text-amber-200' : 'text-amber-950'} mt-0.5`}>
                      {gematriaValue}
                    </div>
                  </div>
                  <div className="text-left font-serif">
                    <span className={`text-xs ${isDark ? 'text-amber-400' : 'text-amber-800'} font-medium`}>באותיות עבריות:</span>
                    <div className={`text-2xl font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                      {numberToHebrew(gematriaValue) || '-'}
                    </div>
                  </div>
                </div>

                {/* Common Reference Values */}
                <div className="pt-2">
                  <div className={`text-xs font-bold ${isDark ? 'text-stone-300' : 'text-stone-700'} mb-2`}>גימטריות מרכזיות ביהדות:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {gematriaMatches.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setGematriaInput(m.label)}
                        className={`p-2.5 rounded-lg border ${isDark ? 'border-stone-800 bg-[#251B14] hover:bg-stone-800 text-stone-200' : 'border-stone-200 bg-stone-50 hover:bg-amber-50 hover:border-amber-300 text-stone-900'} text-right text-xs transition-colors cursor-pointer`}
                      >
                        <div className="font-bold font-serif">{m.label}</div>
                        <div className="text-[11px] text-amber-500">{m.value}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hebrew Calendar & Times */}
          {activeTool === 'calendar' && (
            <div className="max-w-2xl space-y-4">
              <div className={`${isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-white border-stone-200'} border rounded-xl p-6 shadow-xs space-y-4`}>
                <h3 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'} flex items-center gap-2`}>
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span>לוח שנה עברי וזמני היום</span>
                </h3>

                <div className={`p-4 ${isDark ? 'bg-amber-950/60 border-amber-900/60' : 'bg-amber-50/60 border-amber-200'} border rounded-xl flex items-center justify-between`}>
                  <div>
                    <div className="text-xs text-amber-500">התאריך העברי:</div>
                    <div className={`text-xl font-bold font-serif ${isDark ? 'text-amber-200' : 'text-amber-950'} mt-0.5`}>
                      {hebrewDate}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-amber-500">פרשת השבוע:</div>
                    <div className={`text-lg font-bold font-serif ${isDark ? 'text-amber-200' : 'text-amber-950'} mt-0.5`}>
                      פרשת השבוע
                    </div>
                  </div>
                </div>

                <div className={`border ${isDark ? 'border-stone-800' : 'border-stone-200'} rounded-xl overflow-hidden text-xs`}>
                  <div className={`${isDark ? 'bg-stone-800/80 text-stone-200 border-stone-800' : 'bg-stone-100 text-stone-800 border-stone-200'} font-bold p-3 border-b`}>
                    זמני היום המשוערים (אופק {settings?.calendarLocation || 'ירושלים'})
                  </div>
                  <div className={`divide-y ${isDark ? 'divide-stone-800' : 'divide-stone-100'}`}>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">עלות השחר</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>05:08</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">הנץ החמה</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>06:24</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">סוף זמן קריאת שמע (מג"א / גר"א)</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>08:52 / 09:28</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">חצות היום</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>12:32</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">שקיעת החמה</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>18:40</span>
                    </div>
                    <div className="p-3 flex justify-between">
                      <span className="text-stone-400">צאת הכוכבים</span>
                      <span className={`font-bold ${isDark ? 'text-stone-200' : 'text-stone-900'} font-mono`}>19:04</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Personal Notes */}
          {activeTool === 'notes' && (
            <div className={`max-w-2xl ${isDark ? 'bg-[#1C140F] border-stone-800' : 'bg-white border-stone-200'} border rounded-xl p-6 shadow-xs space-y-4`}>
              <h3 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'} flex items-center gap-2`}>
                <FileText className="w-4 h-4 text-amber-500" />
                <span>הערות וחידושי תורה אישיים</span>
              </h3>
              <p className="text-xs text-stone-400">
                כתיבת הערות אישיות, מראי מקומות וחידושים הנשמרים בדיסק בשרת ובמחשבך
              </p>

              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="כתוב כאן חידוש תורה, הערה על ספר, או סיכום לימוד..."
                rows={9}
                className={`w-full ${isDark ? 'bg-[#251B14] border-stone-700 text-stone-100 placeholder-stone-500' : 'bg-stone-50 border-stone-300 text-stone-900'} border rounded-xl p-3 text-sm leading-relaxed font-serif focus:outline-none focus:ring-2 focus:ring-amber-700/50`}
              />

              <div className="flex items-center justify-between">
                {noteSavedFeedback ? (
                  <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    ההערה נשמרה בהצלחה!
                  </span>
                ) : <span />}

                <button
                  onClick={handleSaveNote}
                  className="px-4 py-2 bg-amber-800 text-white rounded-lg text-xs font-semibold hover:bg-amber-900 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>שמור הערה</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Study Modal */}
      {settings && onUpdateSettings && (
        <Suspense fallback={null}>
          <CustomStudyModal
            isOpen={isCustomStudyModalOpen}
            onClose={() => setIsCustomStudyModalOpen(false)}
            settings={settings}
            catalogBooks={catalogBooks}
            onUpdateSettings={onUpdateSettings}
          />
        </Suspense>
      )}
    </div>
  );
};
