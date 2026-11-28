import type { BookItem } from '../types';
import { EXCLUDED_BOOK_NOTICE, isExcludedBook } from './bookFilter';
import { parseReaderLinkTarget, type ReaderLinkTarget } from './readerLinks';

/**
 * Pure planning of a reader/commentary link open action.
 *
 * The function classifies a link href into an actionable plan without performing
 * any side effects; the calling component executes the plan (opens tabs, scrolls,
 * shows toasts). This is shared by the book reader and the commentary side panel
 * so both places resolve catalogue targets, exclusions and error copy identically.
 */
export type ReaderLinkOpenPlan =
  | { status: 'resolved'; target: Extract<ReaderLinkTarget, { kind: 'book' | 'inline-book' | 'book-id' }>; book: BookItem; line: number }
  | { status: 'external'; target: Extract<ReaderLinkTarget, { kind: 'external' }>; href: string }
  | { status: 'anchor'; target: Extract<ReaderLinkTarget, { kind: 'anchor' }> }
  | { status: 'unsupported'; message: string }
  | { status: 'library-unavailable' }
  | { status: 'ambiguous'; title: string; message: string }
  | { status: 'missing'; title: string; message: string }
  | { status: 'excluded'; message: string };

const AMBIGUOUS_BOOK_MESSAGE = 'הקישור אינו חד-משמעי: נמצאו כמה ספרים בעלי אותו שם';
const TARGET_BOOK_UNAVAILABLE_MESSAGE = 'ספר היעד של הקישור אינו זמין בספרייה';

function uniqueTitleMatches(books: readonly BookItem[], title: string): BookItem[] {
  const normalized = title.trim();
  return books.filter((candidate) => candidate.title.trim() === normalized && !isExcludedBook(candidate));
}

function missingTitleMessage(title: string): string {
  return 'הספר "' + title + '" לא נמצא בספרייה';
}

export function planReaderLinkOpen(href: string, books: readonly BookItem[] | null): ReaderLinkOpenPlan {
  const target = parseReaderLinkTarget(href);
  if (!target) {
    return { status: 'unsupported', message: 'הקישור אינו נתמך' };
  }

  if (target.kind === 'external') {
    return { status: 'external', target, href: target.href };
  }

  if (target.kind === 'book-id' && target.source !== undefined) {
    const message = target.source === 'user'
      ? 'הקישור מפנה לספרייה אישית שאינה זמינה באתר'
      : target.source.startsWith('db:')
        ? 'הקישור מפנה למסד ספרים מצורף שאינו זמין באתר'
        : 'מקור הקישור אינו נתמך באתר';
    return { status: 'unsupported', message };
  }

  if (target.kind === 'anchor') {
    return { status: 'anchor', target };
  }

  if (!books) {
    return { status: 'library-unavailable' };
  }

  if (target.kind === 'book-id') {
    const match = books.find((candidate) => String(candidate.id) === target.id);
    if (!match) {
      return { status: 'missing', title: target.id, message: TARGET_BOOK_UNAVAILABLE_MESSAGE };
    }
    if (isExcludedBook(match)) {
      return { status: 'excluded', message: EXCLUDED_BOOK_NOTICE };
    }
    return { status: 'resolved', target, book: match, line: target.line ?? 1 };
  }

  const matches = uniqueTitleMatches(books, target.title);
  if (matches.length > 1) {
    return { status: 'ambiguous', title: target.title, message: AMBIGUOUS_BOOK_MESSAGE };
  }
  if (matches.length === 0) {
    return { status: 'missing', title: target.title, message: missingTitleMessage(target.title) };
  }
  return { status: 'resolved', target, book: matches[0], line: target.kind === 'inline-book' ? target.line : 1 };
}
