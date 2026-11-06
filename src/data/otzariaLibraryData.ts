import { buildComprehensiveCatalog } from './catalogGenerator.js';
import { BookItem, CategoryNode, TocNode } from '../types/otzaria.js';

export type { BookItem, CategoryNode, TocNode };

// Build the full complete catalog dynamically
const generatedCatalog = buildComprehensiveCatalog();

export const CANONICAL_BOOKS: BookItem[] = generatedCatalog.books;
export const CANONICAL_CATEGORIES: CategoryNode[] = generatedCatalog.categories;

export function extractTocFromText(content: string, bookTitle?: string): TocNode[] {
  const lines = content.split('\n');
  const toc: TocNode[] = [];
  const headingRegex = /<h([1-4])>(.*?)<\/h\1>/i;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const match = trimmed.match(headingRegex);
    if (match) {
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (title && title.length > 0) {
        toc.push({
          title,
          index: index + 1,
          level: parseInt(match[1], 10)
        });
      }
    } else if (
      trimmed.startsWith('@') ||
      trimmed.startsWith('פרק ') ||
      trimmed.startsWith('דף ') ||
      trimmed.startsWith('הלכות ') ||
      trimmed.startsWith('סימן ') ||
      trimmed.startsWith('שער ') ||
      trimmed.startsWith('פסוק ') ||
      trimmed.startsWith('סעיף ')
    ) {
      const cleanTitle = trimmed.replace(/^[@#\*\+]+/, '').replace(/<[^>]+>/g, '').trim();
      if (cleanTitle.length > 1 && cleanTitle.length < 80) {
        toc.push({
          title: cleanTitle,
          index: index + 1,
          level: 1
        });
      }
    }
  });

  if (toc.length === 0) {
    toc.push(
      { title: `${bookTitle || 'ספר'} - פתיחה`, index: 1, level: 1 },
      { title: 'פרק א', index: Math.min(2, lines.length), level: 1 },
      { title: 'פרק ב', index: Math.min(15, lines.length), level: 1 },
      { title: 'פרק ג', index: Math.min(30, lines.length), level: 1 }
    );
  }

  return toc;
}
