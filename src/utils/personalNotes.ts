import type { PersonalNote } from '../types';

export type PersonalNotesSortOrder = 'bookLocation' | 'newest' | 'oldest';

export interface PersonalNoteBookInfo {
  title: string;
  categoryPath: string;
}

export interface PersonalNoteDisplayItem {
  note: PersonalNote;
  bookTitle: string;
  categoryPath: string;
}

export interface PersonalNotesFilterOptions {
  query?: string;
  bookId?: string;
  categoryPath?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: PersonalNotesSortOrder;
}

export function filterAndSortPersonalNotes(
  notes: readonly PersonalNote[],
  resolveBook: (bookId: PersonalNote['bookId']) => PersonalNoteBookInfo | undefined,
  options: PersonalNotesFilterOptions = {},
): PersonalNoteDisplayItem[] {
  const query = (options.query || '').trim().toLowerCase();
  const bookId = options.bookId || 'all';
  const categoryPath = options.categoryPath || 'all';
  const dateFrom = options.dateFrom || '';
  const dateTo = options.dateTo || '';
  const sortOrder = options.sortOrder || 'bookLocation';

  const result = notes.flatMap((note) => {
    const book = resolveBook(note.bookId);
    const title = book?.title || String(note.bookId);
    const path = book?.categoryPath || '';

    if (bookId !== 'all' && String(note.bookId) !== bookId) return [];
    if (
      categoryPath !== 'all' &&
      path !== categoryPath &&
      !path.startsWith(`${categoryPath}/`) &&
      !path.startsWith(`${categoryPath} /`)
    ) {
      return [];
    }
    if (query) {
      const searchable = `${note.text} ${note.heRef || ''} ${title} ${note.line + 1}`.toLowerCase();
      if (!searchable.includes(query)) return [];
    }
    const updatedDate = typeof note.updatedAt === 'string' ? note.updatedAt.slice(0, 10) : '';
    if (dateFrom && (!updatedDate || updatedDate < dateFrom)) return [];
    if (dateTo && (!updatedDate || updatedDate > dateTo)) return [];

    return [{ note, bookTitle: title, categoryPath: path }];
  });

  result.sort((a, b) => {
    if (sortOrder === 'newest' || sortOrder === 'oldest') {
      const left = Date.parse(a.note.updatedAt) || 0;
      const right = Date.parse(b.note.updatedAt) || 0;
      const byDate = sortOrder === 'newest' ? right - left : left - right;
      if (byDate) return byDate;
    }
    const byBook = a.bookTitle.localeCompare(b.bookTitle, 'he');
    if (byBook) return byBook;
    const byLine = a.note.line - b.note.line;
    if (byLine) return byLine;
    return a.note.id.localeCompare(b.note.id);
  });

  return result;
}
