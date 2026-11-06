import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Sparkles,
  Info,
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { ClassifiedPageOverlay, ClassifiedWord, WordType } from '../services/classifier';
import { getCommentary, CommentaryApiResponse } from '../services/apiClient';
import { CommentaryPanel } from './CommentaryPanel';

interface PageOverlayProps {
  bookId: number | string;
  bookTitle?: string;
  pageNumber?: number;
  masechta?: string;
  dafNum?: number;
  amud?: 'a' | 'b';
  overlayData: ClassifiedPageOverlay | null;
  pageImageUrl: string;
  isLoading?: boolean;
}

export const PageOverlay: React.FC<PageOverlayProps> = ({
  bookId,
  bookTitle = 'תלמוד בבלי',
  pageNumber = 1,
  masechta,
  dafNum,
  amud,
  overlayData,
  pageImageUrl,
  isLoading = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [zoomScale, setZoomScale] = useState<number>(1.1);
  const [activeFilter, setActiveFilter] = useState<WordType | 'all'>('all');
  const [showOutlines, setShowOutlines] = useState<boolean>(false);
  const [hoveredWordId, setHoveredWordId] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<ClassifiedWord | null>(null);

  // Commentary Panel State
  const [commentaryData, setCommentaryData] = useState<CommentaryApiResponse | null>(null);
  const [isCommentaryLoading, setIsCommentaryLoading] = useState<boolean>(false);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);

  // Drag to pan
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const viewWidth = overlayData?.viewWidth || 600;
  const viewHeight = overlayData?.viewHeight || 800;

  const handleWordClick = async (word: ClassifiedWord) => {
    setSelectedWord(word);
    setIsPanelOpen(true);
    setIsCommentaryLoading(true);

    try {
      const lineIdx = word.lineGroupIndex || 1;
      const resp = await getCommentary(bookId, lineIdx);
      setCommentaryData(resp);
    } catch (err) {
      console.error('[PageOverlay] Failed to fetch commentary:', err);
    } finally {
      setIsCommentaryLoading(false);
    }
  };

  const filteredWords = (overlayData?.allWords || []).filter(w => {
    if (activeFilter === 'all') return true;
    return w.type === activeFilter;
  });

  // Color coding per word type
  const getTypeBadgeColor = (type: WordType) => {
    switch (type) {
      case 'gemara':
        return 'bg-[#2E180B] text-[#FFF5E6] font-extrabold shadow-2xs';
      case 'rashi':
        return 'bg-amber-800 text-white font-bold';
      case 'tosafot':
        return 'bg-stone-800 text-stone-100 font-bold';
      case 'marginalia':
        return 'bg-stone-500 text-white font-semibold';
      default:
        return 'bg-amber-900 text-white';
    }
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    containerRef.current.scrollLeft = panStart.scrollLeft - dx;
    containerRef.current.scrollTop = panStart.scrollTop - dy;
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="relative w-full h-full flex flex-row overflow-hidden bg-[#F2ECE1] dark:bg-[#120E0B] select-none">
      {/* Main Page Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Floating Controls Bar */}
        <div className="absolute top-3 right-1/2 translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl shadow-2xl border bg-white/95 dark:bg-stone-900/95 border-amber-300/80 dark:border-stone-700 backdrop-blur-md transition-all flex-wrap">
          {/* Zoom controls */}
          <button
            onClick={() => setZoomScale(s => Math.min(2.5, +(s + 0.15).toFixed(2)))}
            className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            title="הגדל (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono font-bold min-w-10 text-center text-amber-950 dark:text-amber-300">
            {Math.round(zoomScale * 100)}%
          </span>

          <button
            onClick={() => setZoomScale(s => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            title="הקטן (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

          {/* Word Type Filter Pills */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-amber-800 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-stone-800'
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setActiveFilter('gemara')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'gemara'
                  ? 'bg-amber-800 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-stone-800'
              }`}
            >
              גמרא
            </button>
            <button
              onClick={() => setActiveFilter('rashi')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'rashi'
                  ? 'bg-amber-800 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-stone-800'
              }`}
            >
              רש״י
            </button>
            <button
              onClick={() => setActiveFilter('tosafot')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeFilter === 'tosafot'
                  ? 'bg-amber-800 text-white'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-stone-800'
              }`}
            >
              תוספות
            </button>
          </div>

          <div className="w-px h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

          {/* Toggle outlines */}
          <button
            onClick={() => setShowOutlines(!showOutlines)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showOutlines
                ? 'bg-amber-800 text-white border-amber-700'
                : 'text-stone-700 dark:text-stone-300 hover:bg-amber-100 dark:hover:bg-stone-800 border-transparent'
            }`}
            title={showOutlines ? 'הסתר מסגרות מילים' : 'הצג מסגרות מילים (BBoxes)'}
          >
            {showOutlines ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>

        {/* Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full flex-1 overflow-auto flex items-start justify-center p-6 sm:p-10 relative ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100/80 dark:bg-stone-950/80 z-20 backdrop-blur-xs">
              <div className="w-10 h-10 border-4 border-amber-800 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs font-serif font-bold text-amber-950 dark:text-amber-300">
                מחלץ מילים ומבצע קלסיפיקציה עבור {bookTitle}...
              </p>
            </div>
          )}

          {/* Page Container */}
          <div
            className="m-auto relative rounded-lg shadow-2xl bg-white overflow-hidden border border-stone-300 dark:border-stone-800 transition-transform duration-100"
            style={{
              width: `${Math.round(800 * zoomScale)}px`,
              height: `${Math.round((viewHeight / viewWidth) * 800 * zoomScale)}px`
            }}
          >
            {/* Background High-Res Image */}
            <img
              ref={imageRef}
              src={pageImageUrl}
              alt={`${bookTitle} עמוד ${pageNumber}`}
              className="w-full h-full object-contain display-block pointer-events-none select-none"
            />

            {/* Bounding Box Word Overlay Layer */}
            <div className="absolute inset-0 z-10 pointer-events-auto">
              {filteredWords.map(word => {
                const isHovered = hoveredWordId === word.id;
                const isSelected = selectedWord?.id === word.id;

                // Scale bounding box coordinates relative to viewport width (800px base)
                const scaleFactor = (800 * zoomScale) / viewWidth;
                const left = word.x * scaleFactor;
                const top = word.y * scaleFactor;
                const width = Math.max(word.w * scaleFactor, 12);
                const height = Math.max(word.h * scaleFactor, 12);

                return (
                  <div
                    key={word.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWordClick(word);
                    }}
                    onMouseEnter={() => setHoveredWordId(word.id)}
                    onMouseLeave={() => setHoveredWordId(null)}
                    style={{
                      position: 'absolute',
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${width}px`,
                      height: `${height}px`
                    }}
                    className={`cursor-pointer transition-all duration-100 rounded-2xs ${
                      isSelected
                        ? 'bg-amber-400/70 border-2 border-amber-700 shadow-md ring-2 ring-amber-300/80 z-30 scale-105'
                        : isHovered
                        ? 'bg-amber-300/50 border border-amber-600 shadow-xs z-20 scale-105'
                        : showOutlines
                        ? 'border border-amber-500/40 bg-amber-100/10 hover:bg-amber-300/30'
                        : 'bg-transparent hover:bg-amber-300/40'
                    }`}
                    title={`${word.t} (${word.type}) - שורה ${word.lineGroupIndex || 1}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Side Commentary Panel */}
      {isPanelOpen && (
        <CommentaryPanel
          data={commentaryData}
          selectedWordText={selectedWord?.t}
          lineIndex={selectedWord?.lineGroupIndex}
          bookTitle={bookTitle}
          isLoading={isCommentaryLoading}
          searchQuery={selectedWord?.t}
          onClose={() => setIsPanelOpen(false)}
        />
      )}
    </div>
  );
};
