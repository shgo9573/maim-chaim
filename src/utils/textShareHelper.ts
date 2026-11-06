/**
 * Text Share & Deep Linking Utility for Otzaria Web
 * Generates and parses short, human-readable deep links:
 * e.g. ?book=12&line=45&w=4-9 (Word 4 to 9 in line 45)
 */

import { stripNikud } from './gematria';

export interface WordRange {
  start: number;
  end: number;
}

/**
 * Normalizes a word for robust matching, removing punctuation, cantillation and nikud.
 */
export function normalizeWord(word: string): string {
  return stripNikud(word)
    .replace(/<[^>]+>/g, '')
    .replace(/[\.,;:!?"'״׳\(\)\[\]\-—]/g, '')
    .trim();
}

/**
 * Extracts raw words from an HTML or text string.
 */
export function extractWordsFromText(text: string): string[] {
  const clean = text.replace(/<[^>]+>/g, ' ');
  return clean.split(/\s+/).filter(Boolean);
}

/**
 * Calculates 1-based start and end word indices in full line for the selected text.
 * e.g. Line: "בראשית ברא אלהים את השמים ואת הארץ"
 * Selected: "אלהים את השמים" -> { start: 3, end: 5 }
 */
export function getWordRangeInLine(fullLineText: string, selectedText: string): WordRange | null {
  const lineWords = extractWordsFromText(fullLineText);
  const selectedWords = extractWordsFromText(selectedText);

  if (lineWords.length === 0 || selectedWords.length === 0) {
    return null;
  }

  const normLineWords = lineWords.map(normalizeWord).filter(Boolean);
  const normSelectedWords = selectedWords.map(normalizeWord).filter(Boolean);

  if (normSelectedWords.length === 0) {
    return null;
  }

  // Find where normSelectedWords occurs as a contiguous sub-sequence in normLineWords
  const seqLen = normSelectedWords.length;
  for (let i = 0; i <= normLineWords.length - seqLen; i++) {
    let match = true;
    for (let j = 0; j < seqLen; j++) {
      if (normLineWords[i + j] !== normSelectedWords[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return {
        start: i + 1, // 1-indexed
        end: i + seqLen
      };
    }
  }

  // Fallback: match by prefix & suffix if partial phrase
  if (normSelectedWords.length === 1) {
    const idx = normLineWords.indexOf(normSelectedWords[0]);
    if (idx !== -1) {
      return { start: idx + 1, end: idx + 1 };
    }
    return null;
  }

  const firstWord = normSelectedWords[0];
  const lastWord = normSelectedWords[normSelectedWords.length - 1];

  for (let i = 0; i < normLineWords.length; i++) {
    if (normLineWords[i] === firstWord) {
      for (let j = i; j < Math.min(normLineWords.length, i + normSelectedWords.length + 3); j++) {
        if (normLineWords[j] === lastWord) {
          return {
            start: i + 1,
            end: j + 1
          };
        }
      }
    }
  }

  return null;
}

/**
 * Calculates exact 1-based word range from the user's active DOM selection within a line element.
 * Perfectly disambiguates duplicate words by examining preceding text.
 */
export function getSelectionWordRangeFromDOM(lineElement: HTMLElement): WordRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  try {
    const range = selection.getRangeAt(0);

    // Ensure the selection is actually contained within the line element
    if (!lineElement.contains(range.commonAncestorContainer)) {
      return null;
    }

    // Measure text before selection within the line element
    const preRange = range.cloneRange();
    preRange.selectNodeContents(lineElement);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();

    // Measure selected text
    const selectedText = range.toString();
    const cleanSelected = selectedText.trim();
    if (!cleanSelected) return null;

    // Count words before selection
    const cleanBefore = textBefore.trim();
    const wordsBeforeCount = cleanBefore.length > 0 ? cleanBefore.split(/\s+/).length : 0;

    const startWord = wordsBeforeCount + 1;
    const selectedWordsCount = cleanSelected.split(/\s+/).length;
    const endWord = Math.max(startWord, startWord + selectedWordsCount - 1);

    return {
      start: startWord,
      end: endWord
    };
  } catch (err) {
    console.warn('[textShareHelper] getSelectionWordRangeFromDOM error:', err);
    return null;
  }
}

/**
 * Formats a word range into a compact URL parameter string:
 * { start: 4, end: 9 } -> "4-9"
 * { start: 4, end: 4 } -> "4"
 */
export function formatWordRangeParam(start: number, end: number): string {
  if (start === end) {
    return String(start);
  }
  return `${start}-${end}`;
}

/**
 * Parses word range from query parameter string.
 * Supports: "4-9", "4..9", "4,9", "4"
 */
export function parseWordRangeParam(param: string | null): WordRange | null {
  if (!param) return null;
  const trimmed = param.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/[-.,_]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n) && n > 0);
  if (parts.length === 1) {
    return { start: parts[0], end: parts[0] };
  }
  if (parts.length >= 2) {
    const start = Math.min(parts[0], parts[1]);
    const end = Math.max(parts[0], parts[1]);
    return { start, end };
  }

  return null;
}

/**
 * Builds a compact, clean deep-link share URL.
 * e.g. https://domain.com/?book=12&line=45&w=4-9
 */
export function buildShareUrl(
  bookId: string | number,
  lineIdx: number,
  wordRange?: WordRange | null,
  bookTitle?: string
): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('book', String(bookId));
  if (bookTitle && bookTitle !== String(bookId) && !/^\d+$/.test(bookTitle)) {
    url.searchParams.set('title', bookTitle);
  }
  url.searchParams.set('line', String(lineIdx));
  if (wordRange && wordRange.start > 0) {
    url.searchParams.set('w', formatWordRangeParam(wordRange.start, wordRange.end));
  }
  return url.toString();
}

/**
 * Highlights a 1-based word range (startWord to endWord) directly within HTML line text.
 * Leaves HTML tags (like <a>, <b>, <span>) unharmed while wrapping target words in <mark>.
 */
export function highlightWordRangeInHtml(
  htmlText: string,
  startWord: number,
  endWord: number
): string {
  if (startWord < 1 || endWord < startWord) return htmlText;

  // Tokenize by HTML tags vs Text chunks
  const tokens = htmlText.split(/(<[^>]+>)/g);
  let wordCounter = 0;
  let inHighlight = false;
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // If it's an HTML tag, pass through directly
    if (token.startsWith('<') && token.endsWith('>')) {
      result.push(token);
      continue;
    }

    // Split text into words and whitespaces
    const parts = token.split(/(\s+)/);
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        result.push(part);
        continue;
      }

      // It's a word!
      wordCounter++;

      const isInside = wordCounter >= startWord && wordCounter <= endWord;

      if (isInside && !inHighlight) {
        result.push('<mark class="otzaria-shared-highlight bg-amber-300 dark:bg-amber-500/80 text-amber-950 dark:text-stone-950 px-1 py-0.5 rounded-sm shadow-xs font-semibold ring-2 ring-amber-400/90 transition-all duration-300">');
        inHighlight = true;
      }

      result.push(part);

      if (wordCounter === endWord && inHighlight) {
        result.push('</mark>');
        inHighlight = false;
      }
    }
  }

  // Ensure unclosed mark is closed
  if (inHighlight) {
    result.push('</mark>');
  }

  return result.join('');
}
