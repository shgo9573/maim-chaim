import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

let tempDir: string;
let database: Database.Database;
let seforim: typeof import('../../src/services/seforimDatabase.js');

// These are the explicit numeric IDs covered by the exclusion list in production.
const excludedBookIds = [
  3231, 3697, 3874, 5431, 5432, 5433, 5434, 5435, 5436, 5437, 5438, 5439, 5440, 5441, 5442, 5443, 5444, 5445, 5446, 5447, 5448, 5449, 5450, 5451, 5452, 5453, 5454, 5455, 5456, 5457, 5458, 5459, 5460, 5461, 5462, 5463, 5464, 5465, 5466, 5855, 5858, 5952, 6032, 6033, 6035, 6057, 6058, 6082, 6090, 6883, 6948, 7415, 7418, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7445, 7446, 7447, 7448, 7453, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7531, 7532, 7533, 7534, 7595, 7667, 7668, 7669, 7670, 7671, 7672, 7673, 7674, 7675, 7676, 7677, 7678, 7679, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7917, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7930, 7931, 7932, 7933, 7934, 7935, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7958, 7959, 7960, 7961, 7962, 7964, 7976, 7977, 7978, 7988, 7989, 7991, 7993, 8019, 8021, 8022, 8032, 8034
];

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otzaria-wikisource-test-'));
  const databasePath = path.join(tempDir, 'seforim.db');
  process.env.SEFORIM_DB_PATH = databasePath;
  database = new Database(databasePath);
  database.exec(`
    CREATE TABLE source (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE category (id INTEGER PRIMARY KEY, parentId INTEGER, title TEXT NOT NULL, orderIndex INTEGER);
    CREATE TABLE book (id INTEGER PRIMARY KEY, categoryId INTEGER, title TEXT NOT NULL, orderIndex INTEGER, source_id INTEGER);
    CREATE TABLE line (id INTEGER PRIMARY KEY, bookId INTEGER NOT NULL, lineIndex INTEGER NOT NULL, content TEXT NOT NULL);
    CREATE TABLE test_padding (data BLOB);
    INSERT INTO source VALUES (1, 'otherSource'), (4, 'wikisourceToOtzaria');
    INSERT INTO category VALUES (1, NULL, 'קטגוריה', 1);
    INSERT INTO book VALUES
      (100, 1, 'ספר ויקימקור', 1, 4),
      (200, 1, 'ספר רגיל', 2, 1),
      (300, 1, 'שו"ת רבי שלמה ברוך', 3, 1);
    INSERT INTO line VALUES
      (1, 100, 1, 'מילת חיפוש מוסתרת'),
      (2, 200, 1, 'מילת חיפוש גלויה'),
      (3, 300, 1, 'מילת חיפוש גלויה');
    INSERT INTO test_padding VALUES (zeroblob(1100000));
  `);
  const insertBook = database.prepare(
    'INSERT INTO book (id, categoryId, title, orderIndex, source_id) VALUES (?, 1, ?, ?, 1)'
  );
  const insertLine = database.prepare(
    'INSERT INTO line (id, bookId, lineIndex, content) VALUES (?, ?, 1, ?)'
  );
  database.transaction(() => {
    excludedBookIds.forEach((bookId, index) => {
      insertBook.run(bookId, `ספר בדיקה מספר ${bookId}`, index + 4);
      insertLine.run(bookId + 10000, bookId, 'מילת חיפוש מוסתרת');
    });
  })();
  database.close();
  seforim = await import('../../src/services/seforimDatabase.js');
});

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('excludes source and explicit numeric book IDs from catalog/count/category lists', () => {
  const catalog = seforim.getCatalogFromDb();

  assert.ok(catalog);
  assert.deepEqual(
    catalog.books.map(book => book.id).sort((a, b) => Number(a) - Number(b)),
    [200, 300]
  );
  assert.equal(catalog.totalBooksCount, 2);
  assert.deepEqual(
    catalog.categories[0].books?.map(book => book.id).sort((a, b) => Number(a) - Number(b)),
    [200, 300]
  );
  assert.deepEqual(seforim.getAllowedBookIds().sort((a, b) => a - b), [200, 300]);
  assert.equal(seforim.getDatabaseDetails().booksCount, 2);
  assert.equal(seforim.getDbDiagnosticsReport().bookCount, 2);
  assert.deepEqual(seforim.getBookIdsForCategory(1).sort((a, b) => a - b), [200, 300]);
});

test('excludes source and explicit numeric IDs from full-text search, not title matches', () => {
  const results = seforim.searchDatabase('מילת חיפוש');

  assert.ok(results);
  assert.deepEqual(results.results.map(result => result.bookId).sort((a, b) => a - b), [200, 300]);
  assert.equal(results.totalBooks, 2);
  assert.equal(results.totalHits, 2);
});

test('blocks direct access by numeric ID, and does not exclude solely by title', () => {
  assert.equal(seforim.isExcludedBook(100), true);
  assert.equal(seforim.isExcludedBook(7978), true);
  assert.equal(seforim.isExcludedBook('7978'), true);
  assert.equal(seforim.isExcludedBook(7917), true);
  assert.equal(seforim.isExcludedBook(7921), true);
  assert.equal(seforim.isExcludedBook(5456), true);
  assert.equal(seforim.isExcludedBook('ספר ויקימקור'), false);
  assert.equal(seforim.isExcludedBook('שו"ת רבי שלמה ברוך'), false);
  assert.equal(seforim.isExcludedBook(200), false);
  assert.equal(seforim.getBookContentFromDb(100), null);
  assert.equal(seforim.getBookTocFromDb(100), null);
  assert.equal(seforim.getBookLinksFromDb(100, 1), null);
  assert.deepEqual(seforim.getAllBookCommentatorsFromDb(100), []);
  assert.equal(seforim.searchInBookFromDb(100, 'מילת'), null);
  assert.deepEqual(seforim.searchBookLinesInDb(100, 'מילת'), []);
  assert.equal(seforim.getBookContentFromDb(7978), null);
  assert.equal(seforim.getBookContentFromDb(7917), null);
  assert.equal(seforim.getBookContentFromDb(7921), null);
  assert.equal(seforim.getBookContentFromDb(200)?.title, 'ספר רגיל');
  assert.equal(seforim.getBookContentFromDb(300)?.title, 'שו"ת רבי שלמה ברוך');
});
