export interface CommentaryLinkItem {
  type?: string;
  sourceBook?: string;
  category?: string;
  lineIndex?: number;
  line?: number;
  text?: string;
  dibburHamatchil?: string;
}

export interface CommentaryApiResponse {
  id: number | string;
  line: number;
  links: CommentaryLinkItem[];
  allLinks?: CommentaryLinkItem[];
  availableCommentators?: string[];
  error?: string;
}

const EXTERNAL_API_BASE = 'https://otzaria.duckdns.org/api';

/**
 * Fetches commentary links for a given book and line index.
 * Uses proxy route `/api/commentary/:bookId/:lineIndex` with fallback to local mock data.
 */
export async function getCommentary(
  bookId: number | string,
  lineIndex: number
): Promise<CommentaryApiResponse> {
  try {
    // 1. Try local server proxy endpoint first (avoids browser CORS issues)
    const localProxyUrl = `/api/commentary/${encodeURIComponent(bookId)}/${lineIndex}`;
    const res = await fetch(localProxyUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (proxyErr) {
    console.warn('[apiClient] Local proxy commentary fetch failed:', proxyErr);
  }

  // 2. Direct external fetch attempt
  try {
    const directUrl = `${EXTERNAL_API_BASE}/books/${encodeURIComponent(bookId)}/links?line=${lineIndex}`;
    const directRes = await fetch(directUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (directRes.ok) {
      const data = await directRes.json();
      return data;
    }
  } catch (directErr) {
    console.warn('[apiClient] Direct external commentary fetch failed:', directErr);
  }

  // 3. Fallback mock commentary generator for demo & offline mode
  return getMockCommentary(bookId, lineIndex);
}

/**
 * Mock commentary generator when remote server is offline or line has no links
 */
export function getMockCommentary(
  bookId: number | string,
  lineIndex: number
): CommentaryApiResponse {
  return {
    id: bookId,
    line: lineIndex,
    links: [
      {
        type: 'rashi',
        sourceBook: 'רש״י',
        category: 'מפרשי הבבלי',
        lineIndex: lineIndex,
        text: 'חצי שיעור - דאפילו פחות משיעור אסור מן התורה כדנפקא לן מקראי, ואין לוקין עליו אלא מדרבנן.',
        dibburHamatchil: 'חצי שיעור'
      },
      {
        type: 'tosafot',
        sourceBook: 'תוספות',
        category: 'מפרשי הבבלי',
        lineIndex: lineIndex + 1,
        text: 'דאפילו חצי שיעור - תימה דהא קיימא לן כרבי יוחנן דאמר חצי שיעור אסור מן התורה.',
        dibburHamatchil: 'דאפילו חצי שיעור'
      },
      {
        type: 'ein_mishpat',
        sourceBook: 'עין משפט נר מצווה',
        category: 'הלכה',
        lineIndex: lineIndex + 2,
        text: 'רמב"ם פ"ה מהלכות מאכלות אסורות הלכה ג\'. טושו"ע יורה דעה סימן ס"א סעיף א\'.',
        dibburHamatchil: 'עין משפט'
      }
    ],
    allLinks: [],
    availableCommentators: ['rashi', 'tosafot', 'ein_mishpat']
  };
}
