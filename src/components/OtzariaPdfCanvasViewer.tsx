import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Maximize2,
  ExternalLink,
  BookOpen,
  Layers
} from 'lucide-react';
import { findShasTractate } from './TzuratHaDafModal';

interface OtzariaPdfCanvasViewerProps {
  masechta: string;
  dafNum: number;
  amud: 'a' | 'b';
  title: string;
  dafLabel: string;
  isDarkTheme?: boolean;
  onNextDaf?: () => void;
  onPrevDaf?: () => void;
  hasNextDaf?: boolean;
  hasPrevDaf?: boolean;
}

export const OtzariaPdfCanvasViewer: React.FC<OtzariaPdfCanvasViewerProps> = ({
  masechta,
  dafNum,
  amud,
  title,
  dafLabel,
  isDarkTheme = false,
  onNextDaf,
  onPrevDaf,
  hasNextDaf = true,
  hasPrevDaf = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [invertDark, setInvertDark] = useState<boolean>(isDarkTheme);

  const tractateMatch = findShasTractate(masechta) || findShasTractate(title);
  const tractateHebrew = tractateMatch?.name || masechta || title;
  const reqId = tractateMatch?.req || 21111;
  const startDaf = tractateMatch?.startDaf || 2;
  const offset = Math.max(0, dafNum - startDaf);
  const pageNum = Math.max(1, offset * 2 + (amud === 'a' ? 2 : 3));

  // Open the selected folio inside the full local tractate PDF. When a scan is unavailable,
  // the server redirects to the existing single-daf online fallback.
  const pdfStreamUrl = `/api/tzurat-hadaf/book?masechta=${encodeURIComponent(tractateHebrew)}&daf=${dafNum}&amud=${amud}&v=1#page=${pageNum}`;
  const hbReaderUrl = `https://hebrewbooks.org/pdfpager.aspx?req=${reqId}&stype=1&pg=${pageNum}`;

  useEffect(() => {
    setLoading(true);
  }, [masechta, dafNum, amud]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft' && onNextDaf && hasNextDaf) {
        onNextDaf();
      } else if (e.key === 'ArrowRight' && onPrevDaf && hasPrevDaf) {
        onPrevDaf();
      } else if (e.key.toLowerCase() === 'i') {
        setInvertDark(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNextDaf, onPrevDaf, hasNextDaf, hasPrevDaf]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between overflow-hidden select-none">
      {/* Floating Zoom & Controls Bar */}
      <div className="absolute top-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-xl border bg-white/95 dark:bg-stone-900/95 border-amber-300 dark:border-stone-700 backdrop-blur-md transition-all flex-wrap">
        {/* Fit / Zoom */}
        <button
          onClick={() => setZoomScale(s => (s === 1.0 ? 1.25 : 1.0))}
          className="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
          title="שנה זום"
        >
          {zoomScale === 1.0 ? '100%' : '125%'}
        </button>

        <div className="w-px h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

        {/* Invert Dark Mode */}
        <button
          onClick={() => setInvertDark(!invertDark)}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            invertDark
              ? 'bg-amber-900/30 text-amber-300 border-amber-600'
              : 'hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border-transparent'
          }`}
          title={invertDark ? 'מצב יום (רגיל)' : 'מצב לילה (ניגודיות הפוכה)'}
        >
          {invertDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-700 dark:text-stone-300" />}
        </button>

        {/* Rotation */}
        <button
          onClick={() => setRotation(r => (r + 90) % 360)}
          className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
          title="סובב ב-90 מעלות"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

        {/* Open in external reader */}
        <a
          href={hbReaderUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-800 text-white hover:bg-amber-900 transition-colors cursor-pointer shadow-2xs"
          title="פתח בקורא HebrewBooks החיצוני"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>HebrewBooks</span>
        </a>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        className={`w-full flex-1 overflow-hidden flex items-center justify-center p-2 sm:p-4 relative ${
          isDarkTheme ? 'bg-[#120E0B]' : 'bg-[#F2ECE1]'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100/80 dark:bg-stone-950/80 z-20 backdrop-blur-xs">
            <div className="w-10 h-10 border-4 border-amber-800 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-serif font-bold text-amber-950 dark:text-amber-300">
              טוען את צורת הדף…
            </p>
          </div>
        )}

        {/* Vector Pristine PDF Embedded Frame */}
        <div
          className="w-full h-full max-w-5xl rounded-xl shadow-2xl overflow-hidden border border-stone-300 dark:border-stone-800 bg-white transition-all duration-150"
          style={{
            filter: invertDark ? 'invert(0.92) hue-rotate(180deg) contrast(1.05)' : 'none'
          }}
        >
          <iframe
            key={pdfStreamUrl}
            src={pdfStreamUrl}
            title={`${title} ${dafLabel}`}
            onLoad={() => setLoading(false)}
            className="w-full h-full border-none rounded-xl bg-white"
          />
        </div>
      </div>

      {/* Side Quick Navigation Floating Arrows */}
      {hasPrevDaf && onPrevDaf && (
        <button
          onClick={onPrevDaf}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 dark:bg-stone-900/90 text-stone-700 dark:text-stone-200 hover:bg-amber-800 hover:text-white rounded-full shadow-2xl border border-amber-300 dark:border-stone-700 transition-all cursor-pointer z-20 group"
          title="דף קודם (חץ ימינה)"
        >
          <ChevronRight className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {hasNextDaf && onNextDaf && (
        <button
          onClick={onNextDaf}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 dark:bg-stone-900/90 text-stone-700 dark:text-stone-200 hover:bg-amber-800 hover:text-white rounded-full shadow-2xl border border-amber-300 dark:border-stone-700 transition-all cursor-pointer z-20 group"
          title="דף הבא (חץ שמאלה)"
        >
          <ChevronLeft className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  );
};
