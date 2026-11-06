import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Download,
  Sun,
  Moon,
  ExternalLink,
  RotateCw,
  Search,
  MessageSquareText,
  BookMarked,
  FileText,
  MoveHorizontal,
  MoveVertical,
  Code2
} from 'lucide-react';
import { numberToHebrew, hebrewToNumber } from '../utils/gematria';
import { ReaderSettings } from '../types/otzaria';
import { SimplePdfViewer } from './SimplePdfViewer';
import type { PdfTextLayerItem } from './SimplePdfViewer';
import { detectDafBubbles } from '../utils/dafDetection';
import type { Segment } from '../utils/dafDetection';
import type { Bubble } from '../utils/dafTypes';
import { loadDafSegments } from '../utils/dafSegments';
import { findInText, findOcrMatches } from '../utils/dafOcr';
import type { OcrPage } from '../utils/dafOcr';
import { dafLabel } from '../utils/dafHebrew';
import { useApp } from '../store';
import CommentaryPanel from './CommentaryPanel';
import type { TextOpts } from '../utils/text';
import { findShasTractate, SHAS_MAP } from '../utils/shasTractates';
export { findShasTractate, SHAS_MAP };

export interface TzuratHaDafViewProps {
  bookTitle: string;
  bookId?: number | string;
  initialDaf?: string; // e.g., "דף ב ע״א" or "ב ע״א"
  settings?: Partial<ReaderSettings>;
  onCloseTab?: () => void;
  onOpenBookAtLine?: (bookId: number | string, bookTitle: string, lineIndex?: number, initialSearch?: string) => void;
  onDafChange?: (dafLabel: string) => void;
}

/**
 * Robust Talmud Daf & Amud parser supporting all standard formats:
 * - "דף ב.", "דף ב:" (dot = amud a, colon = amud b)
 * - "דף ב ע״א", "דף ב ע״ב", "דף ב עמוד א", "דף ב עמוד ב"
 * - "ב.", "ב:", "ב ע״א", "ב ע״ב"
 * - "דף 2 ע״א", "דף 2"
 */
export function parseDafString(
  raw: string,
  startDaf: number = 2,
  maxDappim: number = 180
): { dafNum: number; amud: 'a' | 'b' } {
  if (!raw || typeof raw !== 'string') return { dafNum: startDaf, amud: 'a' };

  // Strip Hebrew quote marks before parsing, including quote marks inside daf numerals.
  const cleanRaw = raw.replace(/[\u05F3\u05F4'"´]/g, '').replace(/\s+/g, ' ').trim();
  const clamp = (num: number, side: 'a' | 'b') => ({
    dafNum: Math.max(startDaf, Math.min(maxDappim, num)),
    amud: side,
  });

  // Explicit amud must be tested before the permissive period/colon notation.
  const explicit = cleanRaw.match(/(?:^|\s)דף\s*([א-תךםןףץ]{1,6}|\d{1,3})\s*(?:ע\s*([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב])|\s+([אב]))/u);
  if (explicit) {
    const token = explicit[1];
    const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
    const side = explicit[2] || explicit[3] || explicit[4] || explicit[5] || 'א';
    if (num > 0) return clamp(num, side.includes('ב') || side.includes('שני') ? 'b' : 'a');
  }

  // Compact notation: period = amud aleph, colon = amud bet.
  const dotColonMatch = cleanRaw.match(/(?:דף\s*)?([א-תךםןףץ]{1,6}|\d{1,3})\s*([.:])/u);
  if (dotColonMatch) {
    const token = dotColonMatch[1];
    const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
    if (num > 0) return clamp(num, dotColonMatch[2] === ':' ? 'b' : 'a');
  }

  // Short labels without the word "דף", such as "כג עב".
  const short = cleanRaw.match(/^([א-תךםןףץ]{1,6}|\d{1,3})\s*(?:ע\s*([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב]))/u);
  if (short) {
    const token = short[1];
    const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
    const side = short[2] || short[3] || short[4] || 'א';
    if (num > 0) return clamp(num, side.includes('ב') || side.includes('שני') ? 'b' : 'a');
  }

  // A bare daf label means the first side if no amud is present.
  const bare = cleanRaw.match(/(?:^|\s)דף\s*([א-תךםןףץ]{1,6}|\d{1,3})$/u);
  if (bare) {
    const token = bare[1];
    const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
    if (num > 0) return clamp(num, 'a');
  }

  return { dafNum: startDaf, amud: 'a' };
}

const FALLBACK_BAVLI_BOOK_IDS: Record<string, number> = {
  'ברכות':103,'שבת':104,'עירובין':105,'פסחים':106,'יומא':107,'סוכה':108,'ביצה':109,
  'ראש השנה':110,'תענית':111,'מגילה':112,'מועד קטן':113,'חגיגה':114,'יבמות':115,
  'כתובות':116,'נדרים':117,'נזיר':118,'סוטה':119,'גיטין':120,'קידושין':121,
  'בבא קמא':122,'בבא מציעא':123,'בבא בתרא':124,'סנהדרין':125,'מכות':126,
  'שבועות':127,'עבודה זרה':128,'הוריות':129,'זבחים':130,'מנחות':131,'חולין':132,
  'בכורות':133,'ערכין':134,'תמורה':135,'כריתות':136,'מעילה':137,'תמיד':138,'נדה':139,
};
/**
 * The Gemara is the only layer this view draws. Nothing is painted until the reader
 * points at a line; then it lights up as one highlighter mark, and a click keeps it lit.
 * Every rectangle of a line sits in one composited group, so overlapping rows of the
 * same line read as a single band instead of a seam.
 */
const GEMARA_HOVER_FILL = '#e7b762';

const GEMARA_SELECTED_FILL = '#d99b2b';
// A search hit is washed in light yellow and edged in strong yellow.
const OCR_MATCH_FILL = '#fde68a';
const OCR_MATCH_EDGE = '#f0b100';

type DafTextPage = { key: string; items: PdfTextLayerItem[]; width: number; height: number };
type DafBubblePage = { key: string; width: number; height: number; bubbles: Bubble[] };
type OcrResult = {
  daf: number;
  amud: 'a' | 'b';
  snippet: string;
};

/** Where a search hit lives on the page: the query is re-read from that page's text. */
type MatchTarget = { daf: number; amud: 'a' | 'b'; query: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

/** Marks the words of a search hit inside the OCR snippet it was found in. */
function markSnippet(snippet: string, term: string): string {
  const escaped = escapeHtml(snippet);
  const clean = term.trim();
  if (clean.length < 2) return escaped;
  const safe = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(safe, 'g'), match => `<mark class="rounded bg-primary/20 px-0.5 text-inherit">${match}</mark>`);
}

function normalizeHtmlMatch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[ךםןףץ]/g, (letter) => ({ "ך":"כ", "ם":"מ", "ן":"נ", "ף":"פ", "ץ":"צ" } as Record<string, string>)[letter] || letter)
    .replace(/[^\u05D0-\u05EA]/g, "");
}

export const TzuratHaDafView: React.FC<TzuratHaDafViewProps> = ({
  bookTitle,
  bookId,
  initialDaf = 'דף ב ע״א',
  settings,
  onCloseTab,
  onOpenBookAtLine,
  onDafChange
}) => {
  const { settings: appSettings } = useApp();
  const readerSettings = { ...appSettings, ...(settings?.theme ? { theme: settings.theme } : {}) };
  const isDarkTheme = readerSettings.theme === 'dark';
  const textOpts = useMemo<TextOpts>(() => {
    const nikud = readerSettings.nikudPolicy === 'none'
      ? false
      : readerSettings.nikudPolicy === 'tanakh_only'
        ? false
        : readerSettings.showNikud;
    return {
      nikud,
      teamim: readerSettings.showTeamim && nikud,
      punctuation: readerSettings.showPunctuation,
      holyName: readerSettings.holyNameReplacement,
    };
  }, [
    readerSettings.nikudPolicy,
    readerSettings.showNikud,
    readerSettings.showTeamim,
    readerSettings.showPunctuation,
    readerSettings.holyNameReplacement,
  ]);
  const effectiveBookId = bookId ?? FALLBACK_BAVLI_BOOK_IDS[findShasTractate(bookTitle)?.name || bookTitle] ?? null;

  const tractateMatch = findShasTractate(bookTitle);
  const isShasBook = tractateMatch !== null;
  const tractateHebrew = tractateMatch ? tractateMatch.name : bookTitle;
  const reqId = tractateMatch ? tractateMatch.req : 21111;
  const startDaf = tractateMatch ? tractateMatch.startDaf : 2;
  const maxDappim = tractateMatch?.totalDappim ? tractateMatch.totalDappim : 180;

  // Start on the daf that was asked for, so opening the tab costs one page and not two.
  const initialPage = parseDafString(initialDaf, startDaf, maxDappim);
  const [dafNum, setDafNum] = useState<number>(initialPage.dafNum);
  const [amud, setAmud] = useState<'a' | 'b'>(initialPage.amud);
  const [htmlBracketMode, setHtmlBracketMode] = useState<'swap' | 'keep'>('swap');
  const [htmlWordRecognition, setHtmlWordRecognition] = useState<'tight' | 'balanced' | 'wide'>('balanced');
  const [pageSource, setPageSource] = useState<'local' | 'shas' | 'hebrewbooks'>('local');
  const [htmlFrameEpoch, setHtmlFrameEpoch] = useState(0);
  const activePageSource = pageSource;
  const pageContentKey = `${tractateHebrew}:${dafNum}:${amud}:${activePageSource}`;

  const [pdfTextPage, setPdfTextPage] = useState<DafTextPage | null>(null);
  const [gemaraPage, setGemaraPage] = useState<{ key: string; lines: Segment[] } | null>(null);
  const [bubblePage, setBubblePage] = useState<DafBubblePage | null>(null);
  // Why this daf has no bubbles: the PDF carries no selectable text, or its text
  // could not be matched to the Gemara of this daf.
  const [bubbleIssue, setBubbleIssue] = useState<'no-text' | 'no-match' | null>(null);
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [hoveredBubbleId, setHoveredBubbleId] = useState<string | null>(null);
  const [htmlView, setHtmlView] = useState(false);
  const [htmlFrameStatus, setHtmlFrameStatus] = useState<{ message: string; error: boolean } | null>(null);
  const htmlFrameRef = React.useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tzurat-hadaf/html-source-config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('לא ניתן לקרוא את הגדרות צורת הדף');
        return await response.json() as {
          htmlBracketMode?: 'swap' | 'keep';
          htmlWordRecognition?: 'tight' | 'balanced' | 'wide';
        };
      })
      .then((config) => {
        if (cancelled) return;
        setHtmlBracketMode(config.htmlBracketMode === 'keep' ? 'keep' : 'swap');
        setHtmlWordRecognition(
          config.htmlWordRecognition === 'tight' || config.htmlWordRecognition === 'wide'
            ? config.htmlWordRecognition
            : 'balanced',
        );
        try {
          const saved = window.localStorage.getItem('tzurat-hadaf-html-source');
          if (saved === 'shas' || saved === 'hebrewbooks') setPageSource(saved);
        } catch { /* local storage is optional */ }
      })
      .catch(() => {
        if (!cancelled) {
          setPageSource('local');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const changePageSource = (value: 'local' | 'shas' | 'hebrewbooks') => {
    setPageSource(value);
    try { window.localStorage.setItem('tzurat-hadaf-html-source', value); } catch { /* optional preference */ }
  };

  // Viewer controls
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [fitMode, setFitMode] = useState<'width' | 'height'>('width');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showFullscreenNav, setShowFullscreenNav] = useState<boolean>(false);
  // `window.setTimeout` returns a number; the Node typings would say otherwise.
  const fullscreenNavHideTimer = React.useRef<number | null>(null);
  const [pdfInvert, setPdfInvert] = useState<boolean>(isDarkTheme);

  // The commentary sidebar can be closed, exactly like in the ordinary reader.
  const [commentaryOpen, setCommentaryOpen] = useState<boolean>(readerSettings.commentaryOpenByDefault !== false);

  // Search of the scanned page (its text layer is the OCR of the print)
  const [sidebarTab, setSidebarTab] = useState<'commentary' | 'search'>('commentary');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OcrResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ page: number; total: number } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeResult, setActiveResult] = useState(-1);
  const [matchTarget, setMatchTarget] = useState<MatchTarget | null>(null);
  const searchTokenRef = React.useRef(0);
  // The OCR of a tractate is the same for every search on it, so it is fetched once.
  const ocrIndexRef = React.useRef<Map<string, OcrPage[]>>(new Map());

  const clearFullscreenNavHideTimer = useCallback(() => {
    if (fullscreenNavHideTimer.current !== null) {
      window.clearTimeout(fullscreenNavHideTimer.current);
      fullscreenNavHideTimer.current = null;
    }
  }, []);

  const revealFullscreenNav = useCallback(() => {
    clearFullscreenNavHideTimer();
    setShowFullscreenNav(true);
  }, [clearFullscreenNavHideTimer]);

  const toggleFullscreen = useCallback(() => {
    // Enter browser fullscreen for the whole website, not just the Tzurat HaDaf panel.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch((error) => {
        console.warn('[Tzurat HaDaf] Could not exit browser fullscreen:', error);
        setIsFullscreen(false);
      });
      return;
    }

    // If the browser rejected fullscreen previously, this exits the CSS fallback.
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }

    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      // Call from the click handler so the browser's user-gesture requirement is met.
      void document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((error) => {
          console.warn('[Tzurat HaDaf] Browser fullscreen was denied; using viewport fullscreen:', error);
          setIsFullscreen(true);
        });
    } else {
      // Keep the existing viewport-filling mode in browsers without Fullscreen API support.
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleEscapeForCssFallback = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleEscapeForCssFallback);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleEscapeForCssFallback);
    };
  }, [isFullscreen]);

  const scheduleFullscreenNavHide = useCallback(() => {
    clearFullscreenNavHideTimer();
    fullscreenNavHideTimer.current = window.setTimeout(() => {
      setShowFullscreenNav(false);
      fullscreenNavHideTimer.current = null;
    }, 900);
  }, [clearFullscreenNavHideTimer]);

  useEffect(() => {
    if (!isFullscreen) {
      clearFullscreenNavHideTimer();
      setShowFullscreenNav(false);
      return;
    }

    // Keep the toolbar available when fullscreen first opens; it slides away
    // after the pointer leaves the top area, leaving the daf and commentaries
    // the whole viewport.
    setShowFullscreenNav(true);
    return clearFullscreenNavHideTimer;
  }, [isFullscreen, clearFullscreenNavHideTimer]);

  useEffect(() => () => clearFullscreenNavHideTimer(), [clearFullscreenNavHideTimer]);

  // Sync initial daf on load or prop change
  useEffect(() => {
    if (initialDaf) {
      const parsed = parseDafString(initialDaf, startDaf, maxDappim);
      setDafNum(parsed.dafNum);
      setAmud(parsed.amud);
    }
  }, [initialDaf, startDaf, maxDappim]);

  const currentDafLabel = `דף ${numberToHebrew(dafNum)} ע״${amud === 'a' ? 'א' : 'ב'}`;

  useEffect(() => {
    onDafChange?.(currentDafLabel);
  }, [currentDafLabel, onDafChange]);

  const handlePdfTextContent = useCallback((items: PdfTextLayerItem[], width: number, height: number) => {
    setPdfTextPage({ key: pageContentKey, items, width, height });
  }, [pageContentKey]);

  // The Gemara of this daf, from the same Otzaria book the reader opens.
  // Nothing else is loaded: this view only marks the Gemara.
  useEffect(() => {
    let cancelled = false;
    setGemaraPage(null);
    setBubblePage(null);
    setSelectedBubble(null);
    setHoveredBubbleId(null);
    if (!isShasBook) return () => { cancelled = true; };

    loadDafSegments(effectiveBookId, dafNum, amud)
      .catch(error => {
        console.warn('[Tzurat HaDaf bubbles] Gemara text is unavailable:', error);
        return [] as Segment[];
      })
      .then(lines => {
        if (cancelled) return;
        if (!lines.length) console.warn('[Tzurat HaDaf bubbles] no Gemara lines for', currentDafLabel, { bookId: effectiveBookId });
        setGemaraPage({ key: pageContentKey, lines });
      });
    return () => { cancelled = true; };
  }, [pageContentKey, isShasBook, effectiveBookId, dafNum, amud, currentDafLabel]);

  // A bubble exists only where a Gemara line is really printed on the page; a page
  // that cannot be matched stays empty instead of being covered in guesses.
  useEffect(() => {
    if (pdfTextPage?.key !== pageContentKey || gemaraPage?.key !== pageContentKey) return;
    setBubbleIssue(null);
    if (!pdfTextPage.items.length) {
      setBubbleIssue('no-text');
      console.warn('[Tzurat HaDaf bubbles] the PDF page has no selectable text layer', {
        daf: currentDafLabel,
        page: pdfTextPage.key,
      });
      setBubblePage({ key: pageContentKey, width: pdfTextPage.width, height: pdfTextPage.height, bubbles: [] });
      return;
    }
    try {
      const detected = detectDafBubbles(
        pdfTextPage.items,
        pdfTextPage.width,
        pdfTextPage.height,
        { gemara: gemaraPage.lines, rashi: [], tosafot: [] },
      );
      const gemaraBubbles = detected.bubbles.filter(bubble => bubble.layer === 'gemara');
      if (!gemaraBubbles.length) {
        setBubbleIssue('no-match');
        console.warn('[Tzurat HaDaf bubbles] nothing on this page could be matched', {
          daf: currentDafLabel,
          pdfTextItems: pdfTextPage.items.length,
          stats: detected.stats,
        });
      }
      setBubblePage({ key: pageContentKey, width: detected.pageWidth, height: detected.pageHeight, bubbles: gemaraBubbles });
    } catch (error) {
      console.warn('[Tzurat HaDaf bubbles] detection failed:', error);
      setBubblePage({ key: pageContentKey, width: pdfTextPage.width, height: pdfTextPage.height, bubbles: [] });
    }
  }, [pdfTextPage, gemaraPage, pageContentKey, currentDafLabel]);

  // Calculate page number in HebrewBooks volume matching Vilna page layout
  const offset = Math.max(0, dafNum - startDaf);
  const extraOffset = tractateMatch?.pageOffset || 0;
  const pageNum = Math.max(1, offset * 2 + (amud === 'a' ? 2 : 3) + extraOffset);

  // Next / Prev Daf Logic
  const handleNextDaf = () => {
    if (amud === 'a') {
      setAmud('b');
    } else {
      setDafNum(prev => Math.min(maxDappim, prev + 1));
      setAmud('a');
    }
  };

  const handlePrevDaf = () => {
    if (amud === 'b') {
      setAmud('a');
    } else if (dafNum > startDaf) {
      setDafNum(prev => Math.max(startDaf, prev - 1));
      setAmud('b');
    }
  };

  // The page is always served by this server's local archive; there is no live source.
  // The server cuts the requested daf out of the tractate, so a reader downloads one
  // page instead of the whole volume.
  const encodedTractate = encodeURIComponent(tractateHebrew);
  const localDafPdfUrl = `/api/tzurat-hadaf/page?masechta=${encodedTractate}&daf=${dafNum}&amud=${amud}`;
  const selectedDafPdfUrl = activePageSource === 'local'
    ? localDafPdfUrl
    : `/api/tzurat-hadaf/html-pdf?source=${activePageSource}&masechta=${encodedTractate}&daf=${dafNum}&amud=${amud}`;
  // The image fallback is only safe when it comes from the same local PDF source.
  const localDafImageUrl = activePageSource === 'local'
    ? `/api/tzurat-hadaf/page-image?masechta=${encodedTractate}&daf=${dafNum}&amud=${amud}`
    : undefined;
  const embedViewerUrl = isShasBook ? selectedDafPdfUrl : `https://hebrewbooks.org/pdfpager.aspx?req=${reqId}&stype=1&pg=${pageNum}`;
  const readerPageUrl = `https://hebrewbooks.org/reader/page.aspx?req=${reqId}&pg=${pageNum}`;
  const pdfFilename = `מסכת ${tractateHebrew} - ${currentDafLabel}.pdf`;
  const downloadPdfUrl = `/api/pdf/download?url=${encodeURIComponent(embedViewerUrl)}&filename=${encodeURIComponent(pdfFilename)}`;
  const hebrewBooksSearchUrl = `https://hebrewbooks.org/search?q=${encodeURIComponent(bookTitle)}`;

  const bubbles = useMemo(
    () => (bubblePage?.key === pageContentKey ? bubblePage.bubbles : []),
    [bubblePage, pageContentKey],
  );
  const selectedId = selectedBubble?.id ?? null;
  // Clicking the marked line again clears it, so a hover is all that is left to show.
  const hoveredId = hoveredBubbleId && hoveredBubbleId !== selectedId ? hoveredBubbleId : null;

  // One composited group per state: overlapping Gemara lines share a single shade.
  const bubbleOverlay = useMemo(() => {
    if (!bubblePage || bubblePage.key !== pageContentKey || !bubbles.length) return null;
    const { width, height } = bubblePage;
    const rectsOf = (id: string) =>
      bubbles
        .filter(bubble => bubble.id === id)
        .flatMap(bubble => bubble.rects.map((rect, index) => (
          <rect key={`${id}-${index}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2} ry={2} />
        )));
    return (
      <div className="pointer-events-none absolute inset-0">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {selectedId && <g fill={GEMARA_SELECTED_FILL} opacity="0.42">{rectsOf(selectedId)}</g>}
          {hoveredId && <g fill={GEMARA_HOVER_FILL} opacity="0.26">{rectsOf(hoveredId)}</g>}
        </svg>

        {/* Invisible hit areas: the page stays usable without a single visible outline. */}
        <div className="pointer-events-auto absolute inset-0">
          {bubbles.flatMap(bubble => bubble.rects.map((rect, index) => (
            <button
              key={`hit-${bubble.id}-${index}`}
              type="button"
              title={bubble.preview}
              aria-label={`גמרא: ${bubble.preview}`}
              onMouseEnter={() => setHoveredBubbleId(bubble.id)}
              onMouseLeave={() => setHoveredBubbleId(current => current === bubble.id ? null : current)}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                selectBubble(bubble);
              }}
              className="pointer-events-auto absolute m-0 block cursor-pointer touch-manipulation rounded-[3px] border-0 bg-transparent p-0 shadow-none outline-none"
              style={{
                left: `${(rect.x / width) * 100}%`,
                top: `${(rect.y / height) * 100}%`,
                width: `${(rect.w / width) * 100}%`,
                height: `${(rect.h / height) * 100}%`,
              }}
            />
          )))}
        </div>
      </div>
    );
  }, [bubblePage, pageContentKey, bubbles, selectedId, hoveredId]);

  // The words a search hit was found in, marked on the scanned page itself: a light
  // yellow wash with a strong yellow edge, so it stands out from the Gemara highlight.
  const matchHighlight = useMemo(() => {
    if (!matchTarget || !pdfTextPage) return null;
    if (matchTarget.daf !== dafNum || matchTarget.amud !== amud) return null;
    if (pdfTextPage.key !== pageContentKey) return null;
    const rects = findOcrMatches(pdfTextPage.items, matchTarget.query).flatMap(match => match.rects);
    if (!rects.length) return null;
    return { width: pdfTextPage.width, height: pdfTextPage.height, rects };
  }, [matchTarget, pdfTextPage, pageContentKey, dafNum, amud]);

  const matchOverlay = useMemo(() => {
    if (!matchHighlight) return null;
    const { width, height, rects } = matchHighlight;
    return (
      <div className="pointer-events-none absolute inset-0">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill={OCR_MATCH_FILL} opacity="0.55">
            {rects.map((rect, index) => (
              <rect key={`ocr-${index}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2} ry={2} />
            ))}
          </g>
          <g fill="none" stroke={OCR_MATCH_EDGE} strokeWidth={1.8} opacity="0.95">
            {rects.map((rect, index) => (
              <rect key={`ocr-edge-${index}`} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2} ry={2} />
            ))}
          </g>
        </svg>
      </div>
    );
  }, [matchHighlight]);

  const goToResult = useCallback((index: number) => {
    const hit = results?.[index];
    if (!hit) return;
    setActiveResult(index);
    setDafNum(hit.daf);
    setAmud(hit.amud);
    // The marks themselves are drawn when that daf's own text layer arrives.
    setMatchTarget({ daf: hit.daf, amud: hit.amud, query: query.trim() });
  }, [results, query]);

  const stepResult = useCallback((delta: number) => {
    if (!results?.length) return;
    const next = (activeResult + delta + results.length) % results.length;
    goToResult(next);
  }, [results, activeResult, goToResult]);

  // Search the OCR of the whole tractate. The index is built once by the server and
  // kept there, so the reader never downloads the volume to look inside it.
  const runSearch = useCallback(async () => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearchError(term.length === 1 ? 'יש להקליד לפחות שתי אותיות' : '');
      return;
    }
    const token = ++searchTokenRef.current;
    setSearching(true);
    setSearchError('');
    setResults(null);
    setActiveResult(-1);
    setMatchTarget(null);
    setIndexing(false);
    setSearchProgress(null);
    try {
      let pages: OcrPage[] | null = ocrIndexRef.current.get(tractateHebrew) ?? null;
      for (;;) {
        if (pages) break;
        const response = await fetch(`/api/tzurat-hadaf/ocr-index?masechta=${encodeURIComponent(tractateHebrew)}`);
        if (token !== searchTokenRef.current) return;
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || `שגיאת שרת (${response.status})`);
        }
        const data = await response.json();
        if (token !== searchTokenRef.current) return;
        if (data.ready) {
          pages = data.pages as OcrPage[];
          ocrIndexRef.current.set(tractateHebrew, pages);
          break;
        }
        // The server is reading the scans for the first time: show how far it got.
        setIndexing(true);
        setSearchProgress({ page: Number(data.page) || 0, total: Number(data.total) || 0 });
        await new Promise(resolve => window.setTimeout(resolve, 400));
      }
      if (!pages || token !== searchTokenRef.current) return;
      setIndexing(false);
      setSearchProgress(null);

      const found: OcrResult[] = [];
      for (const page of pages) {
        for (const hit of findInText(page.text, term, 4)) {
          found.push({ daf: page.daf, amud: page.amud, snippet: hit.snippet });
          if (found.length >= 200) break;
        }
        if (found.length >= 200) break;
      }
      setResults(found);
    } catch (error: any) {
      if (token === searchTokenRef.current) setSearchError(error?.message || 'החיפוש נכשל');
    } finally {
      if (token === searchTokenRef.current) {
        setSearching(false);
        setIndexing(false);
        setSearchProgress(null);
      }
    }
  }, [query, tractateHebrew]);

  const openSearch = () => {
    setSidebarTab('search');
    setCommentaryOpen(true);
    window.setTimeout(() => document.getElementById('tzurat-search-input')?.focus(), 60);
  };

  // Choosing a line on the page always reveals the panel that explains it, even when
  // the reader had put it away.
  const selectBubble = (bubble: Bubble | null) => {
    setSelectedBubble(bubble);
    if (bubble) {
      setCommentaryOpen(true);
      if (htmlView && bubblePage?.key === pageContentKey && bubble.rects.length) {
        const rect = bubble.rects[0];
        htmlFrameRef.current?.contentWindow?.postMessage({
          source: 'otzaria-tzurat-hadaf',
          type: 'highlight-word',
          text: bubble.preview,
          xNorm: (rect.x + rect.w / 2) / bubblePage.width,
          yNorm: (rect.y + rect.h / 2) / bubblePage.height,
        }, '*');
      }
    }
  };

  // The HTML view sends word coordinates. Match them to the existing Gemara
  // bubbles and select the same line used by the PDF commentary panel.
  useEffect(() => {
    const frameWindow = htmlFrameRef.current?.contentWindow;
    if (!frameWindow) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameWindow) return;
      const data = event.data;
      if (!data || data.source !== 'vilna-html') return;
      if (data.type === 'html-status') {
        setHtmlFrameStatus({ message: String(data.message || ''), error: Boolean(data.error) });
        return;
      }
      if (data.type === 'select-bubble') {
        const page = bubblePage;
        if (!page || page.key !== pageContentKey) return;
        const bubble = page.bubbles.find((item) => item.id === String(data.bubbleId));
        if (bubble) selectBubble(bubble);
        return;
      }
      if (data.type === 'hover-bubble') {
        setHoveredBubbleId(data.bubbleId ? String(data.bubbleId) : null);
        return;
      }
      if (data.type !== 'select-word') return;
      if (data.tractate !== tractateHebrew || Number(data.daf) !== dafNum || data.amud !== amud) return;
      if (data.layer !== 'gemara') return;
      const page = bubblePage;
      if (!page || page.key !== pageContentKey || !page.bubbles.length) return;

      const nx = Number(data.xNorm);
      const ny = Number(data.yNorm);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
      const word = normalizeHtmlMatch(data.text);
      const line = normalizeHtmlMatch(data.lineText);
      let best: Bubble | null = null;
      let bestRect: Bubble['rects'][number] | null = null;
      let bestScore = Infinity;
      for (const bubble of page.bubbles) {
        if (bubble.layer !== 'gemara' || bubble.lineIndex === null) continue;
        const bubbleText = normalizeHtmlMatch(bubble.text);
        const preview = normalizeHtmlMatch(bubble.preview);
        const lexicalMatch = Boolean(word && (bubbleText.includes(word) || preview.includes(word)));
        const lineMatch = Boolean(line.length >= 5 && (bubbleText.includes(line) || line.includes(bubbleText)));
        let distance = Infinity;
        let nearest: Bubble['rects'][number] | null = null;
        for (const rect of bubble.rects) {
          const rx = (rect.x + rect.w / 2) / page.width;
          const ry = (rect.y + rect.h / 2) / page.height;
          const d = Math.hypot((rx - nx) * 1.5, ry - ny);
          if (d < distance) { distance = d; nearest = rect; }
        }
        if (!nearest) continue;
        const score = distance + (lexicalMatch ? -0.08 : 0.08) + (lineMatch ? -0.12 : 0);
        if (score < bestScore) { best = bubble; bestRect = nearest; bestScore = score; }
      }
      if (!best || !bestRect || bestScore > 0.3) return;
      selectBubble(best);
      htmlFrameRef.current?.contentWindow?.postMessage({
        source: 'otzaria-tzurat-hadaf',
        type: 'highlight-word',
        text: data.text,
        xNorm: (bestRect.x + bestRect.w / 2) / page.width,
        yNorm: (bestRect.y + bestRect.h / 2) / page.height,
      }, '*');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [tractateHebrew, dafNum, amud, bubblePage, pageContentKey, htmlView, selectBubble]);

  // The HTML iframe is independent from the PDF canvas, so relay zoom changes explicitly.
  useEffect(() => {
    if (!htmlView || htmlFrameEpoch === 0) return;
    htmlFrameRef.current?.contentWindow?.postMessage({
      source: 'otzaria-tzurat-hadaf',
      type: 'set-zoom',
      zoomLevel,
    }, '*');
  }, [htmlView, htmlFrameEpoch, zoomLevel]);

  // Give the HTML renderer the very same bubble rectangles extracted from the selected
  // PDF. The iframe draws transparent hit areas over those rectangles and reports clicks
  // back to this component, which continues using the existing CommentaryPanel.
  useEffect(() => {
    if (!htmlView || htmlFrameEpoch === 0) return;
    const target = htmlFrameRef.current?.contentWindow;
    if (!target) return;
    const page = bubblePage?.key === pageContentKey ? bubblePage : null;
    target.postMessage({
      source: 'otzaria-tzurat-hadaf',
      type: 'set-bubbles',
      tractate: tractateHebrew,
      daf: dafNum,
      amud,
      bubbles: page?.bubbles.filter((bubble) => bubble.layer === 'gemara').map((bubble) => ({
        id: bubble.id,
        preview: bubble.preview,
        rects: bubble.rects,
      })) || [],
      selectedId: selectedBubble?.id || null,
      hoveredId: hoveredBubbleId,
    }, '*');
  }, [htmlView, htmlFrameEpoch, bubblePage, pageContentKey, tractateHebrew, dafNum, amud, selectedBubble, hoveredBubbleId]);

  const tabButton = (key: 'commentary' | 'search', label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setSidebarTab(key)}
      className={`relative flex-1 py-2.5 text-sm font-medium ${sidebarTab === key ? 'text-primary' : 'text-on-variant hover:bg-surface-3'}`}
    >
      {label}
      {sidebarTab === key && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full bg-primary" />}
    </button>
  );

  return (
    <div
      onMouseMove={(event) => {
        if (!isFullscreen) return;
        if (event.clientY <= 32) {
          revealFullscreenNav();
        } else if (event.clientY > 120 && showFullscreenNav && fullscreenNavHideTimer.current === null) {
          scheduleFullscreenNavHide();
        }
      }}
      className={`${isFullscreen ? 'fixed inset-0 z-[10000] h-[100dvh] w-screen' : 'relative h-full w-full'} flex flex-col overflow-hidden select-none transition-colors bg-surface text-on-surface`}
    >
      {/* In fullscreen this toolbar floats above the page and hides when the pointer leaves it. */}
      <div
        onMouseEnter={() => { if (isFullscreen) revealFullscreenNav(); }}
        onMouseLeave={() => { if (isFullscreen) scheduleFullscreenNavHide(); }}
        className={`border-b border-outline-variant bg-surface px-2 py-1.5 flex items-center gap-1 shrink-0 transition-all duration-200 ease-out ${isFullscreen
          ? `absolute inset-x-0 top-0 z-[10001] ${showFullscreenNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`
          : 'relative z-20'}`}
      >
        {/* Title & Daf, as in the ordinary reader toolbar */}
        <div className="min-w-0 flex-1 px-2" style={{ height: 36 }}>
          <div className="truncate text-[15px] font-medium leading-tight">
            {isShasBook ? `מסכת ${tractateHebrew}` : bookTitle}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs leading-tight text-on-variant" style={{ minHeight: 16 }}>
            <span>{isShasBook ? currentDafLabel : 'צורת הדף'}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-on-variant">בועות צפות · ניסיוני</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto">
          {onOpenBookAtLine && (
            <button
              onClick={() => onOpenBookAtLine(bookId || bookTitle, bookTitle, undefined, currentDafLabel)}
              className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3"
              title="פתח ספר טקסט בלשונית קריאה"
            >
              <FileText className="h-5 w-5" />
            </button>
          )}

          {isShasBook && (
            <>
              {/* Daf Navigation & Select */}
              <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
                <button
                  onClick={handlePrevDaf}
                  className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
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
                  className="bg-transparent px-2 py-1 text-xs font-medium text-on-surface outline-none cursor-pointer text-center"
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
                  className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
                  title="דף הבא"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Search the page itself */}
              <button
                onClick={() => (sidebarTab === 'search' ? setSidebarTab('commentary') : openSearch())}
                className={`rounded-lg p-2 cursor-pointer transition-colors ${
                  sidebarTab === 'search'
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-variant hover:bg-surface-3'
                }`}
                title="חיפוש בצורת הדף (OCR)"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setHtmlFrameStatus({ message: 'טוען את תצוגת HTML…', error: false });
                  setHtmlView((value) => !value);
                }}
                aria-pressed={htmlView}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${htmlView
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-variant hover:bg-surface-3'}`}
                title={htmlView ? 'חזור לתצוגת PDF' : 'הצג תצוגת HTML ניסיונית'}
              >
                {htmlView ? <FileText className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
                <span>HTML</span>
                <span className="text-[10px] font-medium">ניסיוני</span>
              </button>

              {htmlView && (
                <label className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-xs text-on-variant">
                  <span>מקור ניסיוני</span>
                  <select
                    value={activePageSource}
                    onChange={(event) => changePageSource(event.target.value as 'local' | 'shas' | 'hebrewbooks')}
                    aria-label="מקור PDF ל־HTML ולבועות"
                    className="max-w-[150px] rounded-md border border-outline-variant bg-surface px-1.5 py-1 text-xs text-on-surface"
                  >
                    <option value="local">הקובץ המקומי</option>
                    <option value="shas">SHAS.org</option>
                    <option value="hebrewbooks">HebrewBooks לפי סדר הדפים</option>
                  </select>
                </label>
              )}

              {/* Show / hide the commentary sidebar, as in the ordinary reader */}
              <button
                onClick={() => setCommentaryOpen(open => !open)}
                aria-pressed={commentaryOpen}
                className={`rounded-lg p-2 cursor-pointer transition-colors ${
                  commentaryOpen
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-variant hover:bg-surface-3'
                }`}
                title={commentaryOpen ? 'הסתר מפרשים' : 'הצג מפרשים'}
              >
                <MessageSquareText className="w-4 h-4" />
              </button>

              {/* Invert Dark Mode */}
              <button
                onClick={() => setPdfInvert(!pdfInvert)}
                className={`rounded-lg p-2 cursor-pointer transition-colors ${
                  pdfInvert
                    ? 'bg-stone-800 text-amber-300 border-amber-700'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
                title={pdfInvert ? 'מצב תצוגה רגיל' : 'מצב לילה (ניגודיות הפוכה)'}
              >
                {pdfInvert ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Rotation */}
              <button
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
                title="סובב דף 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Fit to width / fit to height */}
              <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => { setFitMode('width'); setZoomLevel(100); }}
                  aria-pressed={fitMode === 'width'}
                  className={`rounded-lg p-2 cursor-pointer transition-colors ${
                    fitMode === 'width'
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-variant hover:bg-surface-3'
                  }`}
                  title="התאם לרוחב"
                >
                  <MoveHorizontal className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setFitMode('height'); setZoomLevel(100); }}
                  aria-pressed={fitMode === 'height'}
                  className={`rounded-lg p-2 cursor-pointer transition-colors ${
                    fitMode === 'height'
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-variant hover:bg-surface-3'
                  }`}
                  title="התאם לגובה"
                >
                  <MoveVertical className="w-4 h-4" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
                <button
                  onClick={() => setZoomLevel(z => Math.min(300, z + 15))}
                  className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
                  title="הגדל"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <span className="px-1.5 text-xs tabular-nums text-on-variant">
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel(z => Math.max(50, z - 15))}
                  className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
                  title="הקטן"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="rounded-lg p-2 text-on-variant transition hover:bg-surface-3 cursor-pointer"
                title={isFullscreen ? 'צא ממסך מלא' : 'מסך מלא'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </>
          )}

          {onCloseTab && (
            <button
              onClick={onCloseTab}
              className="rounded-lg p-2 text-on-variant cursor-pointer transition-colors hover:bg-error/10 hover:text-error"
              title="סגור כרטיסייה"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Viewport */}
      <div className={`relative flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-start w-full ${
        isFullscreen ? 'p-0 bg-surface' : 'bg-surface-1'
      }`}>
        {isShasBook ? (
          <div dir="rtl" className={`w-full flex-1 min-h-0 grid grid-cols-1 overflow-hidden ${!commentaryOpen ? '' : isFullscreen ? 'md:grid-cols-[minmax(0,1fr)_minmax(320px,30vw)]' : 'md:grid-cols-[minmax(0,1fr)_280px]'}`}>
            <div className="min-w-0 min-h-0 flex flex-col">
              <div className={`relative w-full flex-1 min-h-0 overflow-hidden`}>
                {htmlView ? (
                  <>
                    {/* Load the exact same selected PDF invisibly so the bubble detector
                        and the HTML renderer both process the same source file. */}
                    <div className="absolute -left-[10000px] top-0 h-[1000px] w-[820px] overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
                      <SimplePdfViewer
                        key={`html-bubble-source-${activePageSource}-${tractateHebrew}-${dafNum}-${amud}`}
                        url={selectedDafPdfUrl}
                        fallbackImageUrl={localDafImageUrl}
                        pageNumber={1}
                        onPageTextContent={handlePdfTextContent}
                        fitMode="width"
                        zoomLevel={100}
                        pdfInvert={false}
                        isDarkTheme={false}
                        title={`מקור בועות ניסיוני — ${tractateHebrew} ${currentDafLabel}`}
                      />
                    </div>
                    <iframe
                      key={`vilna-html-${activePageSource}-${tractateHebrew}-${dafNum}-${amud}-${htmlBracketMode}-${htmlWordRecognition}`}
                      ref={htmlFrameRef}
                      title={`HTML ניסיוני של מסכת ${tractateHebrew} ${currentDafLabel}`}
                      src={`${import.meta.env.BASE_URL}vilna-html/index.html?embed=1&v=20261105-html-reader4&source=${activePageSource}&masechta=${encodeURIComponent(tractateHebrew)}&daf=${dafNum}&amud=${amud}&brackets=${htmlBracketMode}&wordRecognition=${htmlWordRecognition}`}
                      className="h-full w-full flex-1 border-0 bg-white"
                      loading="eager"
                      onLoad={() => {
                        setHtmlFrameEpoch((value) => value + 1);
                        setHtmlFrameStatus({ message: "הדף נטען; מנתח את הגופן והטקסט…", error: false });
                      }}
                      onError={() => setHtmlFrameStatus({ message: "לא ניתן לטעון את קובץ תצוגת ה־HTML. בדוק שהקובץ זמין בשרת.", error: true })}
                      allow="clipboard-read; clipboard-write"
                    />
                    {htmlFrameStatus?.error && (
                      <div role="alert" className="absolute inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-xl border border-error/40 bg-surface px-3 py-2 text-sm text-error shadow-lg">
                        <span>{htmlFrameStatus.message}</span>
                        <button type="button" onClick={() => setHtmlView(false)} className="shrink-0 rounded-lg px-2 py-1 font-medium hover:bg-surface-2">חזור ל־PDF</button>
                      </div>
                    )}
                  </>
                ) : (
                  <SimplePdfViewer
                    key={`daf-${activePageSource}-${tractateHebrew}-${dafNum}-${amud}`}
                    url={selectedDafPdfUrl}
                    fallbackImageUrl={localDafImageUrl}
                    pageNumber={1}
                    overlay={<>{bubbleOverlay}{matchOverlay}</>}
                    onPageTextContent={handlePdfTextContent}
                    fitMode={fitMode}
                    zoomLevel={zoomLevel}
                    rotation={rotation}
                    pdfInvert={pdfInvert}
                    isDarkTheme={isDarkTheme}
                    title={`צורת הדף ניסיונית — ${tractateHebrew} ${currentDafLabel}`}
                  />
                )}
              </div>

              {/* Bottom Footer Details & External Links */}
              {!htmlView && <div className={`${isFullscreen ? 'hidden' : 'mt-1.5 flex'} flex-wrap items-center justify-between w-full text-xs text-on-variant px-3 py-1.5 bg-surface-1 rounded-lg border border-outline-variant gap-2`}>
                <span className="font-medium text-on-surface">צורת הדף</span>

                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={readerPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    פתח בקורא HebrewBooks
                  </a>

                  <span className="text-outline-variant">|</span>

                  <a
                    href={downloadPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    הורד קובץ PDF
                  </a>
                </div>
              </div>}
            </div>

            <aside
              aria-label="מפרשים וחיפוש"
              className={`min-h-0 flex-col border-r border-outline-variant bg-surface text-on-surface ${!commentaryOpen
                ? 'hidden'
                : selectedBubble || sidebarTab === 'search'
                  ? isFullscreen
                    ? 'flex relative z-30'
                    : 'flex fixed inset-x-2 bottom-2 top-[38%] z-30 rounded-xl shadow-2xl md:static md:rounded-none md:shadow-none'
                  : 'hidden md:flex'}`}
            >
              <div className="flex shrink-0 border-b border-outline-variant">
                {tabButton('commentary', 'מפרשים')}
                {tabButton('search', 'חיפוש')}
              </div>

              {sidebarTab === 'search' ? (
                <>
                  <form
                    className="p-2"
                    onSubmit={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      void runSearch();
                    }}
                  >
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
                      <input
                        id="tzurat-search-input"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="חיפוש בצורת הדף (Enter)"
                        className="h-9 w-full rounded-full border border-outline-variant bg-surface pr-9 pl-8 text-sm outline-none focus:border-primary"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => { setQuery(''); setResults(null); setSearchError(''); setMatchTarget(null); setActiveResult(-1); }}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-variant"
                          title="נקה"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </form>

                  {searching && (
                    <div className="px-3 pb-2 text-xs text-on-variant">
                      {indexing && searchProgress?.total
                        ? `מכין מפתח חיפוש מהסריקה… ${searchProgress.page}/${searchProgress.total}`
                        : 'מחפש…'}
                    </div>
                  )}
                  {searchError && <div className="px-3 pb-2 text-sm text-error">{searchError}</div>}
                  {results && results.length > 0 && !searching && (
                    <div className="flex items-center gap-1 border-b border-outline-variant px-2 pb-2 text-xs text-on-variant">
                      <span className="flex-1">
                        {activeResult >= 0 ? `${activeResult + 1} / ${results.length}` : `${results.length} תוצאות`}
                      </span>
                      <button onClick={() => stepResult(-1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה קודמת">
                        <ChevronUp size={16} />
                      </button>
                      <button onClick={() => stepResult(1)} className="rounded-full p-1 hover:bg-surface-3" title="תוצאה הבאה">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1">
                    {!results && !searching && !searchError && (
                      <p className="px-2 py-3 text-xs leading-5 text-on-variant">
                        החיפוש עובר על הטקסט שזוהה מהסריקה (OCR) בכל דפי המסכת, ומדלג לדף שבו נמצא הביטוי.
                      </p>
                    )}
                    {results && !searching && results.length === 0 && (
                      <div className="px-2 py-4 text-center text-sm text-on-variant">לא נמצאו תוצאות בצורת הדף</div>
                    )}
                    {results?.map((hit, index) => (
                      <button
                        key={`${hit.daf}-${hit.amud}-${index}`}
                        onClick={() => goToResult(index)}
                        className={`mb-1 block w-full rounded-lg px-3 py-2 text-start hover:bg-surface-3 ${activeResult === index ? 'bg-sec-container text-on-sec-container' : ''}`}
                      >
                        <div className="text-xs font-medium text-primary">{dafLabel(hit.daf, hit.amud)}</div>
                        <div
                          className="line-clamp-3 text-[13px] leading-snug"
                          dangerouslySetInnerHTML={{ __html: markSnippet(hit.snippet, query) }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : selectedBubble && selectedBubble.lineIndex !== null ? (
                <CommentaryPanel
                  bookId={effectiveBookId!}
                  bookTitle={tractateHebrew}
                  line={selectedBubble.lineIndex}
                  heRef={currentDafLabel}
                  opts={textOpts}
                  context="tzurat-hadaf"
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col bg-surface">
                  <div className="shrink-0 border-b border-outline-variant px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">מפרשים</h3>
                      {selectedBubble && (
                        <button
                          type="button"
                          onClick={() => setSelectedBubble(null)}
                          className="rounded-full px-2 py-1 text-xs text-on-variant hover:bg-surface-3"
                        >
                          סגור
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-on-variant">
                      {selectedBubble?.text || 'בחר שורת גמרא כדי להציג את המפרשים המקושרים לאותה שורה באוצריא.'}
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                    {bubbles.map(bubble => (
                      <button
                        key={bubble.id}
                        type="button"
                        onMouseEnter={() => setHoveredBubbleId(bubble.id)}
                        onMouseLeave={() => setHoveredBubbleId(current => current === bubble.id ? null : current)}
                        onClick={() => selectBubble(bubble)}
                        className={`book-text block w-full border-r-2 border-outline-variant px-3 py-2 text-right transition-colors hover:border-primary hover:bg-surface-2 ${selectedId === bubble.id ? 'bg-surface-2' : 'bg-surface-1'}`}
                        style={{ borderRightColor: GEMARA_SELECTED_FILL }}
                      >
                        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-on-variant">
                          גמרא{bubble.segmentIndex ? ` · קטע ${bubble.segmentIndex}` : ''}
                        </span>
                        <span className="block text-sm leading-6 text-on-surface">{bubble.preview}</span>
                      </button>
                    ))}
                    {bubblePage?.key === pageContentKey && !bubbles.length && (
                      <p className="p-4 text-center text-sm text-on-variant">
                        {bubbleIssue === 'no-text'
                          ? 'לקובץ הזה אין שכבת טקסט, ולכן לא ניתן לזהות בו את שורות הגמרא.'
                          : 'לא נמצאו שורות גמרא תואמות בדף הזה.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </div>
        ) : (
          /* Non-Talmud Book Fallback Card */
          <div className={`max-w-3xl w-full p-8 rounded-3xl border shadow-xl flex flex-col items-center text-center gap-6 my-auto ${
            isDarkTheme ? 'bg-[#1C140F] border-stone-800 text-stone-100' : 'bg-white border-amber-200 text-stone-900'
          }`}>
            <div className="p-4 bg-amber-800/10 text-amber-800 dark:text-amber-300 rounded-3xl border border-amber-800/20">
              <BookMarked className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black font-serif text-amber-950 dark:text-amber-200">
                צורת הדף עבור: "{bookTitle}"
              </h3>
              <p className="text-sm font-serif text-stone-600 dark:text-stone-300 leading-relaxed max-w-xl mx-auto">
                צורת הדף המובנית מותאמת למסכתות הש"ס הבבלי. עבור הספר <strong className="text-amber-900 dark:text-amber-300">"{bookTitle}"</strong>, ניתן לעיין במהדורות המודפסות בספריית HebrewBooks:
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center pt-2">
              <a
                href={hebrewBooksSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-900 text-white font-serif font-bold px-6 py-3 rounded-2xl shadow-md transition-all w-full sm:w-auto cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>חפש מהדורת דפוס ב-HebrewBooks</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href="https://hebrewbooks.org/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-serif font-bold px-5 py-3 rounded-2xl transition-all w-full sm:w-auto cursor-pointer"
              >
                <span>ספריית HebrewBooks</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TzuratHaDafView;
