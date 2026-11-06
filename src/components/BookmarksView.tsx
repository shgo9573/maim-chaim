import React from 'react';
import { BookmarkItem, ReaderSettings } from '../types/otzaria';
import { Bookmark, Trash2, BookOpen } from 'lucide-react';

interface BookmarksViewProps {
  bookmarks: BookmarkItem[];
  settings?: ReaderSettings;
  onRemoveBookmark: (id: string) => void;
  onOpenBookAtLine: (bookId: number | string, bookTitle: string, lineIndex: number) => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  bookmarks,
  settings,
  onRemoveBookmark,
  onOpenBookAtLine
}) => {
  const isDark = settings?.theme === 'dark';

  return (
    <div className={`flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-10 select-none ${
      isDark ? 'bg-[#18110D] text-stone-100' : 'bg-[#FAF8F5] text-stone-900'
    }`}>
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
        <div className={`p-6 rounded-3xl border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-800 text-amber-100 rounded-2xl shadow-inner">
              <Bookmark className="w-6 h-6 text-amber-200" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold font-serif ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                הסימניות שלי
              </h2>
              <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                סימניות שמורות לקטעים נבחרים בעת הלימוד
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${
              isDark ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-900'
            }`}>
              {bookmarks.length} סימניות
            </span>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className={`p-12 rounded-3xl border text-center flex flex-col items-center justify-center ${
            isDark ? 'bg-[#211711] border-stone-800 text-stone-400' : 'bg-white border-stone-200 text-stone-500'
          }`}>
            <Bookmark className={`w-12 h-12 mb-3 stroke-[1.5] ${isDark ? 'text-amber-600' : 'text-amber-300'}`} />
            <p className={`text-lg font-serif ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
              אין עדיין סימניות שמורות.
            </p>
            <p className="text-xs text-stone-500 mt-1">
              במהלך הקריאה בספר, לחץ על האייקון של הסימנייה לצד השורה לשמירה מהירה.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bookmarks.map(bm => (
              <div
                key={bm.id}
                onClick={() => onOpenBookAtLine(bm.bookId, bm.bookTitle, bm.lineIndex)}
                className={`group p-5 rounded-2xl border shadow-xs hover:shadow-md transition-all cursor-pointer flex items-start justify-between gap-4 ${
                  isDark
                    ? 'bg-[#211711] border-stone-800 hover:border-amber-700/60'
                    : 'bg-white border-stone-200 hover:border-amber-400'
                }`}
              >
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    <h3 className={`text-base font-bold font-serif ${
                      isDark ? 'text-stone-100 group-hover:text-amber-300' : 'text-stone-900 group-hover:text-amber-900'
                    }`}>
                      {bm.bookTitle}
                    </h3>
                    <span className={`text-xs font-sans ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
                      • שורה #{bm.lineIndex}
                    </span>
                  </div>
                  <p className={`text-sm font-serif leading-relaxed p-3 rounded-xl border ${
                    isDark
                      ? 'bg-stone-900/80 border-stone-800 text-stone-200'
                      : 'bg-stone-50 border-stone-200/80 text-stone-800'
                  }`}>
                    "{bm.snippet}"
                  </p>
                </div>

                <button
                  onClick={e => {
                    e.stopPropagation();
                    onRemoveBookmark(bm.id);
                  }}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    isDark ? 'text-stone-400 hover:text-red-400 hover:bg-red-950/40' : 'text-stone-400 hover:text-red-700 hover:bg-red-50'
                  }`}
                  title="מחק סימנייה"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
