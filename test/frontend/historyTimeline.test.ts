import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RecentSearchItem, ReadingHistoryItem } from '../../src/types';
import { buildHistoryTimeline } from '../../src/utils/historyTimeline';

const makeBook = (overrides: Partial<ReadingHistoryItem> = {}): ReadingHistoryItem => ({
  id: 'book-1',
  bookId: 1,
  bookTitle: 'בראשית',
  category: 'תנך',
  lastPosition: 12,
  lastSection: 'פרק א',
  lastReadAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

const makeSearch = (overrides: Partial<RecentSearchItem> = {}): RecentSearchItem => ({
  query: 'שמע ישראל',
  searchedAt: '2026-11-21T10:00:00.000Z',
  ...overrides,
});

test('combines reading and search records in newest-first order', () => {
  const timeline = buildHistoryTimeline(
    [
      makeBook({ id: 'older', lastReadAt: '2026-11-19T10:00:00.000Z' }),
      makeBook({ id: 'newer', lastReadAt: '2026-11-22T10:00:00.000Z' }),
    ],
    [
      makeSearch({ query: 'שמע ישראל', searchedAt: '2026-11-22T11:00:00.000Z' }),
      makeSearch({ query: 'אשרי', searchedAt: '2026-11-20T11:00:00.000Z' }),
    ],
  );

  assert.deepEqual(timeline.map((entry) => entry.key), [
    'search:שמע ישראל',
    'book:newer',
    'search:אשרי',
    'book:older',
  ]);
});

test('filters the timeline to reading records or search records', () => {
  const books = [makeBook()];
  const searches = [makeSearch()];

  assert.deepEqual(
    buildHistoryTimeline(books, searches, 'books').map((entry) => entry.kind),
    ['book'],
  );
  assert.deepEqual(
    buildHistoryTimeline(books, searches, 'searches').map((entry) => entry.kind),
    ['search'],
  );
});

test('searches book title, category, section and recent search query locally', () => {
  const books = [
    makeBook({ id: 'one', bookTitle: 'בראשית', category: 'תנך', lastSection: 'פרק א' }),
    makeBook({ id: 'two', bookTitle: 'משנה ברורה', category: 'הלכה', lastSection: 'סימן ב' }),
  ];
  const searches = [
    makeSearch({ query: 'שמע ישראל' }),
    makeSearch({ query: 'הלכה למעשה' }),
  ];

  assert.deepEqual(
    buildHistoryTimeline(books, searches, 'all', 'סימן ב').map((entry) => entry.key),
    ['book:two'],
  );
  assert.deepEqual(
    buildHistoryTimeline(books, searches, 'all', 'שמע ישראל').map((entry) => entry.key),
    ['search:שמע ישראל'],
  );
  assert.deepEqual(
    buildHistoryTimeline(books, searches, 'all', 'תנך').map((entry) => entry.key),
    ['book:one'],
  );
});

test('invalid timestamps are retained at the end of the timeline', () => {
  const timeline = buildHistoryTimeline(
    [
      makeBook({ id: 'invalid', lastReadAt: 'not-a-date' }),
      makeBook({ id: 'valid', lastReadAt: '2026-11-22T10:00:00.000Z' }),
    ],
    [],
  );

  assert.deepEqual(timeline.map((entry) => entry.key), ['book:valid', 'book:invalid']);
});

test('equal timestamps keep a deterministic source order', () => {
  const timestamp = '2026-11-22T10:00:00.000Z';
  const timeline = buildHistoryTimeline(
    [makeBook({ id: 'first', lastReadAt: timestamp }), makeBook({ id: 'second', lastReadAt: timestamp })],
    [makeSearch({ query: 'third', searchedAt: timestamp })],
  );

  assert.deepEqual(timeline.map((entry) => entry.key), [
    'book:first',
    'book:second',
    'search:third',
  ]);
});
