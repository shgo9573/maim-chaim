import { ExtractedWord, ExtractedPageData } from './pdfExtractor';

export type WordType = 'gemara' | 'rashi' | 'tosafot' | 'marginalia';

export interface ClassifiedWord extends ExtractedWord {
  type: WordType;
  lineGroupIndex: number;
}

export interface ClassifiedLine {
  lineIndex: number;
  type: WordType;
  words: ClassifiedWord[];
  text: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  avgHeight: number;
}

export interface ClassifiedPageOverlay {
  pageNumber: number;
  viewWidth: number;
  viewHeight: number;
  lines: ClassifiedLine[];
  allWords: ClassifiedWord[];
}

/**
 * Groups words into lines based on Y coordinate similarity (±5px)
 * and classifies each line/word into Gemara, Rashi, Tosafot, or Marginalia.
 */
export function classifyPageOverlay(data: ExtractedPageData): ClassifiedPageOverlay {
  const { pageNumber, viewWidth, viewHeight, words } = data;

  if (!words || words.length === 0) {
    return {
      pageNumber,
      viewWidth,
      viewHeight,
      lines: [],
      allWords: []
    };
  }

  // 1. Sort words top-to-bottom (Y), then left-to-right (X)
  const sortedWords = [...words].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 5) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  // 2. Group into lines
  const rawLines: ExtractedWord[][] = [];
  let currentLine: ExtractedWord[] = [];
  let currentLineY: number | null = null;

  for (const word of sortedWords) {
    if (currentLineY === null || Math.abs(word.y - currentLineY) <= 5) {
      currentLine.push(word);
      if (currentLineY === null) {
        currentLineY = word.y;
      } else {
        // Average Y
        currentLineY = (currentLineY * (currentLine.length - 1) + word.y) / currentLine.length;
      }
    } else {
      if (currentLine.length > 0) {
        rawLines.push(currentLine);
      }
      currentLine = [word];
      currentLineY = word.y;
    }
  }
  if (currentLine.length > 0) {
    rawLines.push(currentLine);
  }

  // 3. Classify each line
  const classifiedLines: ClassifiedLine[] = [];
  const allClassifiedWords: ClassifiedWord[] = [];

  rawLines.forEach((lineWords, lineGroupIdx) => {
    lineWords.sort((a, b) => a.x - b.x); // Left to right within line

    const minX = Math.min(...lineWords.map(w => w.x));
    const maxX = Math.max(...lineWords.map(w => w.x + w.w));
    const minY = Math.min(...lineWords.map(w => w.y));
    const maxY = Math.max(...lineWords.map(w => w.y + w.h));
    const avgHeight = lineWords.reduce((sum, w) => sum + w.h, 0) / lineWords.length;

    const lineCenter = (minX + maxX) / 2;
    const pageCenter = viewWidth / 2;

    // Classification heuristics:
    let type: WordType = 'gemara';

    // Marginalia: Very small text or at extreme page margins (< 10% or > 90% page width)
    if (avgHeight < 7 || minX < viewWidth * 0.08 || maxX > viewWidth * 0.92) {
      type = 'marginalia';
    }
    // Gemara: Main central Talmud text (larger font h > 11.5px or centered)
    else if (avgHeight > 11.5 || (lineCenter > pageCenter - 100 && lineCenter < pageCenter + 100 && avgHeight > 9.5)) {
      type = 'gemara';
    }
    // Rashi vs Tosafot based on column position (Rashi is usually inner column, Tosafot outer)
    else if (lineCenter < pageCenter) {
      type = 'rashi';
    } else {
      type = 'tosafot';
    }

    const text = lineWords.map(w => w.t).join(' ');

    const classifiedWordObjects: ClassifiedWord[] = lineWords.map(w => ({
      ...w,
      type,
      lineGroupIndex: lineGroupIdx + 1
    }));

    classifiedLines.push({
      lineIndex: lineGroupIdx + 1,
      type,
      words: classifiedWordObjects,
      text,
      minX,
      maxX,
      minY,
      maxY,
      avgHeight
    });

    allClassifiedWords.push(...classifiedWordObjects);
  });

  return {
    pageNumber,
    viewWidth,
    viewHeight,
    lines: classifiedLines,
    allWords: allClassifiedWords
  };
}
