import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { getBookContent, getBookToc, getBookLinks, getBookCommentators, searchLibrary, searchInBook, BookLineData, InBookSearchMatch } from '../services/api';
import { TocNode, CommentaryLink, ReaderSettings, BookmarkItem } from '../types/otzaria';
import { stripNikud, numberToHebrew, hebrewToNumber } from '../utils/gematria';
import { sortCommentariesByGeneration } from '../utils/generationOrder';
import { getFontFamilyCss } from '../utils/fontHelper';
import {
  getWordRangeInLine,
  getSelectionWordRangeFromDOM,
  buildShareUrl,
  highlightWordRangeInHtml,
  WordRange
} from '../utils/textShareHelper';
import { buildHebrewSearchRegex, extractSearchSnippet, highlightSearchText } from '../utils/searchHelpers';
import { sanitizeBookHtml } from '../utils/sanitizeHtml';
import { sysLogger } from '../services/logger';
import { TzuratHaDafModal, findShasTractate, parseDafString } from './TzuratHaDafModal';
import {
  List,
  Search,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Bookmark,
  Share2,
  Copy,
  Layers,
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Settings,
  ChevronDown,
  ChevronUp,
  Filter,
  SlidersHorizontal,
  Loader2
} from 'lucide-react';

interface BookReaderProps {
  bookId: number | string;
  bookTitle: string;
  initialLine?: number;
  initialSearch?: string;
  initialHighlight?: string;
  initialWordRange?: { start: number; end: number };
  settings: ReaderSettings;
  onAddBookmark: (bookmark: Omit<BookmarkItem, 'id' | 'createdAt'>) => void;
  onOpenTzuratHaDaf?: (bookTitle: string, initialDaf?: string, bookId?: number | string) => void;
  onLineChange?: (lineIndex: number) => void;
  onBookTitleResolved?: (title: string) => void;
}

function flattenTocNodes(nodes: TocNode[]): TocNode[] {
  let result: TocNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length > 0) {
      result = result.concat(flattenTocNodes(node.children));
    }
  }
  return result;
}

function resolveActualBookLine(
  node: TocNode,
  allTocNodes: TocNode[],
  bookLines: BookLineData[],
  totalBookLines?: number
): number {
  const total = totalBookLines || 0;
  const rawIdx = node.index;

  // 1. If rawIdx already fits inside the book (1 <= rawIdx <= total), it's a valid local line index!
  if (total > 0 && rawIdx >= 1 && rawIdx <= total) {
    return rawIdx;
  }

  // 2. Try to find the exact heading line in bookLines by node.title
  if (node.title && bookLines && bookLines.length > 0) {
    const cleanTitle = stripNikud(node.title).replace(/[-"'\״\׳:;,.]/g, ' ').trim().toLowerCase();
    const headingMatch = bookLines.find(l => {
      if (!l.content) return false;
      const cleanContent = stripNikud(l.content).replace(/[-"'\״\׳:;,.]/g, ' ').trim().toLowerCase();
      return cleanContent === cleanTitle || cleanContent.includes(cleanTitle) || cleanTitle.includes(cleanContent);
    });
    if (headingMatch) {
      return headingMatch.lineIndex;
    }
  }

  // 3. If rawIdx is a large global line.id, estimate position proportionally from TOC position
  if (total > 0 && allTocNodes.length > 1) {
    const flat = flattenTocNodes(allTocNodes);
    const nodeIdx = flat.findIndex(n => n.index === rawIdx || n.title === node.title);
    if (nodeIdx >= 0) {
      const estimated = Math.round((nodeIdx / (flat.length - 1)) * (total - 1)) + 1;
      return Math.max(1, Math.min(total, estimated));
    }
  }

  // Fallback: clamp to valid book bounds
  if (total > 0 && rawIdx > total) {
    return Math.min(total, Math.max(1, rawIdx % total || 1));
  }

  return Math.max(1, rawIdx || 1);
}

/**
 * Resolves exact Talmud Daf & Amud for any line in a Talmud book.
 * Handles cases where initial TOC entries (e.g. Daf 2-4) might share the same line index
 * or where Daf 5 was erroneously matched for early pages.
 */
function resolveTalmudDafForLine(
  targetLineIndex: number,
  tocList: TocNode[],
  bookLines?: BookLineData[],
  allProcessedLines?: Array<{ index: number; rawText: string; isHeading: boolean; headingText: string }>
): { dafNum: number; amud: 'a' | 'b'; dafLabel: string } | null {
  if (!targetLineIndex || targetLineIndex < 1) return null;

  // 1. Check allProcessedLines backwards first (highest fidelity - actual text headings in book)
  if (allProcessedLines && allProcessedLines.length > 0) {
    for (let i = allProcessedLines.length - 1; i >= 0; i--) {
      const line = allProcessedLines[i];
      if (line.index > targetLineIndex) continue;

      const rawText = line.rawText || line.headingText || '';
      const text = rawText.replace(/<[^>]*>/g, ' ').replace(/[״׳"'\u05F3\u05F4]/g, '').trim();
      const looksLikeHeading = /^דף\s+[א-ת0-9]+(?:\s|[.:]|$)/u.test(text) || /^[א-ת]{1,4}[.:]/u.test(text);
      if (!line.isHeading && !looksLikeHeading) continue;
      const dotColonMatch = text.match(/^דף\s+([א-ת0-9]+)([\.:])/u);
      if (dotColonMatch) {
        const num = hebrewToNumber(dotColonMatch[1]);
        if (num >= 2) {
          const amud: 'a' | 'b' = dotColonMatch[2] === ':' ? 'b' : 'a';
          const dafLabel = `דף ${numberToHebrew(num)} ע״${amud === 'a' ? 'א' : 'ב'}`;
          return { dafNum: num, amud, dafLabel };
        }
      }

      const wordMatch = text.match(/^דף\s+([א-ת0-9]+)\s*(?:ע\s*([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב]))/u);
      if (wordMatch) {
        const num = /^\d+$/.test(wordMatch[1]) ? Number(wordMatch[1]) : hebrewToNumber(wordMatch[1]);
        if (num >= 2) {
          const amudPart = wordMatch[2] || wordMatch[3] || wordMatch[4] || 'א';
          const amud: 'a' | 'b' = (amudPart.includes('ב') || amudPart.includes('שני')) ? 'b' : 'a';
          const dafLabel = `דף ${numberToHebrew(num)} ע״${amud === 'a' ? 'א' : 'ב'}`;
          return { dafNum: num, amud, dafLabel };
        }
      }
    }
  }

  // 2. Scan raw book lines if provided
  if (bookLines && bookLines.length > 0) {
    for (let i = bookLines.length - 1; i >= 0; i--) {
      const l = bookLines[i];
      if (l.lineIndex > targetLineIndex) continue;
      const rawText = l.content || '';
      const text = rawText.replace(/<[^>]*>/g, ' ').replace(/[״׳"'\u05F3\u05F4]/g, '').trim();
      if (!/^דף\s+[א-ת0-9]+/u.test(text) && !/^[א-ת]{1,4}[.:]/u.test(text)) continue;
      const dotColonMatch = text.match(/^דף\s+([א-ת0-9]+)([\.:])/u);
      if (dotColonMatch) {
        const token = dotColonMatch[1];
        const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
        if (num >= 2) {
          const amud: 'a' | 'b' = dotColonMatch[2] === ':' ? 'b' : 'a';
          const dafLabel = `דף ${numberToHebrew(num)} ע״${amud === 'a' ? 'א' : 'ב'}`;
          return { dafNum: num, amud, dafLabel };
        }
      }

      const wordMatch = text.match(/^דף\s+([א-ת0-9]+)\s*(?:ע\s*([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב]))/u);
      if (wordMatch) {
        const token = wordMatch[1];
        const num = /^\d+$/.test(token) ? Number(token) : hebrewToNumber(token);
        if (num >= 2) {
          const amudPart = wordMatch[2] || wordMatch[3] || wordMatch[4] || 'א';
          const amud: 'a' | 'b' = amudPart.includes('ב') || amudPart.includes('שני') ? 'b' : 'a';
          const dafLabel = `דף ${numberToHebrew(num)} ע״${amud === 'a' ? 'א' : 'ב'}`;
          return { dafNum: num, amud, dafLabel };
        }
      }
    }
  }

  // 3. Check TOC with monotonic ordering & boundary protection
  if (tocList && tocList.length > 0) {
    const flatNodes = flattenTocNodes(tocList);
    const dafEntries: Array<{ node: TocNode; parsed: { dafNum: number; amud: 'a' | 'b' }; effectiveIndex: number }> = [];

    let runningIndex = 1;
    for (const node of flatNodes) {
      if (!node.title) continue;
      const isDaf = /דף\s+[א-ת0-9]+|^[א-ת]{1,3}[\.:]/i.test(node.title);
      if (isDaf) {
        const parsed = parseDafString(node.title, 2, 180);
        if (parsed.dafNum >= 2) {
          // Guarantee strictly increasing index so later dappim (like Daf 5) never shadow earlier ones (Daf 2-4)
          const nodeIdx = node.index && node.index > 0 ? node.index : runningIndex;
          const effectiveIndex = Math.max(runningIndex, nodeIdx);
          runningIndex = effectiveIndex + 1;
          dafEntries.push({ node, parsed, effectiveIndex });
        }
      }
    }

    if (dafEntries.length > 0) {
      // Find the last daf entry whose starting line <= targetLineIndex
      let bestEntry = dafEntries[0];
      for (const entry of dafEntries) {
        if (entry.effectiveIndex <= targetLineIndex) {
          bestEntry = entry;
        } else {
          break;
        }
      }

      // If user is in the very first lines of the tractate (e.g. lines 1-15), force first daf (דף ב ע״א)
      if (targetLineIndex <= 15 && dafEntries[0].parsed.dafNum === 2) {
        bestEntry = dafEntries[0];
      }

      const dafHebrew = numberToHebrew(bestEntry.parsed.dafNum);
      const dafLabel = `דף ${dafHebrew} ע״${bestEntry.parsed.amud === 'a' ? 'א' : 'ב'}`;
      return { dafNum: bestEntry.parsed.dafNum, amud: bestEntry.parsed.amud, dafLabel };
    }
  }

  // Fallback for beginning of any Talmud tractate
  if (targetLineIndex <= 30) {
    return { dafNum: 2, amud: 'a', dafLabel: 'דף ב ע״א' };
  }

  return null;
}

interface TargetLineResult {
  line: number;
  isExactSubItem: boolean;
}

function parseHebrewNumber(str: string): number | null {
  if (!str) return null;
  const cleanStr = str.replace(/[-"'\״\׳]/g, '').trim();
  const num = parseInt(cleanStr, 10);
  if (!isNaN(num)) return num;

  const letterValues: Record<string, number> = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
    'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
    'ש': 300, 'ת': 400
  };

  let sum = 0;
  for (const ch of cleanStr) {
    if (letterValues[ch] !== undefined) {
      sum += letterValues[ch];
    } else {
      return null;
    }
  }
  return sum > 0 ? sum : null;
}

function findTargetLineForQuery(
  query: string,
  tocList: TocNode[],
  bookLines: BookLineData[],
  totalBookLines?: number
): TargetLineResult | null {
  if (!query) return null;

  const clean = (s: string) =>
    stripNikud(s)
      .replace(/[-"'\״\׳:;,.]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const cleanTarget = clean(query);
  if (!cleanTarget) return null;

  // 1. Identify primary structural tokens (Klal, Siman, Perek, Parasha, Shaar)
  const klalMatch = cleanTarget.match(/כלל\s+([א-ת0-9]+)/);
  const simanMatch = cleanTarget.match(/סימן\s+([א-ת0-9]+)/);
  const perekMatch = cleanTarget.match(/פרק\s+([א-ת0-9]+)/);
  const parashaMatch = cleanTarget.match(/פרשת\s+([א-ת]+(?:\s+[א-ת]+)?)/);
  const shaarMatch = cleanTarget.match(/שער\s+([א-ת]+(?:\s+[א-ת]+)?)/);
  const dafMatch = cleanTarget.match(/דף\s+([א-ת0-9]+)/);

  // 2. Identify secondary structural tokens (Seif, Pasuk)
  const seifMatch = cleanTarget.match(/סעי[פף](?:ים|ו)?\s+([א-ת0-9]+)/);
  const pasukMatch = cleanTarget.match(/פסוק\s+([א-ת0-9]+)/);

  const primaryToken = (klalMatch && klalMatch[0]) ||
    (simanMatch && simanMatch[0]) ||
    (perekMatch && perekMatch[0]) ||
    (parashaMatch && parashaMatch[0]) ||
    (shaarMatch && shaarMatch[0]) ||
    (dafMatch && dafMatch[0]) ||
    null;

  const primaryVal = (klalMatch && klalMatch[1]) ||
    (simanMatch && simanMatch[1]) ||
    (perekMatch && perekMatch[1]) ||
    null;

  const primaryNum = primaryVal ? parseHebrewNumber(primaryVal) : null;

  const subToken = (seifMatch && seifMatch[0]) || (pasukMatch && pasukMatch[0]) || null;
  const subLetter = (seifMatch && seifMatch[1]) || (pasukMatch && pasukMatch[1]) || null;

  const flatNodes = tocList && tocList.length > 0 ? flattenTocNodes(tocList) : [];

  // A. Check if any TOC node matches BOTH primary and secondary tokens together (e.g. "כלל ה סעיף א", "סימן 443 סעיף א")
  if (primaryToken && subToken && flatNodes.length > 0) {
    const combinedNode = flatNodes.find(node => {
      const cleanNodeTitle = clean(node.title || '');
      const hasSub = cleanNodeTitle.includes(subToken) || (subLetter && cleanNodeTitle.includes(`סעיף ${subLetter}`));
      if (!hasSub) return false;

      if (cleanNodeTitle.includes(primaryToken)) return true;
      if (primaryNum) {
        return cleanNodeTitle.includes(`כלל ${primaryNum}`) ||
               cleanNodeTitle.includes(`סימן ${primaryNum}`) ||
               cleanNodeTitle.includes(`פרק ${primaryNum}`);
      }
      return false;
    });
    if (combinedNode && combinedNode.index) {
      return { line: combinedNode.index, isExactSubItem: true };
    }
  }

  // B. Locate Primary Token in TOC
  let primaryStartLine: number | null = null;
  let primaryEndLine: number | null = null;

  if (flatNodes.length > 0) {
    let bestScore = 0;
    let chosenNode: TocNode | null = null;
    let chosenIndex = -1;

    for (let i = 0; i < flatNodes.length; i++) {
      const node = flatNodes[i];
      if (!node.title) continue;
      const cleanTitle = clean(node.title);
      let score = 0;

      if (cleanTitle === cleanTarget) {
        score = 300;
      } else if (dafMatch && cleanTitle.includes(dafMatch[0])) {
        score = 250;
      } else if (primaryToken && cleanTitle.includes(primaryToken)) {
        score = 220;
        if (subToken && cleanTitle.includes(subToken)) score += 80;
      } else if (primaryNum && (
        cleanTitle.includes(`סימן ${primaryNum}`) ||
        cleanTitle.includes(`כלל ${primaryNum}`) ||
        cleanTitle.includes(`פרק ${primaryNum}`)
      )) {
        score = 210;
        if (subToken && cleanTitle.includes(subToken)) score += 80;
      } else if (cleanTitle.includes(cleanTarget) || cleanTarget.includes(cleanTitle)) {
        score = 100;
      }

      if (score > bestScore && score >= 100) {
        bestScore = score;
        chosenNode = node;
        chosenIndex = i;
      }
    }

    if (chosenNode) {
      primaryStartLine = chosenNode.index;

      // Identify boundary of this section (find next section with level <= chosenNode.level or next primary section)
      const chosenLevel = chosenNode.level !== undefined ? chosenNode.level : 1;
      let nextPrimaryNodeIdx = -1;
      for (let k = chosenIndex + 1; k < flatNodes.length; k++) {
        const nextNode = flatNodes[k];
        if (nextNode.level !== undefined && nextNode.level <= chosenLevel) {
          nextPrimaryNodeIdx = k;
          break;
        }
        const cTitle = clean(nextNode.title || '');
        if (cTitle.startsWith('כלל ') || cTitle.startsWith('סימן ') || cTitle.startsWith('פרק ')) {
          nextPrimaryNodeIdx = k;
          break;
        }
      }
      if (nextPrimaryNodeIdx !== -1) {
        primaryEndLine = flatNodes[nextPrimaryNodeIdx].index;
      }

      // Check child/descending TOC nodes under chosenNode for exact sub-item (e.g. "סעיף ז" under "כלל ג")
      if ((subToken || subLetter) && chosenIndex >= 0) {
        const endSearchIdx = nextPrimaryNodeIdx !== -1 ? nextPrimaryNodeIdx : flatNodes.length;
        for (let j = chosenIndex + 1; j < endSearchIdx; j++) {
          const childNode = flatNodes[j];
          const cleanChildTitle = clean(childNode.title || '');
          const isChildMatch =
            (subToken && cleanChildTitle.includes(subToken)) ||
            (subLetter && (
              cleanChildTitle.includes(`סעיף ${subLetter}`) ||
              cleanChildTitle.startsWith(`סעיף ${subLetter}`) ||
              cleanChildTitle === `סעיף ${subLetter}` ||
              cleanChildTitle.includes(`אות ${subLetter}`) ||
              cleanChildTitle.includes(`פסוק ${subLetter}`)
            ));

          if (isChildMatch && childNode.index) {
            return { line: childNode.index, isExactSubItem: true };
          }
        }
      }
    }
  }

  // C. Search within bookLines for the exact sub-item (Seif or Pasuk) within the primary section!
  if (subLetter && bookLines && bookLines.length > 0) {
    const minLine = primaryStartLine ? Math.max(1, primaryStartLine) : 1;
    const maxLine = primaryEndLine ? primaryEndLine : (minLine + 400);

    // Candidates in current loaded memory within the section
    const sectionLines = bookLines.filter(l => l.lineIndex >= minLine && l.lineIndex <= maxLine);
    if (sectionLines.length > 0) {
      for (const line of sectionLines) {
        // Strip HTML tags completely before matching text!
        const plainText = (line.content || '').replace(/<[^>]+>/g, ' ');
        const cContent = clean(plainText);
        const refContent = line.heRef ? clean(line.heRef) : '';

        const hasExactSeifPattern =
          cContent.includes(`סעיף ${subLetter}`) ||
          cContent.includes(`סעיפים ${subLetter}`) ||
          cContent.startsWith(`${subLetter} `) ||
          cContent.startsWith(`${subLetter}.`) ||
          cContent.startsWith(`${subLetter})`) ||
          cContent.includes(`אות ${subLetter}`) ||
          cContent.includes(`(${subLetter})`) ||
          cContent.includes(`[${subLetter}]`) ||
          refContent.includes(`סעיף ${subLetter}`) ||
          refContent.includes(`פסוק ${subLetter}`);

        if (hasExactSeifPattern) {
          return { line: line.lineIndex, isExactSubItem: true };
        }
      }
    }
  }

  // D. Fallback to Primary Node if found
  if (primaryStartLine) {
    const total = totalBookLines || 0;
    const target = total > 0 ? Math.min(total, Math.max(1, primaryStartLine)) : primaryStartLine;
    return { line: target, isExactSubItem: subLetter === null };
  }

  // E. Direct line match across loaded lines
  if (bookLines && bookLines.length > 0) {
    const searchToken = primaryToken || cleanTarget;
    for (const line of bookLines) {
      if (!line.content) continue;
      const plainText = line.content.replace(/<[^>]+>/g, ' ');
      const cleanLine = clean(plainText);
      if (cleanLine.includes(searchToken)) {
        return { line: line.lineIndex, isExactSubItem: true };
      }
    }
  }

  return null;
}

export const BookReader: React.FC<BookReaderProps> = ({
  bookId,
  bookTitle,
  initialLine,
  initialSearch,
  initialHighlight,
  initialWordRange,
  settings,
  onAddBookmark,
  onOpenTzuratHaDaf,
  onLineChange,
  onBookTitleResolved
}) => {
  const [content, setContent] = useState<string>('');
  const [bookLines, setBookLines] = useState<BookLineData[]>([]);
  const [totalBookLines, setTotalBookLines] = useState<number>(0);
  const [toc, setToc] = useState<TocNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Shared text fragment / word range highlight state (from deep link)
  const [highlightedPhrase, setHighlightedPhrase] = useState<string | undefined>(initialHighlight);
  const [activeWordRange, setActiveWordRange] = useState<{ start: number; end: number } | undefined>(initialWordRange);

  // Floating text selection share popover
  const [textSharePopover, setTextSharePopover] = useState<{
    lineIndex: number;
    selectedText: string;
    wordRange?: WordRange | null;
    coords: { x: number; y: number };
  } | null>(null);
  const [shareLinkCopiedLine, setShareLinkCopiedLine] = useState<number | null>(null);
  const [shareToastMessage, setShareToastMessage] = useState<string | null>(null);

  const CHUNK_SIZE = 150;
  const [startLineIndex, setStartLineIndex] = useState<number>(1);
  const [endLineIndex, setEndLineIndex] = useState<number>(CHUNK_SIZE);
  const loadedLineRangesRef = useRef<Set<number>>(new Set());
  const isLoadingMoreRef = useRef<boolean>(false);

  // Panels state
  const [showTocPanel, setShowTocPanel] = useState<boolean>(false);
  const [showCommentaryPanel, setShowCommentaryPanel] = useState<boolean>(true);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(initialLine || null);

  useEffect(() => {
    if (selectedLineIndex && selectedLineIndex >= 1) {
      onLineChange?.(selectedLineIndex);
    }
  }, [selectedLineIndex, onLineChange]);
  const [commentaries, setCommentaries] = useState<CommentaryLink[]>([]);
  const [allCommentaries, setAllCommentaries] = useState<CommentaryLink[]>([]);
  const [selectedVerseInfo, setSelectedVerseInfo] = useState<{ chapter?: number; verse?: number; dafLabel?: string } | null>(null);
  const [inBookSearchInput, setInBookSearchInput] = useState<string>('');
  const [executedInBookSearch, setExecutedInBookSearch] = useState<string>('');
  const [isInBookSearching, setIsInBookSearching] = useState<boolean>(false);
  const [inBookSearchError, setInBookSearchError] = useState<string | null>(null);
  const [showInBookSearchBox, setShowInBookSearchBox] = useState<boolean>(false);
  const [locationNavMessage, setLocationNavMessage] = useState<string | null>(null);
  const initialNavDoneRef = useRef<boolean>(false);

  const [inBookMatches, setInBookMatches] = useState<InBookSearchMatch[]>([]);
  const [searchResultFilter, setSearchResultFilter] = useState<'all' | 'book' | 'commentaries'>('all');
  const [currentMatchPointer, setCurrentMatchPointer] = useState<number>(0);
  const [showSearchResultsList, setShowSearchResultsList] = useState<boolean>(false);
  const inBookSearchRequestIdRef = useRef<number>(0);

  const filteredSearchMatches = useMemo(() => {
    if (searchResultFilter === 'book') {
      return inBookMatches.filter(m => !m.isCommentary);
    }
    if (searchResultFilter === 'commentaries') {
      return inBookMatches.filter(m => m.isCommentary);
    }
    return inBookMatches;
  }, [inBookMatches, searchResultFilter]);

  const searchMatchIndices = useMemo(() => {
    return Array.from(new Set(filteredSearchMatches.map(m => m.lineIndex)));
  }, [filteredSearchMatches]);

  const currentMatch = filteredSearchMatches[currentMatchPointer] || null;

  const bookMatchesCount = useMemo(() => {
    return inBookMatches.filter(m => !m.isCommentary).length;
  }, [inBookMatches]);

  const commMatchesCount = useMemo(() => {
    return inBookMatches.filter(m => m.isCommentary).length;
  }, [inBookMatches]);

  const [copiedLine, setCopiedLine] = useState<number | null>(null);

  // Commentary panel enhancements (collapse, filtering, user preferences)
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const [commentariesGlobalState, setCommentariesGlobalState] = useState<'expanded' | 'collapsed' | 'manual'>('manual');
  const [showCommentarySettings, setShowCommentarySettings] = useState<boolean>(false);
  const [availableBookCommentators, setAvailableBookCommentators] = useState<string[]>([]);
  const [commentatorSearchFilter, setCommentatorSearchFilter] = useState<string>('');
  const [localCommentatorSearchInput, setLocalCommentatorSearchInput] = useState<string>('');

  const [commentaryContentQuery, setCommentaryContentQuery] = useState<string>('');
  const [localCommentaryContentInput, setLocalCommentaryContentInput] = useState<string>('');

  // Instant typing response + 120ms debounced filter for commentator search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCommentatorSearchFilter(localCommentatorSearchInput);
    }, 120);
    return () => clearTimeout(timer);
  }, [localCommentatorSearchInput]);

  useEffect(() => {
    if (commentatorSearchFilter === '' && localCommentatorSearchInput !== '') {
      setLocalCommentatorSearchInput('');
    }
  }, [commentatorSearchFilter]);

  // Instant typing response + 120ms debounced filter for commentary content search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCommentaryContentQuery(localCommentaryContentInput);
    }, 120);
    return () => clearTimeout(timer);
  }, [localCommentaryContentInput]);

  useEffect(() => {
    if (commentaryContentQuery === '' && localCommentaryContentInput !== '') {
      setLocalCommentaryContentInput('');
    }
  }, [commentaryContentQuery]);
  const [searchViewMode, setSearchViewMode] = useState<'partial' | 'fully_collapsed' | 'fully_expanded'>('partial');
  const [expandedDuringSearch, setExpandedDuringSearch] = useState<Record<string, boolean>>({});
  const [enabledCommentaryCategories, setEnabledCommentaryCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`otzaria_comm_prefs_${bookTitle}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Reader typography settings
  const [fontSize, setFontSize] = useState<number>(settings.fontSize || 20);
  const [showNikud, setShowNikud] = useState<boolean>(settings.showNikud ?? true);

  // Sync settings when updated globally from SettingsModal
  useEffect(() => {
    if (settings.fontSize && settings.fontSize !== fontSize) {
      setFontSize(settings.fontSize);
    }
  }, [settings.fontSize]);

  useEffect(() => {
    if (settings.showNikud !== undefined && settings.showNikud !== showNikud) {
      setShowNikud(settings.showNikud);
    }
  }, [settings.showNikud]);

  // Tzurat HaDaf modal state
  const [isTzuratHaDafOpen, setIsTzuratHaDafOpen] = useState<boolean>(false);
  const isShasBook = useMemo(() => findShasTractate(bookTitle) !== null, [bookTitle]);

  // Responsive mobile detection & Inline Commentary configuration
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync initialHighlight and initialWordRange if props change
  useEffect(() => {
    if (initialHighlight) {
      setHighlightedPhrase(initialHighlight);
    }
  }, [initialHighlight]);

  useEffect(() => {
    if (initialWordRange) {
      setActiveWordRange(initialWordRange);
    }
  }, [initialWordRange]);

  // Listen to text selection inside reader lines to display the floating share button
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setTextSharePopover(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text || text.length < 2) {
        setTextSharePopover(null);
        return;
      }

      const anchor = selection.anchorNode;
      const anchorEl = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
      const lineEl = anchorEl?.closest('[id^="reader-line-"]');

      if (lineEl) {
        const match = lineEl.id.match(/^reader-line-(\d+)$/);
        if (match) {
          const lineIdx = parseInt(match[1], 10);
          try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Calculate precise 1-based word range within the line
            let wordRange = getSelectionWordRangeFromDOM(lineEl as HTMLElement);
            if (!wordRange) {
              const fullLineText = lineEl.textContent || '';
              wordRange = getWordRangeInLine(fullLineText, text);
            }

            setTextSharePopover({
              lineIndex: lineIdx,
              selectedText: text,
              wordRange: wordRange || undefined,
              coords: {
                x: Math.max(50, rect.left + rect.width / 2),
                y: Math.max(35, rect.top - 8)
              }
            });
          } catch {
            setTextSharePopover(null);
          }
          return;
        }
      }

      setTextSharePopover(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const isInlineCommentary =
    settings.commentaryViewMode === 'inline' ||
    (settings.commentaryViewMode !== 'side_panel' && isMobile);

  const linesContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isScrollingLoadingRef = useRef<boolean>(false);
  const lastInitialLineRef = useRef<number | null>(null);
  const pendingTopScrollAdjustRef = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
    anchorId: string | null;
    anchorOffsetTop: number;
  } | null>(null);

  // Synchronously restore scroll position before browser paints when new top lines are prepended
  useLayoutEffect(() => {
    if (pendingTopScrollAdjustRef.current && linesContainerRef.current) {
      const { prevScrollHeight, prevScrollTop, anchorId, anchorOffsetTop } = pendingTopScrollAdjustRef.current;
      pendingTopScrollAdjustRef.current = null;

      const container = linesContainerRef.current;
      
      if (anchorId) {
        const anchorElem = document.getElementById(anchorId);
        if (anchorElem) {
          container.scrollTop = anchorElem.offsetTop - anchorOffsetTop;
        } else {
          const heightDiff = container.scrollHeight - prevScrollHeight;
          container.scrollTop = prevScrollTop + heightDiff;
        }
      } else {
        const heightDiff = container.scrollHeight - prevScrollHeight;
        container.scrollTop = prevScrollTop + heightDiff;
      }

      setTimeout(() => {
        isScrollingLoadingRef.current = false;
        isLoadingMoreRef.current = false;
      }, 150);
    }
  }, [bookLines, startLineIndex]);

  // Load initial 150 lines instantly (<10KB), while TOC and commentators load in background
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    loadedLineRangesRef.current.clear();
    sysLogger.addLog('info', 'BookReader', `פתיחת ספר לקריאה מיידית: "${bookTitle}" (מזהה: ${bookId})`);

    const targetLine = initialLine || 1;
    const initialStart = Math.max(1, targetLine - 20);
    const initialEnd = initialStart + CHUNK_SIZE;

    // 1. Fetch content lines first - makes text appear in 10ms
    getBookContent(bookId, initialStart, initialEnd)
      .then(contentData => {
        if (!isMounted) return;
        const fetchedLines = contentData.lines || [];
        setBookLines(fetchedLines);
        fetchedLines.forEach(l => loadedLineRangesRef.current.add(l.lineIndex));
        const total = contentData.totalLines || fetchedLines.length || 1;
        setTotalBookLines(total);
        setIsLoading(false);
        setStartLineIndex(initialStart);
        setEndLineIndex(Math.min(total, initialEnd));

        try {
          if (contentData.title && contentData.title !== String(bookId) && !/^\d+$/.test(contentData.title)) {
            onBookTitleResolved?.(contentData.title);
          }
        } catch {}

        sysLogger.addLog(
          'success',
          'BookReader',
          `הספר "${bookTitle}" נפתח מיידית! נטענו ${fetchedLines.length} שורות ראשונות מתוך ${total}`
        );
      })
      .catch(err => {
        if (isMounted) setIsLoading(false);
        sysLogger.addLog('error', 'BookReader', `שגיאה בטעינת הספר "${bookTitle}": ${err.message}`);
      });

    // 2. Fetch TOC in background
    getBookToc(bookId)
      .then(tocData => {
        if (!isMounted) return;
        if (tocData && tocData.toc && tocData.toc.length > 0) {
          setToc(tocData.toc);
        }
      })
      .catch(() => {});

    // 3. Fetch Commentators in background
    getBookCommentators(bookId)
      .then(commData => {
        if (!isMounted) return;
        if (commData && commData.commentators) {
          setAvailableBookCommentators(commData.commentators);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  // Fallback: If TOC is empty, automatically extract chapters/headings from loaded lines
  useEffect(() => {
    if (toc.length === 0 && bookLines.length > 0) {
      const extracted: TocNode[] = [];
      const seenTitles = new Set<string>();

      bookLines.forEach(l => {
        const trimmed = (l.content || '').trim();
        const headingMatch = trimmed.match(/^<h([1-6])(?:\s+[^>]*)?>(.*?)<\/h\1>$/i);
        if (headingMatch) {
          const title = headingMatch[2].replace(/<[^>]+>/g, '').trim();
          if (title && title !== bookTitle && !seenTitles.has(title)) {
            seenTitles.add(title);
            extracted.push({
              title,
              index: l.lineIndex,
              level: parseInt(headingMatch[1], 10) || 1
            });
          }
        } else {
          const chapMatch = trimmed.match(/^(?:פרק|סימן|דף|כלל)\s+([א-ת]+(?:\s+[א-ת]+)?)/i);
          if (chapMatch) {
            const title = chapMatch[0];
            if (!seenTitles.has(title)) {
              seenTitles.add(title);
              extracted.push({
                title,
                index: l.lineIndex,
                level: 1
              });
            }
          }
        }
      });

      if (extracted.length > 0) {
        setToc(extracted);
      }
    }
  }, [bookLines, toc.length, bookTitle]);

  // Fetch more lines on demand (returns true if lines loaded or already present)
  const fetchLineRange = async (start: number, end: number): Promise<boolean> => {
    if (isLoadingMoreRef.current) return false;
    isLoadingMoreRef.current = true;
    try {
      const data = await getBookContent(bookId, start, end);
      if (data.lines && data.lines.length > 0) {
        setBookLines(prev => {
          const map = new Map<number, BookLineData>();
          prev.forEach(l => map.set(l.lineIndex, l));
          data.lines!.forEach(l => {
            map.set(l.lineIndex, l);
            loadedLineRangesRef.current.add(l.lineIndex);
          });
          return Array.from(map.values()).sort((a, b) => a.lineIndex - b.lineIndex);
        });
      }
      if (data.totalLines) {
        setTotalBookLines(data.totalLines);
      }
      return true;
    } catch (err: any) {
      console.warn('Failed to fetch line range:', err.message);
      return false;
    } finally {
      isLoadingMoreRef.current = false;
    }
  };

  // Load commentaries for a line
  const loadLineCommentaries = async (lineIdx: number) => {
    try {
      const data = await getBookLinks(bookId, lineIdx);
      const fullList = data.allLinks || data.links;
      const lineMatches = data.links;
      setAllCommentaries(fullList);
      setCommentaries(lineMatches);
      if (data.availableCommentators && data.availableCommentators.length > 0) {
        setAvailableBookCommentators(prev => Array.from(new Set([...prev, ...data.availableCommentators!])));
      }

      const hasMeaningfulDaf = data.dafLabel && !/^\d+$/.test(data.dafLabel) && !data.dafLabel.startsWith('שורה');
      if (hasMeaningfulDaf) {
        setSelectedVerseInfo({ chapter: data.chapter, verse: data.verse, dafLabel: data.dafLabel });
      } else {
        const resolvedDaf = isShasBook ? resolveTalmudDafForLine(lineIdx, toc, bookLines, allProcessedLines) : null;
        if (resolvedDaf) {
          setSelectedVerseInfo({ chapter: data.chapter, verse: data.verse, dafLabel: resolvedDaf.dafLabel });
        } else if (data.chapter || data.verse) {
          setSelectedVerseInfo({ chapter: data.chapter, verse: data.verse });
        } else {
          setSelectedVerseInfo(null);
        }
      }
    } catch (err) {
      console.error('Failed to load line commentaries', err);
    }
  };

  const handleLineClick = (idx: number) => {
    // Prevent line click if user is highlighting text with mouse across lines
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return;
    }

    if (selectedLineIndex === idx && isInlineCommentary && showCommentaryPanel) {
      setShowCommentaryPanel(false);
      return;
    }
    setSelectedLineIndex(idx);
    if (isShasBook) {
      const resolvedDaf = resolveTalmudDafForLine(idx, toc, bookLines, allProcessedLines);
      if (resolvedDaf) {
        setSelectedVerseInfo({ dafLabel: resolvedDaf.dafLabel });
      }
    }
    loadLineCommentaries(idx);
    setShowCommentaryPanel(true);
    sysLogger.addLog('info', 'BookReader', `בחירת שורה ${idx} בספר "${bookTitle}"`);
  };

  const loadPreviousLines = async () => {
    if (startLineIndex <= 1 || isLoadingMoreRef.current || isScrollingLoadingRef.current) return;
    const container = linesContainerRef.current;
    if (!container) return;

    isScrollingLoadingRef.current = true;
    isLoadingMoreRef.current = true;

    // Find the first line element that is currently visible in the container viewport
    const lineElements = container.querySelectorAll('[id^="reader-line-"]');
    let anchorId: string | null = null;
    let anchorOffsetTop = 0;

    for (let i = 0; i < lineElements.length; i++) {
      const el = lineElements[i] as HTMLElement;
      if (el.offsetTop + el.offsetHeight >= container.scrollTop) {
        anchorId = el.id;
        anchorOffsetTop = el.offsetTop - container.scrollTop;
        break;
      }
    }

    pendingTopScrollAdjustRef.current = {
      prevScrollHeight: container.scrollHeight,
      prevScrollTop: container.scrollTop,
      anchorId,
      anchorOffsetTop
    };

    const prevStart = Math.max(1, startLineIndex - CHUNK_SIZE);
    const prevEnd = startLineIndex - 1;

    try {
      const data = await getBookContent(bookId, prevStart, prevEnd);
      if (data.lines && data.lines.length > 0) {
        setBookLines(prev => {
          const map = new Map<number, BookLineData>();
          prev.forEach(l => map.set(l.lineIndex, l));
          data.lines!.forEach(l => {
            map.set(l.lineIndex, l);
            loadedLineRangesRef.current.add(l.lineIndex);
          });
          return Array.from(map.values()).sort((a, b) => a.lineIndex - b.lineIndex);
        });
      }
      if (data.totalLines) {
        setTotalBookLines(data.totalLines);
      }
      setStartLineIndex(prevStart);
    } catch (err: any) {
      console.warn('Failed to fetch previous lines:', err.message);
      pendingTopScrollAdjustRef.current = null;
      isScrollingLoadingRef.current = false;
      isLoadingMoreRef.current = false;
    }
  };

  // Proactive unified loading trigger: checks viewport boundaries and seamlessly prefetches lines
  const checkAndTriggerLineLoading = () => {
    const container = linesContainerRef.current;
    if (!container || isLoadingMoreRef.current || isScrollingLoadingRef.current) return;

    const { scrollTop, clientHeight, scrollHeight } = container;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

    // Predictive forward threshold: prefetch when within 1400px of bottom, or immediately when at bottom (<= 50px)
    const isNearOrAtBottom = distanceToBottom <= 1400;
    const hasMoreForwardLines = totalBookLines === 0 || endLineIndex < totalBookLines;

    if (isNearOrAtBottom && hasMoreForwardLines) {
      const nextStart = endLineIndex + 1;
      const nextEnd = nextStart + CHUNK_SIZE;
      setEndLineIndex(nextEnd);
      fetchLineRange(nextStart, nextEnd).then((loaded) => {
        if (loaded) {
          // If user jumped directly to the bottom and viewport is still near the bottom of the newly loaded batch,
          // immediately trigger next batch without requiring any user gesture or scroll event!
          requestAnimationFrame(() => {
            const cont = linesContainerRef.current;
            if (cont) {
              const rem = cont.scrollHeight - (cont.scrollTop + cont.clientHeight);
              if (rem <= 800 && (totalBookLines === 0 || nextEnd < totalBookLines)) {
                checkAndTriggerLineLoading();
              }
            }
          });
        }
      });
    }

    // Predictive backward loading: when scrolled near top (< 250px) and there are previous lines
    if (scrollTop <= 250 && startLineIndex > 1) {
      loadPreviousLines();
    }
  };

  const loadNextLines = async () => {
    if (isLoadingMoreRef.current) return;
    const nextStart = endLineIndex + 1;
    const nextEnd = nextStart + CHUNK_SIZE;
    setEndLineIndex(nextEnd);
    await fetchLineRange(nextStart, nextEnd);
  };

  // Seamless IntersectionObserver to eliminate dead-ends when user jumps or scrolls to the exact end
  useEffect(() => {
    const container = linesContainerRef.current;
    const bottomEl = bottomSentinelRef.current;
    if (!container || !bottomEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isScrollingLoadingRef.current) {
            checkAndTriggerLineLoading();
          }
        }
      },
      {
        root: container,
        rootMargin: '1200px 0px 800px 0px',
        threshold: 0
      }
    );

    observer.observe(bottomEl);

    return () => {
      observer.disconnect();
    };
  }, [endLineIndex, totalBookLines]);

  const scrollToLine = async (lineIdx: number, snapWindow = true) => {
    if (!lineIdx || lineIdx < 1) return;
    
    const targetLine = Math.max(1, Math.round(lineIdx));

    // Prevent scroll event thrashing during jump
    isScrollingLoadingRef.current = true;
    setSelectedLineIndex(targetLine);
    loadLineCommentaries(targetLine);

    const newStart = Math.max(1, targetLine - 50);
    const newEnd = targetLine + CHUNK_SIZE + 50;

    // 1. Fetch lines FIRST if not already in memory
    const isLineLoaded = loadedLineRangesRef.current.has(targetLine);
    if (!isLineLoaded) {
      await fetchLineRange(newStart, newEnd);
    }

    // 2. Update start and end line indices so DOM renders the exact chunk with target line
    setStartLineIndex(newStart);
    setEndLineIndex(newEnd);

    // 3. Scroll container smoothly & reliably with retry for DOM render readiness
    let attempts = 0;
    const tryScroll = () => {
      const elem = document.getElementById(`reader-line-${targetLine}`);
      if (elem) {
        const markEl = elem.querySelector('.otzaria-shared-highlight');
        if (markEl) {
          markEl.scrollIntoView({ block: 'center', behavior: 'auto' });
        } else {
          elem.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        setTimeout(() => {
          isScrollingLoadingRef.current = false;
          // Crucial: check immediately after scrolling finishes so jumping to the end never leaves the user stuck!
          checkAndTriggerLineLoading();
        }, 80);
      } else if (attempts < 35) {
        attempts++;
        setTimeout(tryScroll, 40);
      } else {
        isScrollingLoadingRef.current = false;
        checkAndTriggerLineLoading();
      }
    };

    requestAnimationFrame(() => {
      setTimeout(tryScroll, 20);
    });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isLoadingMoreRef.current || isScrollingLoadingRef.current) return;
    checkAndTriggerLineLoading();
  };

  // Automatically scroll when initialLine prop changes or when book lines finish loading
  useEffect(() => {
    if (initialLine && !isLoading && bookLines.length > 0) {
      if (lastInitialLineRef.current !== initialLine) {
        lastInitialLineRef.current = initialLine;
        scrollToLine(initialLine, true);
      }
    } else if (!isLoading && bookLines.length > 0 && !selectedLineIndex) {
      loadLineCommentaries(1);
    }
  }, [initialLine, isLoading, bookLines.length]);

  // Smart Navigation to initial position (e.g. from Daily Study "כלל ה סעיף א", "דף ב ע״א", "פרק א")
  useEffect(() => {
    if (!initialSearch || initialNavDoneRef.current || isLoading) return;

    const targetResult = findTargetLineForQuery(initialSearch, toc, bookLines, totalBookLines);
    if (targetResult && targetResult.line > 0) {
      if (targetResult.isExactSubItem) {
        initialNavDoneRef.current = true;
      }
      scrollToLine(targetResult.line, true);
      setLocationNavMessage(`קפצת למיקום הלימוד: "${initialSearch}"`);
      sysLogger.addLog('info', 'BookReader', `ניווט חכם למיקום "${initialSearch}" (שורה ${targetResult.line} בספר "${bookTitle}", מדויק לסעיף: ${targetResult.isExactSubItem})`);
    }
  }, [initialSearch, toc, bookLines, isLoading, totalBookLines, bookId]);

  // Execute in-book search
  const executeInBookSearch = async () => {
    const trimmed = inBookSearchInput.trim();
    if (!trimmed) {
      setInBookMatches([]);
      setCurrentMatchPointer(0);
      setInBookSearchError(null);
      setExecutedInBookSearch('');
      return;
    }

    if (trimmed.length < 2) {
      setInBookSearchError('יש להזין לפחות 2 אותיות לחיפוש בתוך הספר.');
      return;
    }

    setInBookSearchError(null);
    setExecutedInBookSearch(trimmed);
    setIsInBookSearching(true);
    setSearchResultFilter('all');

    const currentRequestId = ++inBookSearchRequestIdRef.current;

    sysLogger.addLog(
      'info',
      'BookReader',
      `חיפוש בתוך הספר "${bookTitle}" (ID: ${bookId}): "${trimmed}" [בקשה #${currentRequestId}]`
    );

    try {
      let matches: InBookSearchMatch[] = [];
      const inBookRes = await searchInBook(bookId, trimmed, false);

      if (currentRequestId !== inBookSearchRequestIdRef.current) return;

      if (inBookRes && Array.isArray(inBookRes.matches) && inBookRes.matches.length > 0) {
        matches = inBookRes.matches;
      } else {
        // Fallback: search loaded lines in memory
        const searchRegex = buildHebrewSearchRegex(trimmed);
        if (searchRegex) {
          allProcessedLines.forEach(l => {
            searchRegex.lastIndex = 0;
            const plain = l.rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (searchRegex.test(plain)) {
              const snippet = extractSearchSnippet(plain, searchRegex).snippet;
              matches.push({
                lineIndex: l.index,
                content: snippet,
                heRef: l.verseDisplay,
                isCommentary: false,
                sourceType: 'book',
                sourceTitle: bookTitle
              });
            }
          });


        }
      }

      setInBookMatches(matches);
      setCurrentMatchPointer(0);
      setIsInBookSearching(false);

      if (matches.length > 0) {
        const firstMatch = matches[0];
        scrollToLine(firstMatch.lineIndex);
        if (firstMatch.isCommentary) {
          setShowCommentaryPanel(true);
        }
      } else {
        setInBookSearchError('לא נמצאו תוצאות בספר זה.');
      }
    } catch (err: any) {
      if (currentRequestId !== inBookSearchRequestIdRef.current) return;
      setIsInBookSearching(false);
      setInBookSearchError('שגיאה בתקשורת עם מנוע החיפוש. נסה שנית.');
    }
  };

  const handleSelectFilter = (filter: 'all' | 'book' | 'commentaries') => {
    setSearchResultFilter(filter);
    setCurrentMatchPointer(0);
    let list = inBookMatches;
    if (filter === 'book') list = inBookMatches.filter(m => !m.isCommentary);
    else if (filter === 'commentaries') list = inBookMatches.filter(m => m.isCommentary);
    if (list.length > 0) {
      const first = list[0];
      scrollToLine(first.lineIndex);
      if (first.isCommentary) {
        setShowCommentaryPanel(true);
      }
    }
  };

  const handleSelectMatch = (matchIdx: number) => {
    if (matchIdx < 0 || matchIdx >= filteredSearchMatches.length) return;
    setCurrentMatchPointer(matchIdx);
    const targetMatch = filteredSearchMatches[matchIdx];
    scrollToLine(targetMatch.lineIndex);
    if (targetMatch.isCommentary) {
      setShowCommentaryPanel(true);
    }
    setShowSearchResultsList(false);
  };

  const handleNextSearchMatch = () => {
    if (filteredSearchMatches.length === 0) return;
    const nextPtr = (currentMatchPointer + 1) % filteredSearchMatches.length;
    setCurrentMatchPointer(nextPtr);
    const targetMatch = filteredSearchMatches[nextPtr];
    scrollToLine(targetMatch.lineIndex);
    if (targetMatch.isCommentary) {
      setShowCommentaryPanel(true);
    }
  };

  const handlePrevSearchMatch = () => {
    if (filteredSearchMatches.length === 0) return;
    const prevPtr = (currentMatchPointer - 1 + filteredSearchMatches.length) % filteredSearchMatches.length;
    setCurrentMatchPointer(prevPtr);
    const targetMatch = filteredSearchMatches[prevPtr];
    scrollToLine(targetMatch.lineIndex);
    if (targetMatch.isCommentary) {
      setShowCommentaryPanel(true);
    }
  };

  const handleCopyLine = (text: string, idx: number) => {
    const clean = text.replace(/<[^>]+>/g, '').trim();
    let copiedString = clean;

    const includeHeader = settings.copyWithHeaders || (settings.copyIncludeHeader === 'never' ? 'none' : 'book_and_path');
    if (includeHeader !== 'none') {
      const headerLabel = includeHeader === 'book_name' ? bookTitle : `${bookTitle} (${numberToHebrew(idx)})`;
      const format = settings.copyHeaderFormat || 'same_line_after_brackets';

      switch (format) {
        case 'same_line_after_brackets':
          copiedString = `${clean} (${headerLabel})`;
          break;
        case 'same_line_after_no_brackets':
          copiedString = `${clean} - ${headerLabel}`;
          break;
        case 'same_line_before_brackets':
          copiedString = `(${headerLabel}) ${clean}`;
          break;
        case 'same_line_before_no_brackets':
          copiedString = `${headerLabel} - ${clean}`;
          break;
        case 'separate_line_after':
          copiedString = `${clean}\n(${headerLabel})`;
          break;
        case 'separate_line_before':
          copiedString = `${headerLabel}:\n${clean}`;
          break;
        case 'title_only':
          copiedString = `${bookTitle}:\n${clean}`;
          break;
        case 'full_path':
          copiedString = `אוצריא > ${bookTitle} (שורה ${idx}):\n${clean}`;
          break;
        case 'title_and_ref':
        default:
          copiedString = `${bookTitle} (${numberToHebrew(idx)}):\n${clean}`;
          break;
      }
    }

    navigator.clipboard.writeText(copiedString).catch(() => {});
    setCopiedLine(idx);
    sysLogger.addLog('info', 'BookReader', `הועתקה שורה ${idx} מתוך "${bookTitle}"`);
    setTimeout(() => setCopiedLine(null), 1500);
  };

  // Copy line as clickable hyperlink
  const handleCopyLineAsLink = async (text: string, idx: number) => {
    const clean = text.replace(/<[^>]+>/g, '').trim();
    let copiedString = clean;
    const includeHeader = settings.copyWithHeaders || (settings.copyIncludeHeader === 'never' ? 'none' : 'book_and_path');
    if (includeHeader !== 'none') {
      const headerLabel = includeHeader === 'book_name' ? bookTitle : `${bookTitle} (${numberToHebrew(idx)})`;
      const format = settings.copyHeaderFormat || 'same_line_after_brackets';
      switch (format) {
        case 'same_line_after_brackets':
          copiedString = `${clean} (${headerLabel})`;
          break;
        case 'same_line_after_no_brackets':
          copiedString = `${clean} - ${headerLabel}`;
          break;
        case 'same_line_before_brackets':
          copiedString = `(${headerLabel}) ${clean}`;
          break;
        case 'same_line_before_no_brackets':
          copiedString = `${headerLabel} - ${clean}`;
          break;
        case 'separate_line_after':
          copiedString = `${clean}\n(${headerLabel})`;
          break;
        case 'separate_line_before':
          copiedString = `${headerLabel}:\n${clean}`;
          break;
        case 'title_only':
          copiedString = `${bookTitle}:\n${clean}`;
          break;
        case 'full_path':
          copiedString = `אוצריא > ${bookTitle} (שורה ${idx}):\n${clean}`;
          break;
        case 'title_and_ref':
        default:
          copiedString = `${bookTitle} (${numberToHebrew(idx)}):\n${clean}`;
          break;
      }
    }

    const fullUrl = buildShareUrl(bookId, idx, null, bookTitle);
    const div = document.createElement('div');
    div.textContent = copiedString;
    const escapedText = div.innerHTML;
    const htmlContent = `<a href="${fullUrl}" target="_blank">${escapedText}</a>`;

    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([copiedString], { type: 'text/plain' }),
          'text/html': new Blob([htmlContent], { type: 'text/html' })
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(copiedString);
      }
      setCopiedLine(idx);
      sysLogger.addLog('info', 'BookReader', `הועתקה שורה ${idx} כקישור מתוך "${bookTitle}"`);
      setShareToastMessage(`הטקסט והקישור לשורה ${idx} הועתקו בהצלחה!`);
      setTimeout(() => {
        setCopiedLine(null);
        setShareToastMessage(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy line as link:', err);
      navigator.clipboard.writeText(copiedString).catch(() => {});
    }
  };

  // Copy selected text as clickable hyperlink
  const handleCopySelectedTextAsLink = async (
    lineIdx: number,
    selectedText: string,
    explicitWordRange?: WordRange | null
  ) => {
    let wordRange: WordRange | null = explicitWordRange || null;
    if (!wordRange && selectedText) {
      const procLine = allProcessedLines.find(l => l.index === lineIdx);
      const rawLine = bookLines.find(l => l.lineIndex === lineIdx);
      const lineText = procLine?.rawText || rawLine?.content || '';
      if (lineText) {
        wordRange = getWordRangeInLine(lineText, selectedText);
      }
    }
    const fullUrl = buildShareUrl(bookId, lineIdx, wordRange, bookTitle);
    const cleanText = selectedText.replace(/<[^>]+>/g, '').trim();

    const div = document.createElement('div');
    div.textContent = cleanText;
    const escapedText = div.innerHTML;
    const htmlContent = `<a href="${fullUrl}" target="_blank">${escapedText}</a>`;

    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([cleanText], { type: 'text/plain' }),
          'text/html': new Blob([htmlContent], { type: 'text/html' })
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(cleanText);
      }
      setShareToastMessage('הטקסט הועתק כקישור ללוח!');
      setTimeout(() => {
        setShareToastMessage(null);
        setTextSharePopover(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy selected text as link:', err);
      navigator.clipboard.writeText(cleanText).catch(() => {});
    }
  };

  const handleBookmarkCurrentLine = (lineIdx: number, text: string) => {
    const clean = text.replace(/<[^>]+>/g, '').trim();
    onAddBookmark({
      bookId,
      bookTitle,
      lineIndex: lineIdx,
      snippet: clean.slice(0, 100)
    });
    sysLogger.addLog('success', 'BookReader', `נוספה סימניה בשורה ${lineIdx} בספר "${bookTitle}"`);
  };

  // Share direct compact deep link to this line or selected word range
  const handleShareTextFragment = (
    lineIdx: number,
    textToShare?: string,
    explicitWordRange?: WordRange | null
  ) => {
    let wordRange: WordRange | null = explicitWordRange || null;

    if (!wordRange && textToShare) {
      // Find line text from processed lines or book lines
      const procLine = allProcessedLines.find(l => l.index === lineIdx);
      const rawLine = bookLines.find(l => l.lineIndex === lineIdx);
      const lineText = procLine?.rawText || rawLine?.content || '';
      if (lineText) {
        wordRange = getWordRangeInLine(lineText, textToShare);
      }
    }

    const fullUrl = buildShareUrl(bookId, lineIdx, wordRange, bookTitle);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl).catch(() => {});
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fullUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setShareLinkCopiedLine(lineIdx);
      if (wordRange) {
        const wordDesc =
          wordRange.start === wordRange.end
            ? `מילה ${wordRange.start}`
            : `מילים ${wordRange.start}-${wordRange.end}`;
        setShareToastMessage(`הקישור לקטע (${wordDesc} בשורה ${lineIdx}) הועתק בהצלחה ללוח!`);
        sysLogger.addLog('info', 'BookReader', `נוצר קישור ישיר לקטע: ${wordDesc} בשורה ${lineIdx}`);
      } else {
        setShareToastMessage(`הקישור לשורה ${lineIdx} בספר "${bookTitle}" הועתק בהצלחה ללוח!`);
        sysLogger.addLog('info', 'BookReader', `נוצר קישור ישיר לשורה ${lineIdx}`);
      }

      setTimeout(() => {
        setShareLinkCopiedLine(null);
        setShareToastMessage(null);
        setTextSharePopover(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy direct link:', err);
    }
  };

  // Accurately highlights a shared snippet within line HTML text, accounting for nikud and tags
  const highlightSnippetInText = (htmlText: string, phraseToHighlight: string): string => {
    const cleanPhrase = phraseToHighlight.trim();
    if (!cleanPhrase || cleanPhrase.length < 1) return htmlText;

    if (htmlText.includes('otzaria-shared-highlight')) return htmlText;

    try {
      const escaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const directRegex = new RegExp(`(${escaped})`, 'gi');
      if (directRegex.test(htmlText)) {
        return htmlText.replace(
          directRegex,
          '<mark class="otzaria-shared-highlight bg-amber-300 dark:bg-amber-500/80 text-amber-950 dark:text-stone-950 px-1 py-0.5 rounded shadow-xs font-semibold ring-2 ring-amber-400/90 transition-all duration-300">$1</mark>'
        );
      }

      const unpointed = stripNikud(cleanPhrase);
      if (unpointed && unpointed.length > 1) {
        const pattern = unpointed
          .split('')
          .map(c => {
            if (/[\u0590-\u05FF]/.test(c)) {
              return c + '[\\u0591-\\u05C7]*';
            }
            if (/\s+/.test(c)) {
              return '\\s+';
            }
            return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('');
        const nikudRegex = new RegExp(`(${pattern})`, 'gi');
        if (nikudRegex.test(htmlText)) {
          return htmlText.replace(
            nikudRegex,
            '<mark class="otzaria-shared-highlight bg-amber-300 dark:bg-amber-500/80 text-amber-950 dark:text-stone-950 px-1 py-0.5 rounded shadow-xs font-semibold ring-2 ring-amber-400/90 transition-all duration-300">$1</mark>'
          );
        }
      }
    } catch (err) {
      console.warn('highlightSnippetInText notice:', err);
    }

    return htmlText;
  };

  // Helper to sanitize and format Otzaria HTML tags and apply text display policies
  const renderFormattedText = (rawText: string, lineIndex?: number) => {
    let text = rawText;

    // 1. Process nikud according to policy
    const policy = settings.nikudPolicy || (showNikud ? 'all' : 'none');
    if (policy === 'none' || (!showNikud && policy !== 'tanakh_only')) {
      text = stripNikud(text);
    }

    // 2. Process Teamim (cantillation marks: \u0591-\u05AF)
    if (settings.showTeamim === false) {
      text = text.replace(/[\u0591-\u05AF]/g, '');
    }

    // 3. Process Punctuation
    if (settings.showPunctuation === false) {
      text = text.replace(/[׃׀]/g, ' ');
    }

    // 4. Holy Name Replacement (שם הוי"ה)
    const replacement = settings.holyNameReplacement || "ה'";
    if (replacement !== 'יהוה') {
      text = text.replace(/(?:יהוה|יְהֹוָה|יְהוָה)/g, replacement);
    }

    // Clean specific Otzaria markers if needed, or leave formatting
    text = text.replace(/&thinsp;/g, ' ').replace(/&nbsp;/g, ' ');

    // Normalize inline header float styles so headers render as clean full-width block elements above text
    text = text
      .replace(/style="([^"]*)\bfloat\s*:\s*(?:right|left|inline-start|inline-end)\s*;?/gi, 'style="$1display: block; width: 100%; clear: both; margin-bottom: 0.35rem;')
      .replace(/style='([^']*)\bfloat\s*:\s*(?:right|left|inline-start|inline-end)\s*;?/gi, "style='$1display: block; width: 100%; clear: both; margin-bottom: 0.35rem;");

    // 5. Highlight shared deep-link word range (if target line) or text snippet if active
    if (activeWordRange && lineIndex !== undefined && lineIndex === initialLine) {
      text = highlightWordRangeInHtml(text, activeWordRange.start, activeWordRange.end);
    } else if (highlightedPhrase && highlightedPhrase.trim()) {
      text = highlightSnippetInText(text, highlightedPhrase);
    } else if (executedInBookSearch.trim()) {
      if (lineIndex !== undefined && searchMatchIndices.includes(lineIndex)) {
        const searchRegex = buildHebrewSearchRegex(executedInBookSearch.trim());
        if (searchRegex) {
          text = highlightSearchText(text, searchRegex);
        }
      }
    }

    // Render HTML safely with book-content-text container for block headers and clear float support
    return <div className="book-content-text break-words" dangerouslySetInnerHTML={{ __html: sanitizeBookHtml(text) }} />;
  };

  // Process lines with accurate chapter, verse and database lineIndex
  const allProcessedLines = useMemo(() => {
    let linesToProcess: Array<{ lineIndex: number; content: string; heRef?: string }> = [];

    if (bookLines && bookLines.length > 0) {
      linesToProcess = bookLines;
    } else if (content) {
      linesToProcess = content.split(/\r?\n/).map((c, i) => ({ lineIndex: i + 1, content: c }));
    }

    let curChapter = 1;
    let curVerse = 0;
    let lastSectionHeader: string | undefined = undefined;

    return linesToProcess
      .map((item, idx) => {
        const lineIndex = item.lineIndex;
        const trimmed = (item.content || '').trim();
        if (!trimmed) return null;

        // Check if this line is a heading (supports attributes like <h2 id="...">)
        const headingMatch = trimmed.match(/^<h([1-6])(?:\s+[^>]*)?>(.*?)<\/h\1>$/i);
        const isHeading = !!headingMatch;
        const headingLevel = headingMatch ? parseInt(headingMatch[1]) : 0;
        const headingText = headingMatch ? headingMatch[2].replace(/<[^>]+>/g, '').trim() : '';

        // Skip redundant main book title ONLY if heading level 1 matches exact book title at very top
        if (isHeading && headingLevel === 1 && headingText === bookTitle && idx === 0) {
          return null;
        }

        if (isHeading) {
          const chapMatch = headingText.match(/(?:פרק|סימן|דף)\s+([א-ת]+)/i);
          if (chapMatch) {
            const num = hebrewToNumber(chapMatch[1]);
            if (num > 0) {
              curChapter = num;
              curVerse = 0;
            }
          }
        } else {
          const verseMatch = trimmed.match(/^\(([א-ת]+)\)|^\b([א-ת]+)\./);
          if (verseMatch) {
            const letter = verseMatch[1] || verseMatch[2];
            const num = hebrewToNumber(letter);
            if (num > 0) {
              curVerse = num;
            } else {
              curVerse++;
            }
          } else {
            curVerse++;
          }
        }

        const fullRef = item.heRef || '';
        const isLongHeader = fullRef.length > 12 || fullRef.includes(',') || fullRef.includes('—');
        const shortVerseLabel = curVerse > 0 ? numberToHebrew(curVerse) : numberToHebrew(lineIndex);
        const verseDisplay = (fullRef && !isLongHeader) ? fullRef : shortVerseLabel;

        let sectionHeader: string | undefined = undefined;
        if (isLongHeader && fullRef) {
          if (fullRef !== lastSectionHeader) {
            sectionHeader = fullRef;
            lastSectionHeader = fullRef;
          }
        }

        const displayText = showNikud ? trimmed : stripNikud(trimmed);
        const isSelected = selectedLineIndex === lineIndex;
        const activeQuery = executedInBookSearch.trim() || initialSearch?.trim() || '';
        const matchesSearch = activeQuery
          ? displayText.toLowerCase().includes(activeQuery.toLowerCase())
          : false;

        return {
          index: lineIndex,
          verseDisplay,
          sectionHeader,
          text: displayText,
          rawText: trimmed,
          isHeading,
          headingLevel,
          headingText,
          isSelected,
          matchesSearch
        };
      })
      .filter(Boolean) as Array<{
        index: number;
        verseDisplay: string;
        sectionHeader?: string;
        text: string;
        rawText: string;
        isHeading: boolean;
        headingLevel: number;
        headingText: string;
        isSelected: boolean;
        matchesSearch: boolean;
      }>;
  }, [bookLines, content, bookTitle, showNikud, selectedLineIndex, executedInBookSearch]);

  const totalLinesCount = totalBookLines > 0 ? totalBookLines : allProcessedLines.length;

  // Render only lines within the active 150-line window
  const processedLines = allProcessedLines.filter(
    line => line.index >= startLineIndex && line.index <= endLineIndex
  );

  const isDark = settings.theme === 'dark';
  const isSepia = settings.theme === 'sepia';

  const renderCommentarySettingsPopover = () => {
    const rawAvailableList = Array.from(
      new Set([
        ...availableBookCommentators,
        ...allCommentaries.map(c => c.sourceBook),
        ...commentaries.map(c => c.sourceBook),
        ...enabledCommentaryCategories.filter(c => c !== '__NONE__')
      ])
    ).filter(Boolean);
    const allAvailableList = sortCommentariesByGeneration(rawAvailableList);
    const currentLineCommentatorNames = new Set(
      commentaries.map(c => c.sourceBook || c.category)
    );

    const filteredDisplayList = commentatorSearchFilter.trim()
      ? allAvailableList.filter(c =>
          c.toLowerCase().includes(commentatorSearchFilter.trim().toLowerCase())
        )
      : allAvailableList;

    const isAllEnabled = enabledCommentaryCategories.length === 0;

    return (
      <div className={`p-3.5 ${isDark ? 'bg-stone-900 border-stone-700' : 'bg-amber-50/95 border-amber-200'} rounded-xl border mb-3 shadow-inner select-none animate-in fade-in slide-in-from-top-2 duration-150`}>
        <div className="flex items-center justify-between mb-2">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-amber-300' : 'text-amber-950'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
            <span>בחירת מפרשים מוצגים ({bookTitle})</span>
            <span className={`${isDark ? 'bg-stone-800 text-stone-300' : 'bg-amber-200/70 text-amber-900'} text-[10px] font-normal px-1.5 py-0.2 rounded-full`}>
              {allAvailableList.length} זמינים
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEnabledCommentaryCategories([]);
                localStorage.removeItem(`otzaria_comm_prefs_${bookTitle}`);
              }}
              className="text-[11px] text-amber-600 font-bold hover:underline cursor-pointer"
            >
              בחר הכל
            </button>
            <span className="text-stone-400 text-xs">|</span>
            <button
              onClick={() => {
                const noneArr = ['__NONE__'];
                setEnabledCommentaryCategories(noneArr);
                localStorage.setItem(`otzaria_comm_prefs_${bookTitle}`, JSON.stringify(noneArr));
              }}
              className="text-[11px] text-stone-400 hover:text-stone-300 hover:underline cursor-pointer"
            >
              נקה הכל
            </button>
          </div>
        </div>

        {allAvailableList.length > 6 && (
          <div className="relative mb-2">
            <input
              type="text"
              value={localCommentatorSearchInput}
              onChange={e => setLocalCommentatorSearchInput(e.target.value)}
              placeholder="חיפוש מפרש..."
              className={`w-full text-xs px-2.5 py-1 pr-7 ${isDark ? 'bg-stone-950 border-stone-700 text-stone-100' : 'bg-white border-stone-200 text-stone-800'} border rounded-md focus:outline-none focus:border-amber-500`}
            />
            <Search className="w-3 h-3 text-stone-400 absolute right-2 top-2" />
            {localCommentatorSearchInput && (
              <button
                onClick={() => {
                  setLocalCommentatorSearchInput('');
                  setCommentatorSearchFilter('');
                }}
                className="absolute left-2 top-1.5 text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
          {filteredDisplayList.map(cat => {
            const isChecked =
              isAllEnabled ||
              (enabledCommentaryCategories.includes(cat) &&
                !enabledCommentaryCategories.includes('__NONE__'));

            const hasTextOnCurrentLine =
              currentLineCommentatorNames.has(cat) ||
              commentaries.some(c => c.sourceBook.includes(cat) || cat.includes(c.sourceBook));

            return (
              <label
                key={cat}
                className={`flex items-center justify-between gap-1 p-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                  isChecked
                    ? isDark ? 'bg-stone-800 border-amber-600 font-bold text-stone-100 shadow-2xs' : 'bg-white border-amber-300 font-bold text-stone-900 shadow-2xs'
                    : isDark ? 'bg-stone-950/60 border-stone-800 text-stone-500 opacity-60 hover:opacity-100' : 'bg-stone-100/70 border-stone-200 text-stone-400 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      let next: string[];
                      if (isAllEnabled) {
                        next = allAvailableList.filter(c => c !== cat);
                      } else if (enabledCommentaryCategories.includes(cat)) {
                        next = enabledCommentaryCategories.filter(c => c !== cat && c !== '__NONE__');
                        if (next.length === 0) next = ['__NONE__'];
                      } else {
                        next = enabledCommentaryCategories.filter(c => c !== '__NONE__');
                        next.push(cat);
                        if (next.length >= allAvailableList.length) next = [];
                      }
                      setEnabledCommentaryCategories(next);
                      if (next.length > 0) {
                        localStorage.setItem(
                          `otzaria_comm_prefs_${bookTitle}`,
                          JSON.stringify(next)
                        );
                      } else {
                        localStorage.removeItem(`otzaria_comm_prefs_${bookTitle}`);
                      }
                    }}
                    className="rounded text-amber-800 focus:ring-amber-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="truncate">{cat}</span>
                </div>
                {hasTextOnCurrentLine && (
                  <span className="text-[9px] bg-amber-100 text-amber-900 font-medium px-1 rounded shrink-0">
                    קיים
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCommentariesList = (isInlineMode: boolean) => {
    const baseFiltered = sortCommentariesByGeneration(
      commentaries.filter(c => {
        if (enabledCommentaryCategories.length > 0) {
          if (enabledCommentaryCategories.includes('__NONE__')) return false;
          const isCategoryEnabled =
            enabledCommentaryCategories.includes(c.sourceBook) ||
            enabledCommentaryCategories.includes(c.category) ||
            enabledCommentaryCategories.some(
              cat => c.sourceBook.includes(cat) || cat.includes(c.sourceBook) || cat.includes(c.category)
            );
          if (!isCategoryEnabled) return false;
        }
        return true;
      })
    );

    const activeCommentarySearchQuery = commentaryContentQuery.trim() || executedInBookSearch.trim();
    const searchRegex = buildHebrewSearchRegex(activeCommentarySearchQuery);

    const filtered = commentaryContentQuery.trim() && searchRegex
      ? baseFiltered.filter(c => {
          const name = c.sourceBook || c.category || '';
          const dh = c.dibburHamatchil || '';
          const txt = c.text || '';
          searchRegex.lastIndex = 0;
          if (searchRegex.test(name)) return true;
          searchRegex.lastIndex = 0;
          if (searchRegex.test(dh)) return true;
          searchRegex.lastIndex = 0;
          return searchRegex.test(txt);
        })
      : baseFiltered;

    if (filtered.length === 0) {
      return (
        <div className={`text-center py-6 sm:py-8 ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
          <BookOpen className={`w-7 h-7 mx-auto mb-2 ${isDark ? 'text-stone-600' : 'text-stone-300'}`} />
          <p className="text-xs font-serif font-bold">
            {commentaryContentQuery.trim()
              ? `לא נמצאו תוצאות עבור "${commentaryContentQuery}"`
              : 'אין מפרשים מוצגים לפי הסינון הנוכחי'}
          </p>
          <p className="text-[11px] text-stone-400 mt-1">
            {commentaryContentQuery.trim()
              ? 'נסה לחפש מילה אחרת או נקה את שורת החיפוש'
              : 'לחץ על שורה או פסוק אחר בספר כדי לראות את המפרשים המקבילים'}
          </p>
        </div>
      );
    }

    const commFontFamily = getFontFamilyCss(settings.commentaryFontFamily, true);
    const commFontSize = settings.commentaryFontSize || Math.max(14, fontSize - 3);

    const items = filtered.map((com, idx) => {
      const itemKey = `comm_${idx}`;
      const isSearching = Boolean(searchRegex);

      const isCurrentActiveMatchComm = Boolean(
        currentMatch &&
        currentMatch.isCommentary &&
        currentMatch.lineIndex === selectedLineIndex &&
        (currentMatch.sourceTitle === com.sourceBook || currentMatch.sourceTitle === com.category)
      );

      let isFullyOpen = false;
      let isFullyClosed = false;

      if (isCurrentActiveMatchComm) {
        isFullyOpen = true;
        isFullyClosed = false;
      } else if (isSearching) {
        if (expandedDuringSearch[itemKey] !== undefined) {
          isFullyOpen = expandedDuringSearch[itemKey];
          isFullyClosed = !expandedDuringSearch[itemKey];
        } else if (searchViewMode === 'fully_expanded') {
          isFullyOpen = true;
        } else if (searchViewMode === 'fully_collapsed') {
          isFullyClosed = true;
        }
      } else {
        if (commentariesGlobalState === 'collapsed') {
          isFullyClosed = true;
        } else if (commentariesGlobalState === 'expanded') {
          isFullyClosed = false;
        } else {
          isFullyClosed = Boolean(collapsedItems[itemKey]);
        }
        isFullyOpen = !isFullyClosed;
      }

      const snippetInfo = isSearching && searchRegex
        ? extractSearchSnippet(com.text, searchRegex)
        : null;

      return (
        <div
          key={idx}
          id={`comm-card-${idx}`}
          className={`border rounded-xl transition-all shadow-2xs overflow-hidden ${
            isCurrentActiveMatchComm
              ? 'ring-2 ring-amber-500 border-amber-400 bg-amber-50/90 dark:bg-amber-950/40 shadow-sm'
              : isDark
              ? 'bg-[#18110D] border-stone-800 hover:border-amber-800/60'
              : 'bg-white border-amber-200/80 hover:border-amber-300'
          }`}
          style={{
            fontFamily: commFontFamily,
            fontWeight: settings.commentaryFontBold ? 700 : 400
          }}
        >
          {/* Header with Collapsible Toggle */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setCommentariesGlobalState('manual');
              if (isSearching) {
                setExpandedDuringSearch(prev => ({
                  ...prev,
                  [itemKey]: !isFullyOpen
                }));
              } else {
                setCollapsedItems(prev => ({
                  ...prev,
                  [itemKey]: !isFullyClosed
                }));
              }
            }}
            className={`p-2.5 sm:p-3 flex items-center justify-between cursor-pointer select-none transition-colors ${
              isCurrentActiveMatchComm
                ? 'bg-amber-100/70 dark:bg-amber-900/40'
                : isDark ? 'hover:bg-stone-900/60' : 'hover:bg-amber-50/40'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 pr-0.5">
              <span className="text-stone-400 shrink-0">
                {isFullyClosed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </span>
              <span className={`text-xs font-bold font-serif truncate ${isDark ? 'text-amber-200' : 'text-amber-950'}`}>
                <span className="font-black text-amber-700 dark:text-amber-400">
                  {com.sourceBook || com.category}:
                </span>{' '}
                {isCurrentActiveMatchComm && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-stone-950 text-[10px] font-bold font-sans shadow-2xs mr-1 animate-pulse">
                    ✨ תוצאת חיפוש
                  </span>
                )}
                {com.dibburHamatchil && (
                  <span
                    className={`font-semibold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeBookHtml(highlightSearchText(com.dibburHamatchil, searchRegex))
                    }}
                  />
                )}
              </span>
            </div>
          </div>

          {/* Content Body */}
          {!isFullyClosed && (
            <div
              className={`px-3.5 pb-3.5 pt-1 text-xs leading-relaxed font-serif border-t ${
                isDark ? 'text-stone-200 border-stone-800' : 'text-stone-800 border-stone-100'
              }`}
            >
              {isSearching && !isFullyOpen && snippetInfo ? (
                <div>
                  <div
                    className={`p-2 rounded-lg border italic leading-relaxed ${
                      isDark ? 'bg-amber-950/20 border-amber-900/40 text-stone-300' : 'bg-amber-50/40 border-amber-200/60 text-stone-700'
                    }`}
                    style={{ fontSize: `${commFontSize}px` }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeBookHtml(highlightSearchText(snippetInfo.snippet, searchRegex))
                    }}
                  />
                  <div className="flex items-center justify-between mt-2 pt-1 text-[11px]">
                    {snippetInfo.totalMatches > 1 ? (
                      <span className="bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-sans font-semibold px-2 py-0.5 rounded-full text-[10px]">
                        + עוד {snippetInfo.totalMatches - 1} תוצאות במפרש זה
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDuringSearch(prev => ({
                          ...prev,
                          [itemKey]: true
                        }));
                      }}
                      className="text-amber-800 dark:text-amber-300 hover:underline font-bold font-sans text-[11px] cursor-pointer"
                    >
                      פתח פירוש מלא ▾
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{ fontSize: `${commFontSize}px` }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeBookHtml(highlightSearchText(com.text, searchRegex))
                    }}
                  />
                  {isSearching && (
                    <div className="mt-2 pt-1 border-t border-stone-200/50 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDuringSearch(prev => ({
                            ...prev,
                            [itemKey]: false
                          }));
                        }}
                        className="text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 font-sans text-[11px] underline cursor-pointer"
                      >
                        הצג תקציר בלבד ▴
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });

    const hiddenCount = allCommentaries.length - filtered.length;
    return (
      <>
        {items}
        {hiddenCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCommentaries(allCommentaries);
            }}
            className={`w-full py-2 px-3 text-center text-xs font-serif font-bold rounded-xl transition-colors cursor-pointer shadow-2xs mt-2 ${
              isDark
                ? 'text-amber-300 bg-amber-950/60 hover:bg-amber-950 border border-amber-900'
                : 'text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300'
            }`}
          >
            + הצג עוד {hiddenCount} מפרשים נוספים של הדף
          </button>
        )}
      </>
    );
  };

  if (isLoading) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-8 ${isDark ? 'bg-[#18110D] text-stone-300' : 'bg-[#FAF8F5] text-stone-700'}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-800 border-t-transparent mb-3" />
        <p className={`text-sm font-serif font-bold ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
          טוען את הספר {bookTitle}...
        </p>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col h-full ${isDark ? 'bg-[#18110D] text-stone-100' : isSepia ? 'bg-[#FAF6EE] text-stone-900' : 'bg-[#FAF8F5] text-stone-900'} overflow-hidden`}>
      {/* Top Book Toolbar (סרגל הכלים של הספר באוצרייה) */}
      <div className={`${isDark ? 'bg-[#211711] border-stone-800 text-stone-200' : 'bg-white border-stone-200 text-stone-900'} border-b px-4 py-2 flex items-center justify-between shadow-xs z-10`}>
        {/* Right side: TOC Toggle, Title & Chapter Breadcrumb */}
        <div className="flex items-center gap-2">
          {/* Table of Contents Button */}
          <button
            onClick={() => setShowTocPanel(!showTocPanel)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              showTocPanel
                ? 'bg-amber-800 border-amber-800 text-white'
                : isDark
                ? 'bg-stone-800/80 hover:bg-stone-700 border-stone-700 text-stone-200'
                : 'bg-stone-50 hover:bg-stone-100 border-stone-300 text-stone-700'
            }`}
            title="תוכן עניינים (ראשי פרקים)"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">ראשי פרקים</span>
          </button>

          <div className={`h-4 w-px ${isDark ? 'bg-stone-700' : 'bg-stone-200'} mx-1`} />

          {/* Book Title */}
          <div className="flex items-center gap-2">
            <h2 className={`text-sm font-bold font-serif ${isDark ? 'text-amber-200' : 'text-stone-900'} truncate max-w-[200px] sm:max-w-none`}>
              {bookTitle}
            </h2>
            {selectedLineIndex && (
              <span className={`text-[11px] ${isDark ? 'text-amber-300 bg-amber-950/80 border-amber-800/80' : 'text-amber-800 bg-amber-50 border-amber-200/80'} border px-2 py-0.5 rounded-full font-medium font-serif`}>
                סעיף {numberToHebrew(selectedLineIndex)}
              </span>
            )}
          </div>
        </div>

        {/* Center / Left: Search, Font size, Nikud, Split commentary toggle */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* In-Book Search Toggle */}
          <button
            onClick={() => setShowInBookSearchBox(!showInBookSearchBox)}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              showInBookSearchBox || executedInBookSearch
                ? 'bg-amber-800 border-amber-700 text-white'
                : isDark
                ? 'bg-stone-800/80 hover:bg-stone-700 border-stone-700 text-stone-300'
                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
            }`}
            title="חיפוש בתוך הספר"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Font Controls */}
          <div className={`flex items-center ${isDark ? 'bg-stone-800/80 border-stone-700' : 'bg-stone-50 border-stone-200'} border rounded-lg p-0.5`}>
            <button
              onClick={() => setFontSize(s => Math.min(36, s + 2))}
              className={`p-1 ${isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-200/70 text-stone-700'} rounded cursor-pointer`}
              title="הגדל גופן"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className={`text-[11px] font-mono px-1.5 ${isDark ? 'text-stone-300' : 'text-stone-600'} select-none`}>
              {fontSize}
            </span>
            <button
              onClick={() => setFontSize(s => Math.max(14, s - 2))}
              className={`p-1 ${isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-200/70 text-stone-700'} rounded cursor-pointer`}
              title="הקטן גופן"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nikud Toggle (אל"ף מנוקדת) */}
          <button
            onClick={() => setShowNikud(!showNikud)}
            className={`px-2 py-1 rounded-lg border text-xs font-serif font-bold transition-colors cursor-pointer ${
              showNikud
                ? 'bg-amber-800 border-amber-800 text-white'
                : isDark
                ? 'bg-stone-800/80 hover:bg-stone-700 border-stone-700 text-stone-300'
                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
            }`}
            title={showNikud ? 'הסתר ניקוד וטעמים' : 'הצג ניקוד וטעמים'}
          >
            אָ
          </button>

          {/* Tzurat HaDaf Button - Only for Talmud Bavli */}
          {isShasBook && (
            <button
              onClick={() => {
                const activeLine = selectedLineIndex || startLineIndex || 1;
                const resolvedDaf = isShasBook
                  ? resolveTalmudDafForLine(activeLine, toc, bookLines, allProcessedLines)
                  : null;
                const dafLabel = resolvedDaf?.dafLabel || selectedVerseInfo?.dafLabel;
                if (resolvedDaf && resolvedDaf.dafLabel !== selectedVerseInfo?.dafLabel) {
                  setSelectedVerseInfo({ dafLabel: resolvedDaf.dafLabel });
                }
                const dafToPass = dafLabel || 'דף ב ע״א';
                if (onOpenTzuratHaDaf) {
                  onOpenTzuratHaDaf(bookTitle, dafToPass, bookId);
                } else {
                  setIsTzuratHaDafOpen(true);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-on-variant transition hover:bg-surface-3"
              title="פתח צורת הדף"
            >
              <BookOpen className="w-3.5 h-3.5 text-on-variant" />
              <span>צורת הדף</span>
            </button>
          )}

          {/* Commentary Split Toggle Button (כמו באוצרייה: פאנל קישורים ומפרשים) */}
          <button
            onClick={() => setShowCommentaryPanel(!showCommentaryPanel)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              showCommentaryPanel
                ? 'bg-amber-800 border-amber-800 text-white shadow-xs'
                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
            }`}
            title="מפרשים וקישורים"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">מפרשים</span>
            {commentaries.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${showCommentaryPanel ? 'bg-amber-950 text-white' : 'bg-stone-200 text-stone-700'}`}>
                {commentaries.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Floating In-Book Search Bar */}
      {showInBookSearchBox && (
        <div className="bg-amber-100/95 dark:bg-stone-900/95 border-b border-amber-300 dark:border-stone-800 px-4 sm:px-6 py-2.5 flex flex-col gap-2 animate-fadeIn shadow-sm z-20">
          {/* Top row: search input, search button, scope toggle, clear, close */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-2xl">
              <Search className="w-4 h-4 text-amber-900 dark:text-amber-200 shrink-0" />
              <input
                type="text"
                value={inBookSearchInput}
                onChange={e => {
                  setInBookSearchInput(e.target.value);
                  setInBookSearchError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (inBookSearchInput.trim() === executedInBookSearch && filteredSearchMatches.length > 0) {
                      if (e.shiftKey) {
                        handlePrevSearchMatch();
                      } else {
                        handleNextSearchMatch();
                      }
                    } else {
                      executeInBookSearch();
                    }
                  }
                }}
                placeholder="חפש מילים בספר (Enter לחיפוש / ניווט הבא)..."
                className="w-full bg-white dark:bg-stone-800 border border-amber-300 dark:border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-700 font-serif"
                autoFocus
              />
              <button
                onClick={() => executeInBookSearch()}
                disabled={isInBookSearching}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white text-xs font-bold font-serif rounded-lg transition-colors shrink-0 cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                {isInBookSearching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>מחפש...</span>
                  </>
                ) : (
                  <span>חפש</span>
                )}
              </button>



              {(inBookSearchInput || executedInBookSearch) && (
                <button
                  onClick={() => {
                    setInBookSearchInput('');
                    setExecutedInBookSearch('');
                    setInBookMatches([]);
                    setCurrentMatchPointer(0);
                    setShowSearchResultsList(false);
                    setInBookSearchError(null);
                  }}
                  className="text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 shrink-0 cursor-pointer px-1"
                >
                  נקה
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setShowInBookSearchBox(false);
                setInBookSearchInput('');
                setExecutedInBookSearch('');
                setInBookMatches([]);
                setCurrentMatchPointer(0);
                setShowSearchResultsList(false);
                setInBookSearchError(null);
              }}
              className="text-xs text-amber-900 dark:text-amber-200 font-semibold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
            >
              <span>סגור</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bottom row: results tabs (all / book / commentaries), navigation counter & active item tag */}
          {executedInBookSearch && !isInBookSearching && inBookMatches.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/80 dark:border-stone-800/80 text-xs">
              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-stone-500 dark:text-stone-400 font-serif ml-1 select-none">
                  סינון תוצאות:
                </span>
                <button
                  onClick={() => handleSelectFilter('all')}
                  className={`px-2 py-0.5 rounded-md font-sans text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                    searchResultFilter === 'all'
                      ? 'bg-amber-800 text-white font-bold shadow-2xs'
                      : 'bg-white/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-amber-200/60 border border-amber-300/60 dark:border-stone-700'
                  }`}
                >
                  <span>הכל</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15">
                    {inBookMatches.length}
                  </span>
                </button>
                <button
                  onClick={() => handleSelectFilter('book')}
                  className={`px-2 py-0.5 rounded-md font-sans text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                    searchResultFilter === 'book'
                      ? 'bg-amber-800 text-white font-bold shadow-2xs'
                      : 'bg-white/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-amber-200/60 border border-amber-300/60 dark:border-stone-700'
                  }`}
                  title="הצג רק תוצאות מגוף הספר"
                >
                  <BookOpen className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>רק בספר</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15">
                    {bookMatchesCount}
                  </span>
                </button>
                <button
                  onClick={() => handleSelectFilter('commentaries')}
                  className={`px-2 py-0.5 rounded-md font-sans text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                    searchResultFilter === 'commentaries'
                      ? 'bg-amber-800 text-white font-bold shadow-2xs'
                      : 'bg-white/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-amber-200/60 border border-amber-300/60 dark:border-stone-700'
                  }`}
                  title="הצג רק תוצאות מתוך מפרשי הספר"
                >
                  <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>במפרשים</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15">
                    {commMatchesCount}
                  </span>
                </button>
              </div>

              {/* Navigation Counter, active item info and list drawer toggle */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Active match location indicator */}
                {currentMatch && (
                  <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full border border-amber-300/80 dark:border-stone-700 bg-white/90 dark:bg-stone-800 text-amber-950 dark:text-amber-200 flex items-center gap-1">
                    {currentMatch.isCommentary ? (
                      <>
                        <span className="text-amber-700 dark:text-amber-400 font-bold">📑 מפרש:</span>
                        <span className="font-bold">{currentMatch.sourceTitle || 'מפרש'}</span>
                        <span className="text-stone-400">(שורה {numberToHebrew(currentMatch.lineIndex)})</span>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-800 dark:text-amber-300 font-bold">📖 בספר:</span>
                        <span>שורה {numberToHebrew(currentMatch.lineIndex)}</span>
                        {currentMatch.heRef && <span className="text-stone-400">• {currentMatch.heRef}</span>}
                      </>
                    )}
                  </span>
                )}

                {/* Match Counter */}
                <span className="text-xs text-amber-950 dark:text-amber-200 font-sans font-semibold shrink-0 px-1">
                  {filteredSearchMatches.length > 0
                    ? `${currentMatchPointer + 1} מתוך ${filteredSearchMatches.length}`
                    : 'אין תוצאות במסנן זה'}
                </span>

                {/* Next / Prev buttons */}
                {filteredSearchMatches.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={handlePrevSearchMatch}
                      className="p-1 rounded bg-white dark:bg-stone-800 hover:bg-amber-200 dark:hover:bg-stone-700 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-100 transition-colors cursor-pointer"
                      title="תוצאה קודמת (Shift+Enter)"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNextSearchMatch}
                      className="p-1 rounded bg-white dark:bg-stone-800 hover:bg-amber-200 dark:hover:bg-stone-700 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-100 transition-colors cursor-pointer"
                      title="תוצאה הבאה (Enter)"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Results List Toggle */}
                {filteredSearchMatches.length > 0 && (
                  <button
                    onClick={() => setShowSearchResultsList(!showSearchResultsList)}
                    className="px-2 py-1 rounded bg-white dark:bg-stone-800 hover:bg-amber-200/80 dark:hover:bg-stone-700 border border-amber-300 dark:border-stone-700 text-[11px] font-sans text-amber-950 dark:text-amber-200 cursor-pointer flex items-center gap-1"
                  >
                    <span>רשימת תוצאות</span>
                    {showSearchResultsList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          )}



          {/* Results List Drawer (Dropdown preview of all matches) */}
          {showSearchResultsList && filteredSearchMatches.length > 0 && (
            <div className="mt-1 max-h-56 overflow-y-auto bg-white dark:bg-stone-850 rounded-xl border border-amber-300 dark:border-stone-700 shadow-md p-2 space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-1 border-b border-stone-200 dark:border-stone-700 text-[11px] text-stone-500 font-sans px-1">
                <span>סה״כ {filteredSearchMatches.length} תוצאות ({searchResultFilter === 'all' ? 'הכל' : searchResultFilter === 'book' ? 'בספר' : 'במפרשים'})</span>
                <button
                  onClick={() => setShowSearchResultsList(false)}
                  className="hover:text-stone-800 dark:hover:text-stone-300 cursor-pointer"
                >
                  סגור רשימה ✕
                </button>
              </div>
              {filteredSearchMatches.map((m, idx) => {
                const isActive = idx === currentMatchPointer;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectMatch(idx)}
                    className={`w-full text-right p-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                      isActive
                        ? 'bg-amber-100 dark:bg-amber-950/80 border border-amber-400 dark:border-amber-700 font-bold'
                        : 'hover:bg-amber-50 dark:hover:bg-stone-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold flex items-center gap-1 text-amber-900 dark:text-amber-300">
                        {m.isCommentary ? (
                          <>
                            <span>📑 {m.sourceTitle || 'מפרש'}</span>
                            <span className="text-[10px] text-stone-500 font-normal">(על שורה {numberToHebrew(m.lineIndex)})</span>
                          </>
                        ) : (
                          <>
                            <span>📖 בספר</span>
                            <span className="text-[10px] text-stone-500 font-normal">(שורה {numberToHebrew(m.lineIndex)}{m.heRef ? ` • ${m.heRef}` : ''})</span>
                          </>
                        )}
                      </span>
                      <span className="text-[10px] text-stone-400 font-sans">#{idx + 1}</span>
                    </div>
                    <div
                      className="text-stone-700 dark:text-stone-300 font-serif text-[11px] leading-relaxed truncate"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeBookHtml(highlightSearchText(m.commentarySnippet || m.content, buildHebrewSearchRegex(executedInBookSearch)))
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {inBookSearchError && (
            <div className="text-xs font-bold text-red-600 dark:text-red-400 px-1">
              ⚠️ {inBookSearchError}
            </div>
          )}
        </div>
      )}

      {/* Shared Deep Link Highlight Banner */}
      {highlightedPhrase && (
        <div className="bg-amber-100/95 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-800 px-6 py-2.5 flex items-center justify-between text-amber-950 dark:text-amber-200 text-xs font-serif shadow-xs animate-in fade-in duration-200 z-10">
          <div className="flex items-center gap-2 overflow-hidden">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-semibold shrink-0">הגעת באמצעות קישור ישיר לקטע מודגש:</span>
            <span className="font-bold truncate max-w-md">"{highlightedPhrase}"</span>
          </div>
          <button
            onClick={() => setHighlightedPhrase(undefined)}
            className="p-1 hover:bg-amber-200 dark:hover:bg-amber-900 rounded-lg transition-colors cursor-pointer text-stone-600 dark:text-stone-300 flex items-center gap-1 text-[11px]"
            title="נקה הדגשה"
          >
            <span>נקה הדגשה</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Location Navigation Banner (from Daily Study or TOC Jump) */}
      {locationNavMessage && (
        <div className="bg-amber-100/90 dark:bg-amber-950/80 border-b border-amber-300 dark:border-amber-800 px-6 py-2 flex items-center justify-between text-amber-950 dark:text-amber-200 text-xs font-serif shadow-xs animate-in fade-in duration-200 z-10">
          <div className="flex items-center gap-2">
            <span className="text-base">📍</span>
            <span className="font-bold">{locationNavMessage}</span>
          </div>
          <button
            onClick={() => setLocationNavMessage(null)}
            className="p-1 hover:bg-amber-200 dark:hover:bg-amber-900 rounded-lg transition-colors cursor-pointer text-stone-600 dark:text-stone-300"
            title="סגור"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Reading Canvas & Side Panels */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Table of Contents Drawer (TOC) */}
        {showTocPanel && (
          <aside className={`w-64 ${isDark ? 'bg-[#1C140F] border-stone-800 text-stone-200' : 'bg-white border-stone-200 text-stone-900'} border-l flex flex-col p-4 shrink-0 shadow-md z-20`}>
            <div className={`flex items-center justify-between pb-2 ${isDark ? 'border-stone-800' : 'border-stone-100'} mb-2 border-b`}>
              <h3 className={`text-xs font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'} font-serif flex items-center gap-1.5`}>
                <List className="w-3.5 h-3.5 text-amber-500" />
                <span>תוכן עניינים</span>
              </h3>
              <button
                onClick={() => setShowTocPanel(false)}
                className="text-stone-400 hover:text-stone-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 text-xs font-serif pr-1">
              {toc.length === 0 ? (
                <div className="text-stone-500 text-center py-6">
                  לא קיים תוכן עניינים מפורט
                </div>
              ) : (
                toc.map((node, i) => {
                  const actualLine = resolveActualBookLine(node, toc, bookLines, totalBookLines);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        scrollToLine(actualLine);
                        setShowTocPanel(false);
                      }}
                      className={`w-full text-right px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                        selectedLineIndex === actualLine
                          ? isDark
                            ? 'bg-amber-900/80 text-amber-100 font-bold'
                            : 'bg-amber-100 text-amber-950 font-bold'
                          : isDark
                          ? 'hover:bg-stone-800 text-stone-300'
                          : 'hover:bg-stone-100 text-stone-700'
                      }`}
                    >
                      <span className="truncate">{node.title}</span>
                      <span className={`text-[10px] ${isDark ? 'text-stone-500' : 'text-stone-400'} font-sans mr-2 shrink-0`}>
                        {numberToHebrew(actualLine)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Center: Book Text Content Canvas */}
        <main
          ref={linesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 md:p-10 select-text"
          style={{
            fontFamily: getFontFamilyCss(settings.fontFamily, false),
            fontWeight: settings.fontBold ? 700 : 400,
            backgroundColor: isDark ? '#18110D' : isSepia ? '#FAF6EE' : '#FFFFFF',
            color: isDark ? '#F5F5F4' : '#1C1917'
          }}
        >
          <div
            className="mx-auto space-y-3"
            style={{
              maxWidth: settings.textMaxWidth === '100%' ? '100%' : (settings.textMaxWidth || '90%'),
              lineHeight: settings.lineHeight || 1.8
            }}
          >
            {/* Book Title Banner */}
            <div className={`text-center pb-6 border-b ${isDark ? 'border-stone-800' : 'border-stone-200/80'} mb-6`}>
              <h1
                className={`text-2xl md:text-3xl font-black ${isDark ? 'text-amber-200' : 'text-stone-900'} tracking-wide`}
                style={{ fontFamily: getFontFamilyCss(settings.fontFamily, false) }}
              >
                {bookTitle}
              </h1>
              <div className="w-16 h-0.5 bg-amber-800/40 mx-auto mt-3" />
            </div>

            {/* Top Sentinel for seamless backwards loading */}
            <div ref={topSentinelRef} className="h-0.5 w-full pointer-events-none opacity-0" aria-hidden="true" />

            {/* Top Previous Lines Loading Indicator */}
            {startLineIndex > 1 && (
              <div className={`text-center py-4 border-b ${isDark ? 'border-stone-800/60' : 'border-stone-200/60'} mb-4 flex flex-col items-center gap-2 select-none`}>
                <div className="flex items-center gap-2 text-stone-400 font-serif text-xs">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-800 border-t-transparent" />
                  <span>
                    ישנן עוד {startLineIndex - 1} שורות קודמות בספר (גלילה למעלה טוענת אוטומטית)
                  </span>
                </div>
                <button
                  onClick={loadPreviousLines}
                  className={`px-3 py-1.5 ${isDark ? 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700' : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'} border rounded-lg text-xs font-serif font-bold transition-colors shadow-xs active:scale-95 cursor-pointer`}
                >
                  טען 150 שורות קודמות
                </button>
              </div>
            )}

            {/* Render Lines */}
            {processedLines.map(line => {
              const isSearchMatch = searchMatchIndices.includes(line.index);
              const isCurrentActiveMatch = currentMatch ? currentMatch.lineIndex === line.index : false;

              if (line.isHeading) {
                return (
                  <div
                    key={line.index}
                    id={`reader-line-${line.index}`}
                    onClick={() => handleLineClick(line.index)}
                    className={`text-center my-1.5 py-0.5 px-2 cursor-pointer transition-colors ${
                      line.isSelected
                        ? isDark
                          ? 'bg-stone-800/60 text-stone-200 rounded-lg'
                          : 'bg-stone-200/70 text-stone-800 rounded-lg'
                        : isDark
                        ? 'hover:bg-stone-800/30 text-stone-400'
                        : 'hover:bg-stone-100/50 text-stone-500'
                    }`}
                  >
                    <h2
                      className={`text-sm md:text-base font-semibold tracking-wide ${
                        isDark ? 'text-stone-400' : 'text-stone-500'
                      }`}
                      style={{ fontFamily: getFontFamilyCss(settings.fontFamily, false) }}
                    >
                      {line.headingText || line.text}
                    </h2>
                  </div>
                );
              }

              return (
                <React.Fragment key={line.index}>
                  <div
                    id={`reader-line-${line.index}`}
                    onClick={() => handleLineClick(line.index)}
                  className={`group relative p-3 rounded-xl transition-all cursor-pointer leading-relaxed ${
                    line.isSelected
                      ? isDark
                        ? 'bg-amber-950/90 text-amber-50 ring-2 ring-amber-500 shadow-sm'
                        : 'bg-amber-100/90 text-stone-950 ring-2 ring-amber-500/90 shadow-sm'
                      : isCurrentActiveMatch
                      ? 'bg-yellow-400 text-stone-950 ring-2 ring-yellow-500 shadow-sm font-bold'
                      : isSearchMatch
                      ? isDark
                        ? 'bg-yellow-950/80 text-amber-100'
                        : 'bg-yellow-100/90 text-stone-950'
                      : isDark
                      ? 'hover:bg-stone-800/60 text-stone-200'
                      : 'hover:bg-amber-50/50 text-stone-900'
                  }`}
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: settings.lineHeight || 1.8
                  }}
                >
                  {/* Long Section Header / Book Reference rendered above the line text */}
                  {line.sectionHeader && (
                    <div className="text-[10px] md:text-[11px] font-normal font-sans mb-0.5 leading-tight select-none text-stone-400 dark:text-stone-500">
                      {line.sectionHeader}
                    </div>
                  )}

                  <div className="flex items-start gap-2.5">
                    {/* Verse/Line Number in Hebrew */}
                    <span
                      className={`text-xs font-bold pt-1 select-none shrink-0 ${
                        line.isSelected
                          ? isDark ? 'text-amber-300 font-black' : 'text-amber-900 font-black'
                          : isDark ? 'text-stone-500' : 'text-stone-400'
                      }`}
                      style={{ fontSize: `${Math.max(12, fontSize * 0.65)}px` }}
                    >
                      {line.verseDisplay}
                    </span>

                    {/* Main Line Text */}
                    <div
                      className="flex-1 break-words select-text"
                      style={{
                        fontFamily: getFontFamilyCss(settings.fontFamily, false),
                        fontWeight: settings.fontBold ? 700 : 400
                      }}
                    >
                      {renderFormattedText(line.rawText, line.index)}
                    </div>
                  </div>

                  {/* Hover action menu for this line */}
                  <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-all duration-150 flex items-center gap-1 border rounded-lg p-1 shadow-sm select-none z-10 bg-white/95 dark:bg-stone-800/95 border-stone-200 dark:border-stone-700">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleShareTextFragment(line.index);
                      }}
                      className={`p-1 flex items-center gap-1 ${
                        isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-100 text-stone-600'
                      } rounded cursor-pointer transition-colors`}
                      title="שתף קישור ישיר לשורה זו"
                    >
                      {shareLinkCopiedLine === line.index ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleCopyLineAsLink(line.rawText, line.index);
                      }}
                      className={`p-1 ${isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-100 text-stone-600'} rounded cursor-pointer`}
                      title="העתק שורה כקישור (טקסט לחיץ)"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleCopyLine(line.rawText, line.index);
                      }}
                      className={`p-1 ${isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-100 text-stone-600'} rounded cursor-pointer`}
                      title="העתק שורה"
                    >
                      {copiedLine === line.index ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleBookmarkCurrentLine(line.index, line.rawText);
                      }}
                      className={`p-1 ${isDark ? 'hover:bg-stone-700 text-stone-300' : 'hover:bg-stone-100 text-stone-600'} rounded cursor-pointer`}
                      title="שמור בסימניות"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Commentary Block (under current line for mobile or when inline mode selected) */}
                {line.isSelected && isInlineCommentary && showCommentaryPanel && (
                  <div
                    id={`inline-commentary-${line.index}`}
                    className={`my-3 p-3.5 sm:p-4 rounded-xl border select-text shadow-sm ${
                      isDark
                        ? 'bg-[#1C140F] border-amber-900/60 text-stone-100'
                        : 'bg-amber-50/85 border-amber-200/90 text-stone-900'
                    }`}
                  >
                    {/* Inline Header */}
                    <div className={`flex items-center justify-between pb-2 mb-2.5 border-b ${
                      isDark ? 'border-amber-900/40' : 'border-amber-200/60'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                        <span className={`text-xs font-bold font-serif ${isDark ? 'text-amber-300' : 'text-amber-950'}`}>
                          מפרשים וקישורים {selectedVerseInfo?.dafLabel ? `(${selectedVerseInfo.dafLabel})` : selectedVerseInfo?.verse ? `(פסוק ${numberToHebrew(selectedVerseInfo.verse)})` : `(שורה ${numberToHebrew(line.index)})`}
                        </span>
                        {commentaries.length > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isDark ? 'bg-amber-950 text-amber-300 border border-amber-800/60' : 'bg-amber-100 text-amber-900'
                          }`}>
                            {commentaries.length} מפרשים
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCommentarySettings(!showCommentarySettings);
                          }}
                          className={`p-1 rounded-md border text-xs cursor-pointer ${
                            showCommentarySettings
                              ? 'bg-amber-800 text-white border-amber-800'
                              : isDark
                              ? 'bg-stone-800 border-stone-700 text-stone-300'
                              : 'bg-white border-stone-200 text-stone-700'
                          }`}
                          title="סינון מפרשים"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCommentaryPanel(false);
                          }}
                          className={`p-1 rounded-md cursor-pointer ${
                            isDark ? 'text-stone-400 hover:text-stone-200 hover:bg-stone-800' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/60'
                          }`}
                          title="סגור מפרשים"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Filter Dialog if open */}
                    {showCommentarySettings && renderCommentarySettingsPopover()}

                    {/* In-commentary search bar if > 2 commentaries */}
                    {commentaries.length > 2 && (
                      <div className="relative mb-3">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2 pointer-events-none" />
                        <input
                          type="text"
                          value={localCommentaryContentInput}
                          onChange={e => setLocalCommentaryContentInput(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          placeholder="חיפוש מפרש או מילה בפירושים..."
                          className={`w-full text-xs pl-7 pr-8 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-600 ${
                            isDark
                              ? 'bg-stone-900 border-stone-700 text-stone-100 placeholder-stone-500'
                              : 'bg-white border-stone-300 text-stone-900 placeholder-stone-400'
                          }`}
                        />
                        {localCommentaryContentInput && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocalCommentaryContentInput('');
                              setCommentaryContentQuery('');
                            }}
                            className="absolute left-2 top-1.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Commentaries list */}
                    <div className="space-y-2.5">
                      {renderCommentariesList(true)}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

            {/* Bottom Sentinel for seamless forward prefetching and instant jump detection */}
            <div ref={bottomSentinelRef} className="h-0.5 w-full pointer-events-none opacity-0" aria-hidden="true" />

            {/* Incremental Scroll Loading Indicator / Manual Load / Book Complete Banner */}
            {totalBookLines === 0 || endLineIndex < totalBookLines ? (
              <div className="text-center py-6 border-t border-stone-200/60 dark:border-stone-800/60 my-4 flex flex-col items-center gap-2 select-none">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-serif text-xs">
                  {isLoadingMoreRef.current && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-800 border-t-transparent" />
                  )}
                  <span>
                    {isLoadingMoreRef.current
                      ? 'טוען שורות נוספות ברקע...'
                      : `מוצגות שורות ${startLineIndex}-${Math.min(endLineIndex, totalBookLines || endLineIndex)}${totalBookLines > 0 ? ` מתוך ${totalBookLines}` : ''}`}
                  </span>
                </div>
                <button
                  onClick={loadNextLines}
                  className={`px-3 py-1.5 ${isDark ? 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700' : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'} border rounded-lg text-xs font-serif font-bold transition-colors shadow-xs active:scale-95 cursor-pointer`}
                >
                  טען 150 שורות נוספות בלחיצה
                </button>
              </div>
            ) : totalBookLines > 0 && processedLines.length > 0 ? (
              <div className="text-center py-8 border-t border-amber-800/20 dark:border-amber-800/30 my-6 flex flex-col items-center gap-2 select-none">
                <div className="w-12 h-0.5 bg-amber-800/30 mx-auto mb-2" />
                <span className={`text-base font-serif font-black ${isDark ? 'text-amber-300' : 'text-amber-950'}`}>
                  תם ונשלם שבח לא-ל בורא עולם
                </span>
                <span className="text-xs text-stone-400 dark:text-stone-500 font-serif">
                  סוף הספר "{bookTitle}" ({totalBookLines} שורות)
                </span>
              </div>
            ) : null}
          </div>
        </main>

        {/* Left Side: Commentary Split Panel (פאנל מפרשים וקישורים באוצרייה בדסקטופ) */}
        {showCommentaryPanel && !isInlineCommentary && (
          <aside className={`w-80 md:w-96 ${isDark ? 'bg-[#1C140F] border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900'} border-r flex flex-col shrink-0 shadow-sm z-10`}>
            {/* Commentary Panel Header */}
            <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/90 gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-amber-800 shrink-0" />
                <h3 className="text-xs font-bold font-serif text-stone-900 truncate">
                  מפרשים וקישורים{' '}
                  {selectedVerseInfo?.dafLabel ? (
                    <span className="text-amber-800 font-black">
                      ({selectedVerseInfo.dafLabel})
                    </span>
                  ) : selectedVerseInfo?.verse ? (
                    <span className="text-amber-800">
                      ({selectedVerseInfo.chapter ? `פרק ${numberToHebrew(selectedVerseInfo.chapter)}, ` : ''}פסוק {numberToHebrew(selectedVerseInfo.verse)})
                    </span>
                  ) : selectedLineIndex ? (
                    <span className="text-amber-800">
                      (שורה {numberToHebrew(selectedLineIndex)})
                    </span>
                  ) : null}
                </h3>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Commentary Settings Button */}
                <button
                  onClick={() => setShowCommentarySettings(!showCommentarySettings)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    showCommentarySettings || enabledCommentaryCategories.length > 0
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                  title="הגדרות סינון מפרשים עבור ספר זה"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setShowCommentaryPanel(false)}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg"
                  title="סגור פאנל מפרשים"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Commentary Search Bar: Search commentator name or text within commentary */}
            <div className="px-3 py-2 bg-stone-50 border-b border-stone-200">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={localCommentaryContentInput}
                  onChange={e => setLocalCommentaryContentInput(e.target.value)}
                  placeholder="חיפוש מפרש או טקסט בתוך הפירושים..."
                  className="w-full pl-7 pr-8 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                />
                {localCommentaryContentInput && (
                  <button
                    onClick={() => {
                      setLocalCommentaryContentInput('');
                      setCommentaryContentQuery('');
                    }}
                    className="absolute left-2 text-stone-400 hover:text-stone-600 cursor-pointer"
                    title="נקה חיפוש"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Commentary Sub-Toolbar (Collapse/Expand All + Exact Match Filter) */}
            {commentaries.length > 0 && (
              <div className="px-3 py-2 bg-stone-100/70 border-b border-stone-200 flex items-center justify-between text-[11px] font-serif select-none">
                <div className="flex items-center gap-1.5">
                  {commentaryContentQuery.trim() ? (
                    <div className="flex items-center gap-1 bg-stone-200/70 p-0.5 rounded-lg border border-stone-300">
                      <button
                        onClick={() => {
                          setSearchViewMode('partial');
                          setExpandedDuringSearch({});
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                          searchViewMode === 'partial'
                            ? 'bg-amber-600 text-white shadow-2xs font-bold'
                            : 'text-stone-700 hover:bg-stone-300/60'
                        }`}
                        title="הצג 5 מילים לפני ואחרי התוצאה"
                      >
                        תקציר חלקי
                      </button>
                      <button
                        onClick={() => {
                          setSearchViewMode('fully_expanded');
                          const allExp: Record<string, boolean> = {};
                          commentaries.forEach((_, i) => (allExp[`comm_${i}`] = true));
                          setExpandedDuringSearch(allExp);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                          searchViewMode === 'fully_expanded'
                            ? 'bg-amber-600 text-white shadow-2xs font-bold'
                            : 'text-stone-700 hover:bg-stone-300/60'
                        }`}
                        title="פתח את כל הפירושים במלואם"
                      >
                        פתח הכל
                      </button>
                      <button
                        onClick={() => {
                          setSearchViewMode('fully_collapsed');
                          setExpandedDuringSearch({});
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors cursor-pointer ${
                          searchViewMode === 'fully_collapsed'
                            ? 'bg-amber-600 text-white shadow-2xs font-bold'
                            : 'text-stone-700 hover:bg-stone-300/60'
                        }`}
                        title="סגור הכל לכותרות בלבד"
                      >
                        סגור הכל
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (commentariesGlobalState === 'collapsed') {
                          setCommentariesGlobalState('expanded');
                        } else {
                          setCommentariesGlobalState('collapsed');
                        }
                        setCollapsedItems({});
                      }}
                      className="px-2 py-0.5 bg-white hover:bg-stone-50 border border-stone-200 rounded text-stone-700 shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      {commentariesGlobalState === 'collapsed' ? (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          <span>פתח הכל</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          <span>סגור הכל</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <span className="text-stone-400 text-[10px]">
                  {commentaries.filter(c => {
                    if (enabledCommentaryCategories.length > 0) {
                      if (enabledCommentaryCategories.includes('__NONE__')) return false;
                      const isCatEnabled =
                        enabledCommentaryCategories.includes(c.sourceBook) ||
                        enabledCommentaryCategories.includes(c.category) ||
                        enabledCommentaryCategories.some(
                          cat => c.sourceBook.includes(cat) || cat.includes(c.sourceBook) || cat.includes(c.category)
                        );
                      if (!isCatEnabled) return false;
                    }
                    if (commentaryContentQuery.trim()) {
                      const regex = buildHebrewSearchRegex(commentaryContentQuery);
                      if (!regex) return true;
                      const name = c.sourceBook || c.category || '';
                      const dh = c.dibburHamatchil || '';
                      const txt = c.text || '';
                      regex.lastIndex = 0;
                      if (regex.test(name)) return true;
                      regex.lastIndex = 0;
                      if (regex.test(dh)) return true;
                      regex.lastIndex = 0;
                      return regex.test(txt);
                    }
                    return true;
                  }).length} מפרשים
                </span>
              </div>
            )}

            {/* Commentary Settings Dialog Popover */}
            {showCommentarySettings && renderCommentarySettingsPopover()}

            {/* Commentary Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {renderCommentariesList(false)}
            </div>
          </aside>
        )}
      </div>

      {/* Tzurat HaDaf Dual-Mode Modal (Vilna Scan PDF & Interactive HTML) */}
      <TzuratHaDafModal
        isOpen={isTzuratHaDafOpen}
        onClose={() => setIsTzuratHaDafOpen(false)}
        bookTitle={bookTitle}
        bookId={bookId}
        initialDaf={
          (isShasBook
            ? resolveTalmudDafForLine(selectedLineIndex || startLineIndex || 1, toc, bookLines, allProcessedLines)?.dafLabel
            : undefined) || selectedVerseInfo?.dafLabel || 'דף ב ע״א'
        }
        isDarkTheme={isDark}
      />

      {/* Floating Text Selection Share & Copy Popover */}
      {textSharePopover && (
        <div
          style={{
            position: 'fixed',
            left: `${textSharePopover.coords.x}px`,
            top: `${textSharePopover.coords.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999
          }}
          className="pointer-events-auto transition-all duration-150 animate-in fade-in zoom-in-95 select-none"
        >
          <div className={`flex items-center gap-0.5 p-0.5 rounded-lg shadow-xl border ${
            isDark
              ? 'bg-stone-800 border-stone-700 shadow-black/80'
              : 'bg-white border-amber-300/90 shadow-stone-400/40'
          }`}>
            {/* 1. Copy selected text */}
            <button
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(textSharePopover.selectedText).catch(() => {});
                }
                setShareToastMessage('הטקסט המסומן הועתק בהצלחה ללוח!');
                setTimeout(() => setShareToastMessage(null), 2000);
              }}
              onMouseDown={e => e.preventDefault()}
              className={`flex items-center gap-1 px-2 py-0.5 rounded font-sans text-[11px] font-semibold transition-all cursor-pointer ${
                isDark
                  ? 'hover:bg-stone-700 text-stone-200'
                  : 'hover:bg-amber-50 text-stone-800'
              }`}
              title="העתק את הטקסט המסומן בלבד"
            >
              <Copy className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>העתק</span>
            </button>
            <div className="w-px h-3.5 bg-amber-200 dark:bg-stone-700 mx-0.5" />
            {/* 1.5. Copy selected text as link */}
            <button
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                handleCopySelectedTextAsLink(
                  textSharePopover.lineIndex,
                  textSharePopover.selectedText,
                  textSharePopover.wordRange
                );
              }}
              onMouseDown={e => e.preventDefault()}
              className={`flex items-center gap-1 px-2 py-0.5 rounded font-sans text-[11px] font-semibold transition-all cursor-pointer ${
                isDark
                  ? 'hover:bg-stone-700 text-amber-200'
                  : 'hover:bg-amber-50 text-amber-950'
              }`}
              title="העתק את הטקסט המסומן כקישור לחיץ"
            >
              <ExternalLink className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>העתק כקישור</span>
            </button>
            <div className="w-px h-3.5 bg-amber-200 dark:bg-stone-700 mx-0.5" />

            {/* 2. Copy deep link to selected text */}
            <button
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                handleShareTextFragment(
                  textSharePopover.lineIndex,
                  textSharePopover.selectedText,
                  textSharePopover.wordRange
                );
              }}
              onMouseDown={e => e.preventDefault()}
              className={`flex items-center gap-1 px-2 py-0.5 rounded font-sans text-[11px] font-semibold transition-all cursor-pointer ${
                shareLinkCopiedLine === textSharePopover.lineIndex
                  ? 'bg-emerald-600 text-white'
                  : isDark
                  ? 'hover:bg-stone-700 text-amber-200'
                  : 'hover:bg-amber-50 text-amber-950'
              }`}
              title="העתק קישור ישיר המוביל לקטע זה (לפי מספר שורה וטווח מילים)"
            >
              {shareLinkCopiedLine === textSharePopover.lineIndex ? (
                <>
                  <Check className="w-3 h-3 text-white" />
                  <span>הקישור הועתק!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>
                    {textSharePopover.wordRange
                      ? `קישור למילים ${textSharePopover.wordRange.start}${
                          textSharePopover.wordRange.start !== textSharePopover.wordRange.end
                            ? `-${textSharePopover.wordRange.end}`
                            : ''
                        }`
                      : 'העתק קישור לטקסט'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast Notification on Copying Share Link */}
      {shareToastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 text-amber-100 border border-amber-500/60 px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{shareToastMessage}</span>
        </div>
      )}
    </div>
  );
};
