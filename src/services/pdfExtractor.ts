import * as pdfjsLib from 'pdfjs-dist';

// Font character mapping for Vilna / Shas PDF encoded fonts
export const FONT_MAP: Record<string, string> = {
  'à': 'א', 'á': 'ב', 'â': 'ג', 'ã': 'ד', 'ä': 'ה', 'å': 'ו',
  'æ': 'ז', 'ç': 'ח', 'è': 'ט', 'é': 'י', 'ë': 'כ', 'ì': 'ל',
  'î': 'מ', 'ï': 'ן', 'ð': 'נ', 'ñ': 'ס', 'ò': 'ע', 'ô': 'פ',
  'ö': 'צ', '÷': 'ק', 'ø': 'ר', 'ù': 'ש', 'ú': 'ת',
  'ê': 'ך', 'í': 'ם', 'õ': 'ץ', 'ó': 'ף'
};

export interface ExtractedWord {
  id: string;
  t: string;      // Decoded text
  raw: string;    // Raw font text
  x: number;      // Left position in PDF points
  y: number;      // Top position in PDF points
  w: number;      // Bounding box width
  h: number;      // Bounding box height
  lineIndex?: number;
}

export interface ExtractedPageData {
  pageNumber: number;
  viewWidth: number;
  viewHeight: number;
  words: ExtractedWord[];
}

/**
 * Decodes font-encoded Hebrew words from Shas PDFs
 */
export function decodeWord(word: string): string {
  if (!word) return '';
  
  // Check if string contains mapped characters
  const hasMappedChars = word.split('').some(c => FONT_MAP[c] !== undefined);
  if (hasMappedChars) {
    // Reverse string order and map font characters
    return word
      .split('')
      .reverse()
      .map(c => FONT_MAP[c] || c)
      .join('');
  }
  
  return word;
}

/**
 * Extracts text items with exact bounding box coordinates from a PDF page
 */
export async function extractWordsFromPdf(
  pdfSource: string | ArrayBuffer | Uint8Array,
  pageNumber: number = 1
): Promise<ExtractedPageData> {
  try {
    const loadingTask = pdfjsLib.getDocument(
      typeof pdfSource === 'string'
        ? { url: pdfSource, cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/', cMapPacked: true, standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/standard_fonts/' }
        : { data: pdfSource, cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/', cMapPacked: true, standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/standard_fonts/' }
    );

    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(Math.min(pageNumber, pdfDoc.numPages));
    const viewport = page.getViewport({ scale: 1.0 });

    const textContent = await page.getTextContent();
    const words: ExtractedWord[] = [];

    let wordCounter = 0;

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;

      const str = item.str.trim();
      const transform = item.transform; // [scaleX, skewY, skewX, scaleY, translateX, translateY]
      
      const fontHeight = Math.abs(transform[3]) || Math.abs(transform[0]) || item.height || 10;
      const x = transform[4];
      const y = viewport.height - transform[5] - fontHeight; // Convert PDF bottom-left to top-left Y
      const w = item.width || (str.length * fontHeight * 0.5);
      const h = fontHeight;

      // Split multi-word strings if present
      const rawWords = str.split(/\s+/);
      if (rawWords.length === 1) {
        const decoded = decodeWord(str);
        if (decoded) {
          words.push({
            id: `w-${pageNumber}-${wordCounter++}`,
            t: decoded,
            raw: str,
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            w: Math.round(w * 100) / 100,
            h: Math.round(h * 100) / 100
          });
        }
      } else {
        const approxWordWidth = w / rawWords.length;
        rawWords.forEach((rw: string, idx: number) => {
          const decoded = decodeWord(rw);
          if (decoded) {
            words.push({
              id: `w-${pageNumber}-${wordCounter++}`,
              t: decoded,
              raw: rw,
              x: Math.round((x + idx * approxWordWidth) * 100) / 100,
              y: Math.round(y * 100) / 100,
              w: Math.round(approxWordWidth * 100) / 100,
              h: Math.round(h * 100) / 100
            });
          }
        });
      }
    }

    return {
      pageNumber,
      viewWidth: Math.round(viewport.width),
      viewHeight: Math.round(viewport.height),
      words
    };
  } catch (err) {
    console.error('[pdfExtractor] Error extracting words from PDF:', err);
    throw err;
  }
}
