import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  Download,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { numberToHebrew, hebrewToNumber } from '../utils/gematria';
import { findShasTractate } from './TzuratHaDafModal';
import { OtzariaPdfCanvasViewer } from './OtzariaPdfCanvasViewer';
import { ReaderSettings } from '../types/otzaria';

interface TzuratHaDafTabViewProps {
  bookTitle: string;
  initialDafNum?: number;
  initialAmud?: 'a' | 'b';
  settings: ReaderSettings;
  onUpdateTitle?: (newTitle: string) => void;
}

export const TzuratHaDafTabView: React.FC<TzuratHaDafTabViewProps> = ({
  bookTitle,
  initialDafNum = 2,
  initialAmud = 'a',
  settings,
  onUpdateTitle
}) => {
  const tractateMatch = findShasTractate(bookTitle);
  const tractateHebrew = tractateMatch ? tractateMatch.name : bookTitle;
  const startDaf = tractateMatch ? tractateMatch.startDaf : 2;
  const maxDappim = tractateMatch?.totalDappim ? tractateMatch.totalDappim : 180;
  const reqId = tractateMatch ? tractateMatch.req : 21111;

  const [dafNum, setDafNum] = useState<number>(initialDafNum);
  const [amud, setAmud] = useState<'a' | 'b'>(initialAmud);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Sync state if initial props change
  useEffect(() => {
    if (initialDafNum !== undefined) {
      setDafNum(initialDafNum);
    }
  }, [initialDafNum]);

  useEffect(() => {
    if (initialAmud !== undefined) {
      setAmud(initialAmud);
    }
  }, [initialAmud]);

  const isDark = settings.theme === 'dark';

  const currentDafLabel = `דף ${numberToHebrew(dafNum)} ע״${amud === 'a' ? 'א' : 'ב'}`;

  // Keep tab title in sync without triggering infinite re-render loop
  const onUpdateTitleRef = React.useRef(onUpdateTitle);
  useEffect(() => {
    onUpdateTitleRef.current = onUpdateTitle;
  });

  useEffect(() => {
    if (onUpdateTitleRef.current) {
      onUpdateTitleRef.current(`צורת הדף - ${tractateHebrew} (${currentDafLabel})`);
    }
  }, [tractateHebrew, currentDafLabel]);

  // Next / Prev Daf Logic
  const handleNextDaf = () => {
    if (amud === 'a') {
      setAmud('b');
    } else if (dafNum < maxDappim) {
      setDafNum(prev => prev + 1);
      setAmud('a');
    }
  };

  const handlePrevDaf = () => {
    if (amud === 'b') {
      setAmud('a');
    } else if (dafNum > startDaf) {
      setDafNum(prev => prev - 1);
      setAmud('b');
    }
  };

  // Direct links
  const offset = Math.max(0, dafNum - startDaf);
  const pageNum = Math.max(1, offset * 2 + (amud === 'a' ? 2 : 3));
  const readerPageUrl = `https://hebrewbooks.org/reader/page.aspx?req=${reqId}&pg=${pageNum}`;
  const pdfDownloadUrl = `/api/tzurat-hadaf/page?masechta=${encodeURIComponent(tractateHebrew)}&daf=${dafNum}&amud=${amud}`;

  // Keyboard shortcut for fullscreen (F) or exit (Esc)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'f') {
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  return (
    <div
      className={`w-full h-full flex flex-col overflow-hidden transition-all select-none ${
        isFullscreen ? 'fixed inset-0 z-50' : 'relative'
      } ${isDark ? 'bg-[#18110D] text-stone-100' : 'bg-[#FAF8F5] text-stone-900'}`}
    >
      {/* Top Header Controls Bar */}
      <div
        className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 ${
          isDark ? 'bg-[#1C140F] border-stone-800 shadow-md' : 'bg-amber-100/90 border-amber-200 shadow-xs'
        }`}
      >
        {/* Title & Active Daf Badge */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-800 text-white rounded-lg shadow-xs">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold font-serif">
                מסכת {tractateHebrew} – צורת הדף המקורית
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-800 text-white font-bold font-serif shadow-2xs">
                {currentDafLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Right Navigation & Control Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Daf Selector & Next/Prev */}
          <div className="flex items-center bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={handlePrevDaf}
              disabled={dafNum <= startDaf && amud === 'a'}
              className="p-1.5 hover:bg-amber-100 dark:hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer text-stone-700 dark:text-stone-200 transition-colors"
              title="דף קודם"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <select
              value={`${dafNum}_${amud}`}
              onChange={e => {
                const [d, a] = e.target.value.split('_');
                setDafNum(parseInt(d, 10));
                setAmud(a as 'a' | 'b');
              }}
              className="text-xs font-serif font-bold px-2 py-1 bg-transparent text-amber-950 dark:text-amber-300 border-none outline-none cursor-pointer text-center"
              title="בחר דף ועמוד"
            >
              {Array.from({ length: maxDappim - startDaf + 1 }, (_, i) => startDaf + i).flatMap(d => [
                <option key={`${d}_a`} value={`${d}_a`} className="text-stone-900 bg-white dark:bg-stone-900 dark:text-stone-100">
                  דף {numberToHebrew(d)} ע״א
                </option>,
                <option key={`${d}_b`} value={`${d}_b`} className="text-stone-900 bg-white dark:bg-stone-900 dark:text-stone-100">
                  דף {numberToHebrew(d)} ע״ב
                </option>
              ])}
            </select>

            <button
              onClick={handleNextDaf}
              disabled={dafNum >= maxDappim && amud === 'b'}
              className="p-1.5 hover:bg-amber-100 dark:hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer text-stone-700 dark:text-stone-200 transition-colors"
              title="דף הבא"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              isFullscreen
                ? 'bg-amber-800 text-white border-amber-700 ring-2 ring-amber-400'
                : 'bg-white dark:bg-stone-900 hover:bg-amber-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
            }`}
            title={isFullscreen ? 'צא ממסך מלא (Esc או F)' : 'מסך מלא (F)'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>צא ממסך מלא</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>מסך מלא</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Otzaria Canvas Viewport */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
        <OtzariaPdfCanvasViewer
          masechta={tractateHebrew}
          dafNum={dafNum}
          amud={amud}
          title={tractateHebrew}
          dafLabel={currentDafLabel}
          isDarkTheme={isDark}
          onNextDaf={handleNextDaf}
          onPrevDaf={handlePrevDaf}
          hasNextDaf={dafNum < maxDappim || amud === 'a'}
          hasPrevDaf={dafNum > startDaf || amud === 'b'}
        />
      </div>

      {/* Bottom Footer Controls Bar */}
      <div
        className={`w-full flex flex-wrap items-center justify-between text-xs px-4 py-2 border-t z-20 shrink-0 ${
          isDark
            ? 'bg-[#1C140F] border-stone-800 text-stone-400'
            : 'bg-white/95 border-amber-200/70 text-stone-600 shadow-2xs'
        }`}
      >
        <span className="font-serif font-bold text-stone-800 dark:text-stone-200">
          דף וילנא מקורי: מסכת {tractateHebrew} {currentDafLabel}
        </span>

        <div className="flex items-center gap-4 flex-wrap">
          <a
            href={readerPageUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 hover:underline font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            פתח בקורא HebrewBooks
          </a>

          <span className="text-stone-300 dark:text-stone-700">|</span>

          <a
            href={pdfDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-amber-800 dark:text-amber-400 hover:underline font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            הורד קובץ PDF
          </a>
        </div>
      </div>
    </div>
  );
};
