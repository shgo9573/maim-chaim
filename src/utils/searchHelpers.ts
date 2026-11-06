import { stripNikud } from './gematria';

/**
 * Builds flexible Hebrew regex:
 * - If user typed gershayim/quotes: strict search for that exact term with quotes (normalized)
 * - If user typed without gershayim: allows optional gershayim in the text (e.g. "רמבן" matches "רמב״ן", "רמב"ן", "רמבן")
 * - Matches with or without nikud and cantillation marks
 */
export function buildHebrewSearchRegex(query: string): RegExp | null {
  const cleanQ = stripNikud(query.trim());
  if (!cleanQ) return null;

  const pattern = cleanQ
    .split('')
    .map((char, idx) => {
      // White space
      if (/\s+/.test(char)) {
        return '\\s+';
      }
      // Gershayim / quotes
      if (/["'״׳]/.test(char)) {
        return '["\'״׳]?';
      }

      const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Hebrew characters allow optional inline HTML tags, optional nikud and optional internal quotes / maqaf
      if (/[\u0590-\u05FF]/.test(char)) {
        let res = escapedChar + '(?:<[^>]+>)*[\\u0591-\\u05C7]*(?:<[^>]+>)*';
        if (idx < cleanQ.length - 1) {
          res += '[\'\"״׳־]?(?:<[^>]+>)*';
        }
        return res;
      }

      return escapedChar;
    })
    .join('');

  return new RegExp(`(${pattern})`, 'gi');
}

/**
 * Extracts a snippet containing 5 words before and 5 words after the first search match
 */
export function extractSearchSnippet(
  htmlText: string,
  regex: RegExp
): { snippet: string; totalMatches: number; firstMatchIndex: number } {
  const cleanText = htmlText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanText) return { snippet: '', totalMatches: 0, firstMatchIndex: -1 };

  const words = cleanText.split(' ');
  let firstMatchWordIdx = -1;
  let matchCount = 0;

  for (let i = 0; i < words.length; i++) {
    regex.lastIndex = 0;
    if (regex.test(words[i])) {
      matchCount++;
      if (firstMatchWordIdx === -1) {
        firstMatchWordIdx = i;
      }
    }
  }

  if (firstMatchWordIdx === -1) {
    const defaultWords = words.slice(0, 11);
    return {
      snippet: defaultWords.join(' ') + (words.length > 11 ? '...' : ''),
      totalMatches: 0,
      firstMatchIndex: -1
    };
  }

  const startIdx = Math.max(0, firstMatchWordIdx - 5);
  const endIdx = Math.min(words.length, firstMatchWordIdx + 6);

  const snippetWords = words.slice(startIdx, endIdx);
  let snippet = snippetWords.join(' ');

  if (startIdx > 0) snippet = '...' + snippet;
  if (endIdx < words.length) snippet = snippet + '...';

  return {
    snippet,
    totalMatches: matchCount,
    firstMatchIndex: firstMatchWordIdx
  };
}

/**
 * Accurately highlights search matches in HTML or plain text with consistent amber glow,
 * safely respecting HTML tags and attributes to avoid DOM corruption.
 */
export function highlightSearchText(content: string, regex: RegExp | null): string {
  if (!regex || !content) return content;

  // Avoid re-wrapping already highlighted elements
  if (content.includes('otzaria-shared-highlight')) {
    return content;
  }

  const markReplacement = '<mark class="otzaria-shared-highlight bg-amber-300 dark:bg-amber-500/80 text-amber-950 dark:text-stone-950 px-1 py-0.5 rounded shadow-xs font-semibold ring-2 ring-amber-400/90 transition-all duration-300">$1</mark>';

  // If content contains HTML tags, safely highlight only text nodes outside tags
  if (content.includes('<') && content.includes('>')) {
    const parts = content.split(/(<[^>]+>)/g);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('<')) {
        regex.lastIndex = 0;
        parts[i] = parts[i].replace(regex, markReplacement);
      }
    }
    return parts.join('');
  }

  regex.lastIndex = 0;
  return content.replace(regex, markReplacement);
}
