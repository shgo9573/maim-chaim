import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PersonalNote } from '../../src/types';
import { filterAndSortPersonalNotes } from '../../src/utils/personalNotes';

const notes: PersonalNote[] = [
  { id: '1', bookId: 1, line: 8, heRef: 'בראשית א, ט', text: 'ביאור על הפסוק', updatedAt: '2026-11-06T10:00:00.000Z' },
  { id: '2', bookId: 1, line: 2, heRef: 'בראשית א, ג', text: 'הערה קצרה', updatedAt: '2026-11-07T10:00:00.000Z' },
  { id: '3', bookId: 2, line: 1, heRef: 'שמות ב, ב', text: 'ביאור נוסף', updatedAt: '2026-11-05T10:00:00.000Z' },
];

const books = new Map([
  ['1', { title: 'בראשית', categoryPath: 'תנ״ך/תורה' }],
  ['2', { title: 'שמות', categoryPath: 'תנ״ך/תורה' }],
]);

const resolveBook = (id: PersonalNote['bookId']) => books.get(String(id));

test('חיפוש בהערות כולל תוכן, מראה מקום ושם ספר', () => {
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { query: 'ביאור' }).map((item) => item.note.id),
    ['1', '3'],
  );
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { query: 'בראשית א, ג' }).map((item) => item.note.id),
    ['2'],
  );
});

test('סינון לפי ספר וקטגוריה', () => {
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { bookId: '2' }).map((item) => item.note.id),
    ['3'],
  );
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { categoryPath: 'תנ״ך' }).map((item) => item.note.id),
    ['1', '2', '3'],
  );
});

test('טווח התאריכים כולל את שני ימי הגבול', () => {
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { dateFrom: '2026-11-06', dateTo: '2026-11-07' }).map((item) => item.note.id),
    ['1', '2'],
  );
});

test('מיון לפי מיקום ומיון לפי מועד עדכון', () => {
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { sortOrder: 'bookLocation' }).map((item) => item.note.id),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { sortOrder: 'newest' }).map((item) => item.note.id),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    filterAndSortPersonalNotes(notes, resolveBook, { sortOrder: 'oldest' }).map((item) => item.note.id),
    ['3', '1', '2'],
  );
});
