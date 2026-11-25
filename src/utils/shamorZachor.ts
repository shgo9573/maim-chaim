import type {
  BookItem,
  ShamorZachorColumn,
  ShamorZachorState,
  ShamorZachorTrackedBook,
  ShamorZachorUnit,
  TocEntry,
} from '../types';

export const DEFAULT_SHAMOR_ZACHOR_COLUMNS: ShamorZachorColumn[] = [
  { id: 'learn', label: 'לימוד' },
  { id: 'review1', label: 'חזרה 1' },
  { id: 'review2', label: 'חזרה 2' },
  { id: 'review3', label: 'חזרה 3' },
];

export const MAX_SHAMOR_COLUMNS = 8;
export const MAX_TRACKED_BOOKS = 200;
export const MAX_TRACKED_UNITS = 5000;
const MAX_LABEL_LENGTH = 180;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cleanText(value: unknown, maxLength = MAX_LABEL_LENGTH): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
    : '';
}

function safeIndex(value: unknown): number | null {
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 1 ? index : null;
}

/**
 * Builds the units used by the progress table. Leaf TOC entries are used when
 * available; books without a TOC are split into bounded 50-line (or larger)
 * sections so a large sefer never creates an unbounded table.
 */
export function buildShamorZachorUnits(toc: TocEntry[], totalLines: number): ShamorZachorUnit[] {
  const lineCount = Number.isSafeInteger(totalLines) && totalLines > 0 ? totalLines : 0;
  const entries = Array.isArray(toc)
    ? toc.map((entry, order) => ({
        title: cleanText(entry?.title),
        index: safeIndex(entry?.index),
        level: Number.isFinite(Number(entry?.level)) ? Math.max(0, Math.floor(Number(entry.level))) : 0,
        order,
      })).filter((entry) => entry.title && entry.index !== null)
    : [];

  const units: ShamorZachorUnit[] = [];
  const seenLines = new Set<number>();
  const path: Array<{ level: number; title: string }> = [];

  entries.forEach((entry, index) => {
    while (path.length && path[path.length - 1].level >= entry.level) path.pop();
    path.push({ level: entry.level, title: entry.title });

    const next = entries[index + 1];
    const hasChildren = Boolean(next && next.level > entry.level);
    if (hasChildren || entry.index === null) return;
    const lineIndex = entry.index;
    if (lineCount > 0 && lineIndex > lineCount) return;
    if (seenLines.has(lineIndex)) return;
    seenLines.add(lineIndex);
    units.push({
      id: `line-${lineIndex}`,
      label: path.map((part) => part.title).join(' · '),
      lineIndex,
    });
  });

  units.sort((a, b) => a.lineIndex - b.lineIndex);
  if (units.length) return units.slice(0, MAX_TRACKED_UNITS);

  if (!lineCount) return [{ id: 'whole-book', label: 'הספר כולו', lineIndex: 1 }];
  const chunkSize = Math.max(50, Math.ceil(lineCount / 500));
  const fallback: ShamorZachorUnit[] = [];
  for (let start = 1; start <= lineCount && fallback.length < MAX_TRACKED_UNITS; start += chunkSize) {
    const end = Math.min(lineCount, start + chunkSize - 1);
    fallback.push({
      id: `lines-${start}-${end}`,
      label: `שורות ${start.toLocaleString('he-IL')}–${end.toLocaleString('he-IL')}`,
      lineIndex: start,
    });
  }
  return fallback;
}

export function normalizeShamorZachorState(value: unknown): ShamorZachorState {
  const root = asRecord(value);
  const sourceBooks = asRecord(root.books);
  const books: Record<string, ShamorZachorTrackedBook> = {};

  for (const [rawKey, rawValue] of Object.entries(sourceBooks).slice(0, MAX_TRACKED_BOOKS)) {
    const row = asRecord(rawValue);
    const rawBookId = row.bookId ?? rawKey;
    if (typeof rawBookId !== 'string' && typeof rawBookId !== 'number') continue;
    const bookId = rawBookId;
    const key = String(bookId).trim();
    const title = cleanText(row.title, 240);
    if (!key || !title) continue;

    const units: ShamorZachorUnit[] = [];
    const unitIds = new Set<string>();
    if (Array.isArray(row.units)) {
      for (const rawUnit of row.units.slice(0, MAX_TRACKED_UNITS)) {
        const unit = asRecord(rawUnit);
        const id = cleanText(unit.id, 100);
        const label = cleanText(unit.label, MAX_LABEL_LENGTH);
        const lineIndex = safeIndex(unit.lineIndex);
        if (!id || !label || lineIndex === null || unitIds.has(id)) continue;
        unitIds.add(id);
        units.push({ id, label, lineIndex });
      }
    }
    if (!units.length) continue;

    const columns: ShamorZachorColumn[] = [];
    const columnIds = new Set<string>();
    if (Array.isArray(row.columns)) {
      for (const rawColumn of row.columns.slice(0, MAX_SHAMOR_COLUMNS)) {
        const column = asRecord(rawColumn);
        const id = cleanText(column.id, 80);
        const label = cleanText(column.label, 80);
        if (!id || !label || columnIds.has(id)) continue;
        columnIds.add(id);
        columns.push({ id, label });
      }
    }
    if (!columns.length) columns.push(...DEFAULT_SHAMOR_ZACHOR_COLUMNS.map((column) => ({ ...column })));

    const rawProgress = asRecord(row.progress);
    const progress: Record<string, string[]> = {};
    for (const column of columns) {
      const values = Array.isArray(rawProgress[column.id]) ? rawProgress[column.id] as unknown[] : [];
      progress[column.id] = Array.from(new Set(values
        .filter((item): item is string => typeof item === 'string')
        .filter((item) => unitIds.has(item))));
    }

    const lastTouched = cleanText(row.lastTouchedUnitId, 100);
    const updatedAt = cleanText(row.updatedAt, 40);
    books[key] = {
      bookId,
      title,
      categoryPath: cleanText(row.categoryPath, 500),
      units,
      columns,
      progress,
      ...(lastTouched && unitIds.has(lastTouched) ? { lastTouchedUnitId: lastTouched } : {}),
      updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : new Date(0).toISOString(),
    };
  }

  return { version: 1, books };
}

export function createTrackedShamorBook(book: BookItem, units: ShamorZachorUnit[]): ShamorZachorTrackedBook {
  const safeUnits = units.slice(0, MAX_TRACKED_UNITS);
  const columns = DEFAULT_SHAMOR_ZACHOR_COLUMNS.map((column) => ({ ...column }));
  return {
    bookId: book.id,
    title: cleanText(book.title, 240) || String(book.id),
    categoryPath: cleanText(book.categoryPath, 500),
    units: safeUnits,
    columns,
    progress: Object.fromEntries(columns.map((column) => [column.id, []])),
    updatedAt: new Date().toISOString(),
  };
}

export function addTrackedShamorBook(
  state: ShamorZachorState,
  book: BookItem,
  units: ShamorZachorUnit[],
): ShamorZachorState {
  const key = String(book.id);
  if (!key || state.books[key] || Object.keys(state.books).length >= MAX_TRACKED_BOOKS || !units.length) return state;
  return {
    version: 1,
    books: { ...state.books, [key]: createTrackedShamorBook(book, units) },
  };
}

export function removeTrackedShamorBook(state: ShamorZachorState, bookId: string | number): ShamorZachorState {
  const key = String(bookId);
  if (!state.books[key]) return state;
  const books = { ...state.books };
  delete books[key];
  return { version: 1, books };
}

export function updateTrackedShamorBook(
  state: ShamorZachorState,
  bookId: string | number,
  updater: (book: ShamorZachorTrackedBook) => ShamorZachorTrackedBook,
): ShamorZachorState {
  const key = String(bookId);
  const current = state.books[key];
  if (!current) return state;
  const next = updater(current);
  return next === current ? state : { version: 1, books: { ...state.books, [key]: next } };
}

function withUpdatedAt(book: ShamorZachorTrackedBook, patch: Partial<ShamorZachorTrackedBook>): ShamorZachorTrackedBook {
  return { ...book, ...patch, updatedAt: new Date().toISOString() };
}

export function toggleShamorUnit(
  book: ShamorZachorTrackedBook,
  columnId: string,
  unitId: string,
  checked: boolean,
): ShamorZachorTrackedBook {
  if (!book.columns.some((column) => column.id === columnId) || !book.units.some((unit) => unit.id === unitId)) return book;
  const current = new Set(book.progress[columnId] || []);
  if (checked) current.add(unitId);
  else current.delete(unitId);
  return withUpdatedAt(book, {
    progress: { ...book.progress, [columnId]: Array.from(current) },
    lastTouchedUnitId: unitId,
  });
}

export function setShamorColumnAll(
  book: ShamorZachorTrackedBook,
  columnId: string,
  checked: boolean,
): ShamorZachorTrackedBook {
  if (!book.columns.some((column) => column.id === columnId)) return book;
  return withUpdatedAt(book, {
    progress: {
      ...book.progress,
      [columnId]: checked ? book.units.map((unit) => unit.id) : [],
    },
    ...(book.units.length ? { lastTouchedUnitId: book.units[book.units.length - 1].id } : {}),
  });
}

/** fromIndex/toIndex are zero-based positions in the displayed unit list; both ends are included. */
export function applyShamorRange(
  book: ShamorZachorTrackedBook,
  columnId: string,
  fromIndex: number,
  toIndex: number,
  checked: boolean,
): ShamorZachorTrackedBook {
  if (!book.columns.some((column) => column.id === columnId) || !book.units.length) return book;
  const safeFrom = Number.isFinite(fromIndex) ? Math.floor(fromIndex) : 0;
  const safeTo = Number.isFinite(toIndex) ? Math.floor(toIndex) : safeFrom;
  const first = Math.max(0, Math.min(book.units.length - 1, Math.min(safeFrom, safeTo)));
  const last = Math.max(first, Math.min(book.units.length - 1, Math.max(safeFrom, safeTo)));
  const progress = new Set(book.progress[columnId] || []);
  for (let index = first; index <= last; index++) {
    const id = book.units[index].id;
    if (checked) progress.add(id);
    else progress.delete(id);
  }
  return withUpdatedAt(book, {
    progress: { ...book.progress, [columnId]: Array.from(progress) },
    lastTouchedUnitId: book.units[last].id,
  });
}

export function addShamorColumn(book: ShamorZachorTrackedBook, label: string, id: string): ShamorZachorTrackedBook {
  const trimmed = cleanText(label, 80);
  const safeId = cleanText(id, 80);
  if (!trimmed || !safeId || book.columns.length >= MAX_SHAMOR_COLUMNS || book.columns.some((column) => column.id === safeId)) return book;
  return withUpdatedAt(book, {
    columns: [...book.columns, { id: safeId, label: trimmed }],
    progress: { ...book.progress, [safeId]: [] },
  });
}

export function renameShamorColumn(book: ShamorZachorTrackedBook, columnId: string, label: string): ShamorZachorTrackedBook {
  const trimmed = cleanText(label, 80);
  if (!trimmed || !book.columns.some((column) => column.id === columnId)) return book;
  return withUpdatedAt(book, {
    columns: book.columns.map((column) => column.id === columnId ? { ...column, label: trimmed } : column),
  });
}

export function removeShamorColumn(book: ShamorZachorTrackedBook, columnId: string): ShamorZachorTrackedBook {
  if (book.columns.length <= 1 || !book.columns.some((column) => column.id === columnId)) return book;
  const progress = { ...book.progress };
  delete progress[columnId];
  return withUpdatedAt(book, {
    columns: book.columns.filter((column) => column.id !== columnId),
    progress,
  });
}

export interface ShamorProgressSummary {
  totalUnits: number;
  learningCompleted: number;
  learningPercent: number;
  fullyCompletedUnits: number;
  isComplete: boolean;
  hasProgress: boolean;
}

export function getShamorProgressSummary(book: ShamorZachorTrackedBook): ShamorProgressSummary {
  const totalUnits = book.units.length;
  const firstColumnId = book.columns[0]?.id;
  const learningCompleted = firstColumnId
    ? new Set(book.progress[firstColumnId] || []).size
    : 0;
  const fullyCompletedUnits = book.units.filter((unit) =>
    book.columns.length > 0 && book.columns.every((column) => (book.progress[column.id] || []).includes(unit.id)),
  ).length;
  const isComplete = totalUnits > 0 && book.columns.length > 0 && book.columns.every((column) =>
    book.units.every((unit) => (book.progress[column.id] || []).includes(unit.id)),
  );
  const hasProgress = book.columns.some((column) => (book.progress[column.id] || []).length > 0);
  return {
    totalUnits,
    learningCompleted,
    learningPercent: totalUnits ? Math.round((learningCompleted / totalUnits) * 100) : 0,
    fullyCompletedUnits,
    isComplete,
    hasProgress,
  };
}


/** Searchable books in the Shamor Vezachor add dialog; the category tree remains the default view. */
export function getShamorAddSearchResults(
  books: readonly BookItem[],
  query: string,
  limit = 60,
): BookItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length < 2) return [];
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 60;
  if (safeLimit === 0) return [];
  return books
    .filter((book) => !/pdf/i.test(book.fileType || '') && !/\\.pdf$/i.test(book.title || ''))
    .filter((book) =>
      `${book.title} ${book.author || ''} ${book.categoryPath}`
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'he'))
    .slice(0, safeLimit);
}
