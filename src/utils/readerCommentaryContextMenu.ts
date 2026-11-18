import type { BookItem, CommentaryLink } from '../types';

export interface ReaderCommentaryMenuItem {
  title: string;
  line: number;
  count: number;
}

/** Groups the current line's commentary links without changing their source order. */
export function groupReaderCommentaryLinks(
  links: readonly CommentaryLink[],
): ReaderCommentaryMenuItem[] {
  const grouped = new Map<string, ReaderCommentaryMenuItem>();
  for (const link of links) {
    const title = link.sourceBook.trim();
    if (!title || !Number.isInteger(link.line) || link.line < 1) continue;
    const existing = grouped.get(title);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(title, { title, line: link.line, count: 1 });
    }
  }
  return Array.from(grouped.values());
}

/** A title-only API link is safe to open only when the catalogue has one exact match. */
export function findUniqueReaderCommentaryBook<T extends Pick<BookItem, 'title'>>(
  books: readonly T[],
  title: string,
): T | null {
  const exactTitle = title.trim();
  if (!exactTitle) return null;
  const matches = books.filter((book) => book.title.trim() === exactTitle);
  return matches.length === 1 ? matches[0] : null;
}
