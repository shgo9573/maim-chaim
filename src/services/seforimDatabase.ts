import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Decoder } from '@toondepauw/node-zstd';
import { BookItem, CategoryNode, CatalogData, TocNode, CommentaryLink, SearchResultItem } from '../types/otzaria.js';
import { CANONICAL_BOOKS } from '../data/otzariaLibraryData.js';
import { buildComprehensiveCatalog } from '../data/catalogGenerator.js';
import { sysLogger } from './logger.js';
import { sortCommentariesByGeneration } from '../utils/generationOrder.js';
import { stripNikud } from '../utils/gematria.js';
import { buildHebrewSearchRegex, extractSearchSnippet } from '../utils/searchHelpers.js';

let dbInstance: any = null;
let resolvedDbPath: string | null = null;
let isInitAttempted = false;

// Candidate locations where seforim.db can be found
const homeDir = process.env.HOME || process.env.USERPROFILE || '';
const CANDIDATE_PATHS = [
  '/var/data/otzaria/seforim.db',
  process.env.SEFORIM_DB_PATH,
  '/data/seforim.db',
  path.resolve(process.cwd(), 'seforim.db'),
  path.resolve(process.cwd(), '../seforim.db'),
  path.resolve(process.cwd(), 'data/seforim.db'),
  path.resolve(process.cwd(), '../data/seforim.db'),
  '/home/opc/seforim.db',
  '/home/opc/otzaria-backend/seforim.db',
  homeDir ? path.join(homeDir, 'seforim.db') : '',
  homeDir ? path.join(homeDir, 'otzaria-backend', 'seforim.db') : '',
  homeDir ? path.join(homeDir, 'otzaria', 'seforim.db') : '',
  '/home/ubuntu/seforim.db',
  '/home/ubuntu/otzaria-backend/seforim.db'
].filter(Boolean) as string[];

/**
 * Resolves the SQLite database file on disk
 */
export function getDatabasePath(): string | null {
  if (resolvedDbPath && fs.existsSync(resolvedDbPath)) {
    return resolvedDbPath;
  }

  for (const candidate of CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      try {
        const stats = fs.statSync(candidate);
        if (stats.size > 1000000) { // must be a real DB file (>1MB)
          resolvedDbPath = candidate;
          return resolvedDbPath;
        }
      } catch {}
    }
  }

  return null;
}

let dbEngineType: 'better-sqlite3' | 'cloud' = 'cloud';
let lastDbError: string | null = null;
let lastConnectAttempt = 0;

// High-performance in-memory cache
const tableColumnsCache = new Map<string, string[]>();
const bookLookupCache = new Map<string, { id: number; title: string } | null>();
const bookContentCache = new Map<string, { id: number | string; title: string; content: string; totalLines: number }>();
const bookTocCache = new Map<string, TocNode[]>();
const bookLinksCache = new Map<string, any>();
const inFlightLinksPromises = new Map<string, Promise<any>>();
let fullCatalogCache: CatalogData | null = null;
let excludedBookIdsCache: Set<number> | null = null;
let allowedBookIdsCache: number[] | null = null;

const EXCLUDED_BOOK_SOURCE_NAME = 'wikisourceToOtzaria';
// Exclusions are keyed by numeric book IDs. Source relationships are also
// resolved to numeric IDs at startup, so book titles are never used to decide
// whether an item is excluded.
const EXCLUDED_BOOK_IDS = [
  3231, 3697, 3874, 5431, 5432, 5433, 5434, 5435, 5436, 5437, 5438, 5439, 5440, 5441, 5442, 5443, 5444, 5445, 5446, 5447, 5448, 5449, 5450, 5451, 5452, 5453, 5454, 5455, 5456, 5457, 5458, 5459, 5460, 5461, 5462, 5463, 5464, 5465, 5466, 5855, 5858, 5952, 6032, 6033, 6035, 6057, 6058, 6082, 6090, 6883, 6948, 7415, 7418, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7445, 7446, 7447, 7448, 7453, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7531, 7532, 7533, 7534, 7595, 7667, 7668, 7669, 7670, 7671, 7672, 7673, 7674, 7675, 7676, 7677, 7678, 7679, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7917, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7930, 7931, 7932, 7933, 7934, 7935, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7958, 7959, 7960, 7961, 7962, 7964, 7976, 7977, 7978, 7988, 7989, 7991, 7993, 8019, 8021, 8022, 8032, 8034
];

/**
 * Returns book IDs excluded by source metadata or the explicit numeric ID list.
 */

export function getExcludedBookIds(): ReadonlySet<number> {
  if (excludedBookIdsCache) return excludedBookIdsCache;

  const db = getDatabase();
  if (!db) {
    throw new Error('לא ניתן לבדוק ספרים מוחרגים: מסד הנתונים אינו זמין');
  }

  try {
    const tableColumns = (tableName: string): string[] =>
      db.prepare(`PRAGMA table_info("${tableName}")`)
        .all()
        .map((column: { name: string }) => column.name);

    const sourceColumns = tableColumns('source');
    const sourceIdColumn = sourceColumns.find(column => /^id$/i.test(column));
    const sourceNameColumn = sourceColumns.find(column => /^name$/i.test(column));
    if (!sourceIdColumn || !sourceNameColumn) {
      throw new Error('טבלת source או העמודות הנדרשות חסרות');
    }

    const excludedIds = new Set<number>(EXCLUDED_BOOK_IDS);
    const source = db.prepare(
      `SELECT "${sourceIdColumn}" AS id FROM source WHERE LOWER("${sourceNameColumn}") = LOWER(?) LIMIT 1`
    ).get(EXCLUDED_BOOK_SOURCE_NAME) as { id: number } | undefined;

    if (source) {
      const relationColumns = tableColumns('book_source');
      const relationBookId = relationColumns.find(column => /^book.*id$/i.test(column));
      const relationSourceId = relationColumns.find(column => /^source.*id$/i.test(column));

      if (relationBookId && relationSourceId) {
        const rows = db.prepare(
          `SELECT "${relationBookId}" AS id FROM book_source WHERE "${relationSourceId}" = ?`
        ).all(source.id) as Array<{ id: number }>;
        rows.forEach(row => excludedIds.add(Number(row.id)));
      }

      const bookColumns = tableColumns('book');
      const bookIdColumn = bookColumns.find(column => /^id$/i.test(column));
      const bookSourceId = bookColumns.find(column => /^source.*id$/i.test(column));
      if (bookSourceId) {
        const rows = db.prepare(
          `SELECT "${bookIdColumn || 'id'}" AS id FROM book WHERE "${bookSourceId}" = ?`
        ).all(source.id) as Array<{ id: number }>;
        rows.forEach(row => excludedIds.add(Number(row.id)));
      }

      if (!relationBookId && !bookSourceId) {
        throw new Error('לא נמצא קשר בין ספרים למקורות');
      }
    }

    excludedBookIdsCache = excludedIds;
    return excludedIds;
  } catch (error) {
    sysLogger.addLog('error', 'SQLite', `טעינת ספרים מוחרגים נכשלה: ${error}`);
    throw error;
  }
}

export function isExcludedBook(bookId: number | string): boolean {
  // API routes pass book IDs. Do not infer exclusion from a title string.
  const rawId = typeof bookId === 'number' ? String(bookId) : String(bookId ?? '').trim();
  if (!/^\d+$/.test(rawId)) return false;

  const numericId = Number(rawId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) return false;

  return getExcludedBookIds().has(numericId);
}

export function getAllowedBookIds(): number[] {
  if (allowedBookIdsCache) return allowedBookIdsCache;
  const catalog = getCatalogFromDb();
  if (!catalog) {
    throw new Error('לא ניתן לטעון קטלוג ספרים לצורך סינון חיפוש');
  }
  allowedBookIdsCache = Array.from(
    new Set(catalog.books.map(book => Number(book.id)).filter(Number.isFinite))
  );
  return allowedBookIdsCache;
}

function excludedBookIdSql(column: string): string {
  const ids = Array.from(getExcludedBookIds());
  return ids.length > 0 ? `${column} NOT IN (${ids.join(',')})` : '1 = 1';
}

/**
 * Initializes and returns SQLite connection without permanent failure lock
 */
function getDatabase() {
  if (dbInstance) return dbInstance;

  // Rate limit reconnection attempts to once per 2 seconds
  const now = Date.now();
  if (now - lastConnectAttempt < 2000) {
    return null;
  }
  lastConnectAttempt = now;

  const dbPath = getDatabasePath();

  if (!dbPath) {
    lastDbError = 'קובץ seforim.db לא נמצא בנתיבי המערכת';
    return null;
  }

  console.log(`[SQLite] Connecting to seforim.db at: ${dbPath}`);
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      db.pragma('cache_size = -65536'); // 64MB cache
      db.pragma('query_only = ON');
    } catch (pe: any) {
      console.warn('[SQLite] Pragma notice:', pe.message);
    }
    
    dbEngineType = 'better-sqlite3';
    dbInstance = {
      type: 'better-sqlite3',
      rawDb: db,
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          all: (...params: any[]) => stmt.all(...params),
          get: (...params: any[]) => stmt.get(...params)
        };
      }
    };
    lastDbError = null;
    console.log(`[SQLite] Database successfully ready at ${dbPath}`);
    sysLogger.addLog('success', 'SQLite', `מסד הנתונים seforim.db חובר בהצלחה! (${dbPath})`);
    return dbInstance;
  } catch (err: any) {
    lastDbError = err.message;
    console.error(`[SQLite] Error opening ${dbPath}:`, err.message);
    sysLogger.addLog('error', 'SQLite', `שגיאה בפתיחת seforim.db: ${err.message}`);
    return null;
  }
}

/**
 * Return diagnostic report of SQLite database connectivity and tables
 */
export function getDbDiagnosticsReport(): Record<string, any> {
  const dbPath = getDatabasePath();
  const db = getDatabase();
  const status: Record<string, any> = {
    searchedPaths: CANDIDATE_PATHS,
    resolvedDbPath: dbPath,
    fileExists: dbPath ? fs.existsSync(dbPath) : false,
    fileSizeMB: dbPath && fs.existsSync(dbPath) ? Math.round(fs.statSync(dbPath).size / (1024 * 1024)) : 0,
    connected: db !== null,
    engine: dbEngineType,
    lastError: lastDbError
  };

  if (db && db.prepare) {
    try {
      const tables = queryAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`);
      status.tables = tables.map(t => t.name);

      if (status.tables.includes('book')) {
        const bookCount = queryGet<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM book WHERE ${excludedBookIdSql('id')}`
        );
        status.bookCount = bookCount?.cnt || 0;
      }
      if (status.tables.includes('category')) {
        const catCount = queryGet<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM category`);
        status.categoryCount = catCount?.cnt || 0;
      }
      if (status.tables.includes('line')) {
        const lineCount = queryGet<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM line`);
        status.lineCount = lineCount?.cnt || 0;
      }
    } catch (e: any) {
      status.queryError = e.message;
    }
  }

  return status;
}

/**
 * Execute SQL query returning array of rows
 */
function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const db = getDatabase();
  if (!db || !db.prepare) return [];

  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  } catch (e: any) {
    sysLogger.addLog('error', 'SQLite', `שגיאה בהרצת שאילתה: ${e.message}`);
    return [];
  }
}

/**
 * Execute SQL query returning single row
 */
function queryGet<T = any>(sql: string, params: any[] = []): T | null {
  const db = getDatabase();
  if (!db) return null;

  if (db.prepare) {
    try {
      const stmt = db.prepare(sql);
      if (stmt.get) {
        return (stmt.get(...params) as T) || null;
      }
      const rows = stmt.all(...params);
      return rows.length > 0 ? (rows[0] as T) : null;
    } catch (e: any) {
      sysLogger.addLog('error', 'SQLite', `שגיאה בהרצת שאילתה (get): ${e.message}`);
      return null;
    }
  }

  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Database health check & status details
 */
export function getDatabaseDetails(): {
  available: boolean;
  path: string | null;
  sizeBytes: number;
  sizeGB: string;
  engine: string;
  booksCount: number;
} {
  const p = getDatabasePath();
  if (!p) {
    return {
      available: false,
      path: null,
      sizeBytes: 0,
      sizeGB: '0 GB',
      engine: 'none',
      booksCount: 0
    };
  }

  let size = 0;
  try {
    const stats = fs.statSync(p);
    size = stats.size;
  } catch {}

  let booksCount = 0;
  try {
    const countRow = queryGet<{ count: number }>(
      `SELECT count(*) as count FROM book WHERE ${excludedBookIdSql('id')}`
    );
    if (countRow) booksCount = countRow.count;
  } catch {}

  return {
    available: true,
    path: p,
    sizeBytes: size,
    sizeGB: (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
    engine: dbEngineType,
    booksCount
  };
}

/**
 * Is the official seforim.db active and ready?
 */
export function isSeforimDbAvailable(): boolean {
  return getDatabasePath() !== null;
}

/**
 * Retrieves table column names via standard PRAGMA table_info (cached)
 */
function getTableColumns(tableName: string): string[] {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName)!;
  }
  try {
    const rows = queryAll<{ name: string }>(`PRAGMA table_info("${tableName}")`);
    const cols = rows.map(r => r.name);
    if (cols.length > 0) {
      tableColumnsCache.set(tableName, cols);
    }
    return cols;
  } catch {
    return [];
  }
}

/**
 * Retrieves the full library catalog from the official seforim.db
 * Matching CategoryQueries.sq & BookQueries.sq dynamically
 */
export function getCatalogFromDb(): CatalogData | null {
  if (!isSeforimDbAvailable()) return null;
  if (fullCatalogCache) return fullCatalogCache;

  try {
    const excludedBookIds = getExcludedBookIds();
    const catCols = getTableColumns('category');
    if (catCols.length === 0) return null;

    const catIdCol = catCols.find(c => /^id$/i.test(c)) || 'id';
    const catParentCol = catCols.find(c => /parent/i.test(c)) || 'parentId';
    const catTitleCol = catCols.find(c => /title|name/i.test(c)) || 'title';
    const catOrderCol = catCols.find(c => /order/i.test(c)) || catIdCol;

    // 1. Fetch all categories
    const categoriesRows = queryAll<any>(`
      SELECT "${catIdCol}" AS id, "${catParentCol}" AS parentId, "${catTitleCol}" AS title
      FROM category
      ORDER BY "${catOrderCol}" ASC, "${catTitleCol}" ASC
    `);

    if (categoriesRows.length === 0) return null;

    // Build category paths
    const catMap = new Map<number, { id: number; parentId: number | null; title: string; fullPath: string }>();
    categoriesRows.forEach(c => {
      catMap.set(c.id, { id: c.id, parentId: c.parentId, title: c.title, fullPath: c.title });
    });

    const resolveFullPath = (id: number): string => {
      const cat = catMap.get(id);
      if (!cat) return '';
      if (!cat.parentId) return cat.title;
      const parentPath = resolveFullPath(cat.parentId);
      return parentPath ? `${parentPath}/${cat.title}` : cat.title;
    };

    categoriesRows.forEach(c => {
      const fullPath = resolveFullPath(c.id);
      const item = catMap.get(c.id);
      if (item) item.fullPath = fullPath;
    });

    // 2. Fetch all books
    const bookCols = getTableColumns('book');
    const bookIdCol = bookCols.find(c => /^id$/i.test(c)) || 'id';
    const bookCatCol = bookCols.find(c => /category/i.test(c)) || 'categoryId';
    const bookTitleCol = bookCols.find(c => /title|name/i.test(c)) || 'title';
    const bookOrderCol = bookCols.find(c => /order/i.test(c)) || bookIdCol;
    const bookDescCol = bookCols.find(c => /desc|short/i.test(c));
    const bookPubDateCol = bookCols.find(c => /(pub|publish|publication).*(date|year)|(date|year).*(pub|publish|publication)/i.test(c));
    const bookPubPlaceCol = bookCols.find(c => /(pub|publish|publication).*(place|location|city)|(place|location|city).*(pub|publish|publication)/i.test(c));

    const selectDesc = bookDescCol ? `b."${bookDescCol}" AS heShortDesc,` : '';
    const selectPubDate = bookPubDateCol ? `b."${bookPubDateCol}" AS pubDate,` : '';
    const selectPubPlace = bookPubPlaceCol ? `b."${bookPubPlaceCol}" AS pubPlace,` : '';

    let booksRows: Array<{
      id: number;
      categoryId: number;
      title: string;
      heShortDesc?: string | null;
      pubDate?: string | null;
      pubPlace?: string | null;
      orderIndex?: number;
      author?: string | null;
      generationName?: string | null;
    }> = [];

    // Fetch books with authors (using clean valid schema without non-existent generationId)
    const hasBookAuthor = getTableColumns('book_author').length > 0;
    if (hasBookAuthor) {
      try {
        booksRows = queryAll(`
          SELECT b."${bookIdCol}" AS id, b."${bookCatCol}" AS categoryId, b."${bookTitleCol}" AS title,
                 ${selectDesc} ${selectPubDate} ${selectPubPlace} b."${bookOrderCol}" AS orderIndex,
                 a.name AS author
          FROM book b
          LEFT JOIN book_author ba ON b."${bookIdCol}" = ba.bookId
          LEFT JOIN author a ON ba.authorId = a.id
          ORDER BY b."${bookOrderCol}" ASC, b."${bookTitleCol}" ASC
        `);
      } catch (err: any) {
        console.warn('[SQLite Catalog] Notice on joined book query:', err.message);
      }
    }

    if (booksRows.length === 0) {
      booksRows = queryAll(`
        SELECT b."${bookIdCol}" AS id, b."${bookCatCol}" AS categoryId, b."${bookTitleCol}" AS title,
               ${selectDesc} ${selectPubDate} ${selectPubPlace} b."${bookOrderCol}" AS orderIndex
        FROM book b
        ORDER BY b."${bookOrderCol}" ASC, b."${bookTitleCol}" ASC
      `);
    }

    booksRows = booksRows.filter(book => !excludedBookIds.has(Number(book.id)));
    if (booksRows.length === 0) return null;

    console.log(`[SQLite Catalog] Successfully loaded ${categoriesRows.length} categories and ${booksRows.length} books from seforim.db!`);

    const books: BookItem[] = booksRows.map(b => {
      const cat = catMap.get(b.categoryId);
      const catPath = cat ? cat.fullPath : 'ספרים כלליים';
      return {
        id: b.id,
        title: b.title,
        categoryPath: catPath,
        author: b.author || '',
        heCategories: catPath,
        heEra: b.generationName || '',
        fileType: 'txt',
        order: b.orderIndex || 1,
        hasToc: true,
        hasLinks: true,
        heDesc: b.heShortDesc || '',
        pubDate: b.pubDate || undefined,
        pubPlace: b.pubPlace || undefined
      };
    });

    // 3. Build CategoryNode tree
    const rootCategories: CategoryNode[] = [];
    const nodeMap = new Map<number, CategoryNode>();

    categoriesRows.forEach(c => {
      const fullPath = catMap.get(c.id)?.fullPath || c.title;
      const node: CategoryNode = {
        id: String(c.id),
        name: c.title,
        path: fullPath,
        children: [],
        books: []
      };
      nodeMap.set(c.id, node);
    });

    categoriesRows.forEach(c => {
      const node = nodeMap.get(c.id)!;
      if (c.parentId && nodeMap.has(c.parentId)) {
        nodeMap.get(c.parentId)!.children!.push(node);
      } else {
        rootCategories.push(node);
      }
    });

    // Populate books into category nodes in O(N) while preventing duplicates (ensures clean DOM & removes same key console warnings)
    const addedBookIdsInCat = new Map<number, Set<number | string>>();

    books.forEach((book, i) => {
      const catId = booksRows[i]?.categoryId;
      if (catId && nodeMap.has(catId)) {
        if (!addedBookIdsInCat.has(catId)) {
          addedBookIdsInCat.set(catId, new Set());
        }
        const set = addedBookIdsInCat.get(catId)!;
        if (!set.has(book.id)) {
          set.add(book.id);
          nodeMap.get(catId)!.books!.push(book);
        } else {
          // Merge authors if book has multiple authors across rows
          if (book.author) {
            const existingBook = nodeMap.get(catId)!.books!.find(b => b.id === book.id);
            if (existingBook && existingBook.author && !existingBook.author.includes(book.author)) {
              existingBook.author += `, ${book.author}`;
            }
          }
        }
      }
    });

    fullCatalogCache = {
      totalBooksCount: books.length,
      categoriesCount: categoriesRows.length,
      books,
      categories: rootCategories
    };
    allowedBookIdsCache = Array.from(
      new Set(books.map(book => Number(book.id)).filter(Number.isFinite))
    );

    return fullCatalogCache;
  } catch (err: any) {
    console.error('[SQLite Catalog] Error building catalog from DB:', err.message);
    sysLogger.addLog('error', 'SQLite', `שגיאה בטעינת קטלוג מ-seforim.db: ${err.message}`);
    return null;
  }
}

/**
 * Finds a book in SQLite by ID, exact title, canonical map, or fuzzy title (cached)
 */
function findBookInDb(bookId: number | string): { id: number; title: string; totalLines?: number } | null {
  const cacheKey = String(bookId).trim();
  if (bookLookupCache.has(cacheKey)) {
    const cachedBook = bookLookupCache.get(cacheKey)!;
    return cachedBook && getExcludedBookIds().has(cachedBook.id) ? null : cachedBook;
  }

  const numId = Number(bookId);
  const strId = String(bookId).trim();

  let found: { id: number; title: string } | null = null;

  // 1. Direct ID match
  if (!isNaN(numId)) {
    found = queryGet<{ id: number; title: string }>(
      'SELECT id, title FROM book WHERE id = ? LIMIT 1',
      [numId]
    );
  }

  // 2. Exact title match
  if (!found) {
    found = queryGet<{ id: number; title: string }>(
      'SELECT id, title FROM book WHERE title = ? LIMIT 1',
      [strId]
    );
  }

  // 3. Resolve canonical fallback ID (e.g. 1001 => "בראשית")
  if (!found) {
    const canonical = CANONICAL_BOOKS.find(b => b.id === numId || String(b.id) === strId);
    if (canonical) {
      found = queryGet<{ id: number; title: string }>(
        'SELECT id, title FROM book WHERE title = ? OR title LIKE ? LIMIT 1',
        [canonical.title, `%${canonical.title}%`]
      );
    }
  }

  // 4. Normalized title match
  if (!found) {
    const cleanTitle = strId
      .replace(/^תלמוד בבלי\s+/, '')
      .replace(/^משנה\s+/, '')
      .replace(/^ספר\s+/, '')
      .replace(/^חומש\s+/, '')
      .trim();

    if (cleanTitle && cleanTitle !== strId) {
      found = queryGet<{ id: number; title: string }>(
        'SELECT id, title FROM book WHERE title = ? LIMIT 1',
        [cleanTitle]
      );
    }
  }

  // 5. Fuzzy LIKE match
  if (!found) {
    const cleanTitle = strId.replace(/^(תלמוד בבלי|משנה|ספר|חומש)\s+/, '').trim();
    found = queryGet<{ id: number; title: string }>(
      'SELECT id, title FROM book WHERE title LIKE ? OR title LIKE ? LIMIT 1',
      [`%${strId}%`, `%${cleanTitle}%`]
    );
  }

  if (found && getExcludedBookIds().has(found.id)) {
    found = null;
  }

  bookLookupCache.set(cacheKey, found);
  return found;
}

export interface BookLineItem {
  lineIndex: number;
  content: string;
  heRef?: string;
}

const zstdDictionaryCache = new Map<number, Buffer>();
const zstdDecoderCache = new Map<number, Decoder>();
let zstdDictionariesLoaded = false;

function getZstdDictionaries(): Map<number, Buffer> {
  if (zstdDictionariesLoaded) return zstdDictionaryCache;
  const db = getDatabase();
  if (!db) throw new Error('SQLite database is unavailable while loading Zstandard dictionaries');
  const dictColumn = getTableColumns('zstd_dict').find(column => /^dict$/i.test(column));
  if (!dictColumn) throw new Error('Schema-6 compressed book text requires zstd_dict.dict');

  const rows = db.prepare('SELECT "' + dictColumn + '" AS dictionary FROM zstd_dict').all() as Array<{
    dictionary: Buffer | Uint8Array | null;
  }>;
  for (const row of rows) {
    if (!row.dictionary) continue;
    const dictionary = Buffer.isBuffer(row.dictionary) ? row.dictionary : Buffer.from(row.dictionary);
    if (dictionary.length < 8) continue;
    const dictionaryId = dictionary.readUInt32LE(0) === 0xec30a437 ? dictionary.readUInt32LE(4) : 0;
    zstdDictionaryCache.set(dictionaryId, dictionary);
  }
  if (zstdDictionaryCache.size === 0) throw new Error('No usable Zstandard dictionaries were found in zstd_dict');
  zstdDictionariesLoaded = true;
  return zstdDictionaryCache;
}

function getZstdFrameDictionaryId(frame: Buffer): number {
  if (frame.length < 5 || frame.readUInt32LE(0) !== 0xfd2fb528) {
    throw new Error('Invalid Zstandard frame in line_content.content');
  }
  const descriptor = frame[4];
  const idLength = [0, 1, 2, 4][descriptor & 0x03];
  if (idLength === 0) return 0;
  let offset = 5;
  if ((descriptor & 0x20) === 0) offset += 1;
  if (offset + idLength > frame.length) throw new Error('Truncated Zstandard frame dictionary ID');
  if (idLength === 1) return frame.readUInt8(offset);
  if (idLength === 2) return frame.readUInt16LE(offset);
  return frame.readUInt32LE(offset);
}

function decodeStoredLineContent(value: unknown, isSplitCompressedContent: boolean): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(String(value), 'utf8');

  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0xfd2fb528) {
    if (!isSplitCompressedContent) return bytes.toString('utf8');
    const dictionaries = getZstdDictionaries();
    const dictionaryId = getZstdFrameDictionaryId(bytes);
    let decoder = zstdDecoderCache.get(dictionaryId);
    if (!decoder) {
      const dictionary = dictionaries.get(dictionaryId);
      if (dictionaryId !== 0 && !dictionary) {
        throw new Error('Zstandard dictionary ' + dictionaryId + ' required by book text is missing');
      }
      decoder = dictionary ? new Decoder(dictionary) : new Decoder();
      zstdDecoderCache.set(dictionaryId, decoder);
    }
    return decoder.decodeSync(bytes).toString('utf8');
  }

  if (isSplitCompressedContent && Buffer.isBuffer(value)) {
    throw new Error('Expected a Zstandard frame in schema-6 line_content.content');
  }
  return bytes.toString('utf8');
}

/**
 * Retrieves book content from either legacy line.content or schema-6 line_content.content
 * blobs (Zstandard frames joined to line by line.id).
 */
export function getBookContentFromDb(
  bookId: number | string,
  startLine?: number,
  endLine?: number
): { id: number | string; title: string; content: string; lines: BookLineItem[]; totalLines: number } | null {
  if (!isSeforimDbAvailable()) return null;
  if (isExcludedBook(bookId)) return null;

  const cacheKey = String(bookId) + '_' + (startLine || 0) + '_' + (endLine || 0);
  if (bookContentCache.has(cacheKey)) return bookContentCache.get(cacheKey)! as any;

  try {
    const book = findBookInDb(bookId);
    if (!book) return null;

    const lineCols = getTableColumns('line');
    const lineIdCol = lineCols.find(column => /^id$/i.test(column));
    const bookIdCol = lineCols.find(column => /^book.*id$/i.test(column)) || 'bookId';
    const contentCol = lineCols.find(column => /content|text/i.test(column));
    const indexCol = lineCols.find(column => /line.*index|index|num/i.test(column)) || 'lineIndex';
    const refCol = lineCols.find(column => /he.*ref|ref/i.test(column));
    const splitCols = getTableColumns('line_content');
    const splitContentCol = splitCols.find(column => /^content$/i.test(column));
    const splitIdCol = splitCols.find(column => /^id$/i.test(column));
    const useSplitContent = !contentCol && !!lineIdCol && !!splitContentCol && !!splitIdCol;

    if (!contentCol && !useSplitContent) {
      throw new Error('No supported line text column found (expected line.content or line_content.content)');
    }

    const q = (column: string) => '"' + column.replace(/"/g, '""') + '"';
    const lineFrom = useSplitContent
      ? 'line l LEFT JOIN line_content lc ON lc.' + q(splitIdCol!) + ' = l.' + q(lineIdCol!)
      : 'line l';
    const contentExpr = useSplitContent ? 'lc.' + q(splitContentCol!) : 'l.' + q(contentCol!);
    const selectRef = refCol ? ', l.' + q(refCol) + ' AS heRef' : '';
    const countRow = queryGet<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM line l WHERE l.' + q(bookIdCol) + ' = ?',
      [book.id]
    );
    const totalLines = Number(countRow?.cnt ?? 0);

    let linesRows: Array<{ lineIndex: number; content: unknown; heRef?: string }> = [];

    if (startLine !== undefined && endLine !== undefined) {
      let actualStart = startLine;
      let actualEnd = endLine;
      // `start` may be a line id, but only when it cannot be a line index: a daf of
      // about 900 lines has a line index 920 too, and treating that as an id sent the
      // reader a completely different part of the book (and the daf's text was never
      // found, so its highlights could not be tied to the lines of the book).
      const looksLikeId = totalLines > 0 ? actualStart > totalLines : true;
      const idMatch = lineIdCol && looksLikeId
        ? queryGet<{ lineIndex: number }>(
            'SELECT l.' + q(indexCol) + ' AS lineIndex FROM line l WHERE l.' + q(lineIdCol) +
            ' = ? AND l.' + q(bookIdCol) + ' = ? LIMIT 1',
            [actualStart, book.id]
          )
        : null;

      if (idMatch && idMatch.lineIndex) {
        actualStart = idMatch.lineIndex;
        actualEnd = actualStart + 170;
      } else if (totalLines > 0 && actualStart > totalLines) {
        actualStart = 1;
        actualEnd = Math.min(totalLines, 170);
      } else {
        actualStart = Math.max(1, Math.min(actualStart, actualEnd));
        actualEnd = Math.max(actualStart + 50, Math.max(startLine, endLine));
      }

      const rangeSql = 'SELECT l.' + q(indexCol) + ' AS lineIndex, ' + contentExpr + ' AS content' + selectRef +
        ' FROM ' + lineFrom + ' WHERE l.' + q(bookIdCol) + ' = ? AND l.' + q(indexCol) +
        ' >= ? AND l.' + q(indexCol) + ' <= ? ORDER BY l.' + q(indexCol) + ' ASC';
      linesRows = queryAll(rangeSql, [book.id, actualStart, actualEnd]);

      if (linesRows.length === 0) {
        const fallbackSql = 'SELECT l.' + q(indexCol) + ' AS lineIndex, ' + contentExpr + ' AS content' + selectRef +
          ' FROM ' + lineFrom + ' WHERE l.' + q(bookIdCol) + ' = ? ORDER BY l.' + q(indexCol) + ' ASC LIMIT 170';
        linesRows = queryAll(fallbackSql, [book.id]);
      }
    } else {
      const allSql = 'SELECT l.' + q(indexCol) + ' AS lineIndex, ' + contentExpr + ' AS content' + selectRef +
        ' FROM ' + lineFrom + ' WHERE l.' + q(bookIdCol) + ' = ? ORDER BY l.' + q(indexCol) + ' ASC LIMIT 35000';
      linesRows = queryAll(allSql, [book.id]);
    }

    if (linesRows.length === 0) return null;
    const decodedLines: BookLineItem[] = linesRows.map(line => ({
      lineIndex: Number(line.lineIndex),
      content: decodeStoredLineContent(line.content, useSplitContent),
      ...(line.heRef ? { heRef: line.heRef } : {})
    }));
    const content = decodedLines.map(line => line.content).join('\n');
    const result = {
      id: book.id,
      title: book.title,
      content,
      lines: decodedLines,
      totalLines
    };

    if (bookContentCache.size > 50) {
      const firstKey = bookContentCache.keys().next().value;
      if (firstKey) bookContentCache.delete(firstKey);
    }
    bookContentCache.set(cacheKey, result as any);
    console.log('[SQLite Book] Loaded ' + decodedLines.length + ' decoded lines for "' +
      book.title + '" (ID: ' + book.id + ', schema6=' + useSplitContent + ')');
    return result;
  } catch (err: any) {
    console.error('[SQLite Book] Error loading content:', err.message);
    sysLogger.addLog('error', 'SQLite', 'שגיאה בשליפת תוכן ספר: ' + err.message);
    return null;
  }
}

/**
 * Fetches exact search-result lines in batches, including schema-6 compressed text.
 * Keys are "bookId:lineIndex" so the search API can fill missing result snippets without
 * requesting a whole book for every hit.
 */
export function getBookLineSnippets(
  refs: Array<{ bookId: number | string; lineIndex: number }>
): Map<string, string> {
  const snippets = new Map<string, string>();
  if (!Array.isArray(refs) || refs.length === 0 || !isSeforimDbAvailable()) return snippets;

  const unique = new Map<string, { bookId: number; lineIndex: number }>();
  for (const ref of refs) {
    const rawId = String(ref?.bookId ?? '').trim();
    const bookId = Number(rawId);
    const lineIndex = Number(ref?.lineIndex);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(bookId) || bookId <= 0 ||
        !Number.isSafeInteger(lineIndex) || lineIndex < 0) continue;
    unique.set(`${bookId}:${lineIndex}`, { bookId, lineIndex });
    if (unique.size >= 300) break;
  }
  if (unique.size === 0) return snippets;

  try {
    const lineCols = getTableColumns('line');
    const lineIdCol = lineCols.find(column => /^id$/i.test(column));
    const bookIdCol = lineCols.find(column => /^book.*id$/i.test(column)) || 'bookId';
    const contentCol = lineCols.find(column => /content|text/i.test(column));
    const indexCol = lineCols.find(column => /line.*index|index|num/i.test(column)) || 'lineIndex';
    const splitCols = getTableColumns('line_content');
    const splitContentCol = splitCols.find(column => /^content$/i.test(column));
    const splitIdCol = splitCols.find(column => /^id$/i.test(column));
    const useSplitContent = !contentCol && !!lineIdCol && !!splitContentCol && !!splitIdCol;
    if (!contentCol && !useSplitContent) return snippets;

    const q = (column: string) => '"' + column.replace(/"/g, '""') + '"';
    const lineFrom = useSplitContent
      ? 'line l LEFT JOIN line_content lc ON lc.' + q(splitIdCol!) + ' = l.' + q(lineIdCol!)
      : 'line l';
    const contentExpr = useSplitContent ? 'lc.' + q(splitContentCol!) : 'l.' + q(contentCol!);
    const entries = [...unique.values()];

    // Keep each SQL expression and parameter list comfortably below SQLite limits.
    for (let offset = 0; offset < entries.length; offset += 100) {
      const batch = entries.slice(offset, offset + 100);
      const pairConditions = batch.map(() => '(l.' + q(bookIdCol) + ' = ? AND l.' + q(indexCol) + ' = ?)').join(' OR ');
      const params = batch.flatMap(item => [item.bookId, item.lineIndex]);
      const rows = queryAll<{ bookId: number | string; lineIndex: number; content: unknown }>(
        'SELECT l.' + q(bookIdCol) + ' AS bookId, l.' + q(indexCol) + ' AS lineIndex, ' +
        contentExpr + ' AS content FROM ' + lineFrom + ' WHERE (' + pairConditions + ') AND ' +
        excludedBookIdSql('l.' + q(bookIdCol)),
        params
      );
      for (const row of rows) {
        const content = decodeStoredLineContent(row.content, useSplitContent);
        if (content.trim()) snippets.set(`${row.bookId}:${Number(row.lineIndex)}`, content);
      }
    }
  } catch (error: any) {
    console.warn('[SQLite Search Snippets] Could not load missing result text:', error?.message || error);
  }
  return snippets;
}

/**
 * Retrieves Table of Contents matching TocQueries.sq selectByBookId with dynamic schema compatibility
 */
export function getBookTocFromDb(bookId: number | string): TocNode[] | null {
  if (!isSeforimDbAvailable()) return null;
  if (isExcludedBook(bookId)) return null;

  const cacheKey = String(bookId);
  if (bookTocCache.has(cacheKey)) {
    return bookTocCache.get(cacheKey)!;
  }

  try {
    const book = findBookInDb(bookId);
    if (!book) return null;

    // Support both table schemas: `toc` (standard SQLite schema) and `tocEntry` (extended schema)
    const hasSimpleToc = getTableColumns('toc').length > 0;
    if (hasSimpleToc) {
      const simpleRows = queryAll<{ id: number; text: string; lineIndex: number }>(`
        SELECT id, text, lineIndex FROM toc WHERE bookId = ? ORDER BY lineIndex ASC, id ASC
      `, [book.id]);
      if (simpleRows.length > 0) {
        const res = simpleRows.map(r => ({
          title: r.text,
          index: r.lineIndex,
          level: 1
        }));
        bookTocCache.set(cacheKey, res);
        return res;
      }
    }

    const tocCols = getTableColumns('tocEntry');
    if (tocCols.length === 0) return [];

    const tocBookIdCol = tocCols.find(c => /book.*id/i.test(c)) || 'bookId';
    const tocLevelCol = tocCols.find(c => /level/i.test(c)) || 'level';
    const tocTextIdCol = tocCols.find(c => /text.*id/i.test(c)) || 'textId';
    const tocLineIdCol = tocCols.find(c => /line.*id/i.test(c)) || 'lineId';
    const hasTocLineIndex = tocCols.some(c => /line.*index/i.test(c));
    const tocLineIndexCol = hasTocLineIndex ? (tocCols.find(c => /line.*index/i.test(c)) || 'lineIndex') : null;

    // Total lines in book to validate that lineIndex is strictly a local line index
    const countRow = queryGet<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt FROM line WHERE bookId = ?
    `, [book.id]);
    const totalLines = countRow ? countRow.cnt : 0;

    // Single fast query using dynamic schema to avoid "no such column" errors
    const selectTocLineIndex = tocLineIndexCol ? `t."${tocLineIndexCol}"` : 'NULL';
    const rows = queryAll<{
      id: number;
      level: number;
      title: string;
      lineLineIndex: number | null;
      tocLineIndex: number | null;
      rawLineId: number | null;
    }>(`
      SELECT 
        t.id,
        t."${tocLevelCol}" AS level,
        COALESCE(tt.text, '') AS title,
        l.lineIndex AS lineLineIndex,
        ${selectTocLineIndex} AS tocLineIndex,
        t."${tocLineIdCol}" AS rawLineId
      FROM tocEntry t
      LEFT JOIN tocText tt ON t."${tocTextIdCol}" = tt.id
      LEFT JOIN line l ON t."${tocLineIdCol}" = l.id
      WHERE t."${tocBookIdCol}" = ?
      ORDER BY t.id ASC
    `, [book.id]);

    const result: TocNode[] = [];
    const totalRows = rows.length;
    let lastMonotonicIndex = 1;

    rows.forEach((r, idx) => {
      // 1. Prefer local lineIndex from joined line table
      let resolvedIndex = r.lineLineIndex;

      // 2. If line table JOIN didn't resolve, check tocLineIndex if valid
      if (!resolvedIndex && r.tocLineIndex && (totalLines === 0 || r.tocLineIndex <= totalLines)) {
        resolvedIndex = r.tocLineIndex;
      }

      // 3. If lineIndex is still missing or exceeds totalLines, attempt heading search in book lines
      if (!resolvedIndex || (totalLines > 0 && resolvedIndex > totalLines)) {
        const cleanTitle = (r.title || '').replace(/[-"'\״\׳:;,.]/g, '').trim();
        if (cleanTitle.length >= 2) {
          const matchedLine = queryGet<{ lineIndex: number }>(`
            SELECT lineIndex FROM line 
            WHERE bookId = ? AND (content LIKE ? OR content LIKE ?)
            LIMIT 1
          `, [book.id, `%${cleanTitle}%`, `%${r.title}%`]);

          if (matchedLine && matchedLine.lineIndex > 0) {
            resolvedIndex = matchedLine.lineIndex;
          }
        }

        // 4. If still not found, estimate proportionally from TOC order
        if (!resolvedIndex || (totalLines > 0 && resolvedIndex > totalLines)) {
          if (totalLines > 0 && totalRows > 1) {
            resolvedIndex = Math.max(1, Math.round((idx / (totalRows - 1)) * (totalLines - 1)) + 1);
          } else {
            resolvedIndex = Math.max(1, idx + 1);
          }
        }
      }

      let finalIndex = Math.max(1, resolvedIndex || 1);
      if (finalIndex < lastMonotonicIndex) {
        finalIndex = lastMonotonicIndex;
      }
      lastMonotonicIndex = finalIndex;

      result.push({
        title: r.title || `פרק ${finalIndex}`,
        index: finalIndex,
        level: r.level || 1
      });
    });

    bookTocCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    console.error('[SQLite TOC] Error loading TOC:', err.message);
    sysLogger.addLog('warn', 'SQLite', `שגיאה בשליפת TOC: ${err.message}`);
    return [];
  }
}

/**
 * Retrieves line commentaries matching LinkQueries.sq selectLinksBySourceLineIds (Fast 2-step indexed query & cached)
 */
export function getBookLinksFromDb(
  bookId: number | string,
  lineIndex: number
): {
  id: number | string;
  line: number;
  chapter?: number;
  verse?: number;
  dafLabel?: string;
  links: CommentaryLink[];
  allLinks: CommentaryLink[];
  availableCommentators: string[];
} | null {
  if (!isSeforimDbAvailable()) return null;
  if (isExcludedBook(bookId)) return null;

  const cacheKey = `${bookId}_${lineIndex}`;
  if (bookLinksCache.has(cacheKey)) {
    return bookLinksCache.get(cacheKey)!;
  }

  try {
    const book = findBookInDb(bookId);
    if (!book) return null;

    // Step 1: Instant lookup of source line primary key (0.1ms)
    const lineCols = getTableColumns('line');
    const bookIdCol = lineCols.find(c => /book.*id/i.test(c)) || 'bookId';
    const indexCol = lineCols.find(c => /line.*index|index|num/i.test(c)) || 'lineIndex';

    const sourceLine = queryGet<{ id: number; heRef?: string }>(`
      SELECT id, heRef
      FROM line
      WHERE "${bookIdCol}" = ? AND "${indexCol}" = ?
      LIMIT 1
    `, [book.id, lineIndex]);

    if (!sourceLine) {
      const emptyRes = {
        id: book.id,
        line: lineIndex,
        links: [],
        allLinks: [],
        availableCommentators: []
      };
      bookLinksCache.set(cacheKey, emptyRes);
      return emptyRes;
    }

    // Step 2: Read links across both directions and support schema-6's split line content.
    // In schema 6, line text is stored in line_content.content as Zstandard data;
    // selecting line.content raises a SQL error and sends the API to its empty fallback.
    const linkCols = getTableColumns('link');
    const hasSourceLineId = linkCols.includes('sourceLineId');
    const hasTargetLineId = linkCols.includes('targetLineId');
    const hasSourceBookId = linkCols.includes('sourceBookId');

    const inlineContentCol = lineCols.find(c => /^(content|text)$/i.test(c));
    const lineContentCols = getTableColumns('line_content');
    const splitContentCol = lineContentCols.find(c => /^content$/i.test(c));
    const splitContentIdCol = lineContentCols.find(c => /^id$/i.test(c));
    const useSplitContent = !inlineContentCol && !!splitContentCol && !!splitContentIdCol;
    if (!inlineContentCol && !useSplitContent) {
      throw new Error('No supported line text column found (expected line.content or line_content.content)');
    }

    const quoteIdentifier = (column: string) => '"' + column.replace(/"/g, '""') + '"';
    const lineTextExpr = (alias: string) => useSplitContent
      ? alias + 'c.' + quoteIdentifier(splitContentCol!)
      : alias + '.' + quoteIdentifier(inlineContentCol!);
    const lineTextJoin = (alias: string) => useSplitContent
      ? 'LEFT JOIN line_content ' + alias + 'c ON ' +
        alias + 'c.' + quoteIdentifier(splitContentIdCol!) + ' = ' + alias + '.' + quoteIdentifier('id')
      : '';

    let linkRows: Array<{
      id: number;
      connectionType?: string;
      targetBookTitle: string;
      targetText: unknown;
      targetLineIndex: number;
      targetHeRef: string | null;
      orderIndex?: number;
    }> = [];

    const connectionTypeExpr = linkCols.includes('connectionTypeId')
      ? 'ct.name'
      : linkCols.includes('connectionType')
        ? 'l.connectionType'
        : 'NULL';
    const connectionTypeJoin = linkCols.includes('connectionTypeId')
      ? 'LEFT JOIN connection_type ct ON l.connectionTypeId = ct.id'
      : '';

    if (hasSourceLineId && hasTargetLineId && linkCols.includes('sourceBookId') && linkCols.includes('targetBookId')) {
      // Current schema: direct line-ID links. Query both directions so commentary
      // orientation does not hide valid links when the current line is the target.
      linkRows = queryAll<{
        id: number;
        connectionType?: string;
        targetBookTitle: string;
        targetText: unknown;
        targetLineIndex: number;
        targetHeRef: string | null;
        orderIndex?: number;
      }>([
        'SELECT l.id, ' + connectionTypeExpr + ' AS connectionType,',
        '       b.title AS targetBookTitle, ' + lineTextExpr('tl') + ' AS targetText,',
        '       tl.lineIndex AS targetLineIndex, tl.heRef AS targetHeRef, b.orderIndex',
        'FROM link l',
        connectionTypeJoin,
        'JOIN book b ON l.targetBookId = b.id',
        'JOIN line tl ON l.targetLineId = tl.id',
        lineTextJoin('tl'),
        'WHERE l.sourceLineId = ?',
        'UNION ALL',
        'SELECT l.id, ' + connectionTypeExpr + ' AS connectionType,',
        '       b.title AS targetBookTitle, ' + lineTextExpr('tl') + ' AS targetText,',
        '       tl.lineIndex AS targetLineIndex, tl.heRef AS targetHeRef, b.orderIndex',
        'FROM link l',
        connectionTypeJoin,
        'JOIN book b ON l.sourceBookId = b.id',
        'JOIN line tl ON l.sourceLineId = tl.id',
        lineTextJoin('tl'),
        'WHERE l.targetLineId = ?',
        'ORDER BY orderIndex ASC'
      ].filter(Boolean).join('\n'), [sourceLine.id, sourceLine.id]);
    } else if (hasSourceBookId) {
      // Legacy schema: links carry book IDs and line indexes rather than line IDs.
      const legacyConnectionTypeCol = linkCols.find(c => /^connectionType$/i.test(c));
      const legacyConnectionTypeExpr = legacyConnectionTypeCol
        ? 'l.' + quoteIdentifier(legacyConnectionTypeCol)
        : 'NULL';
      linkRows = queryAll<{
        id: number;
        connectionType?: string;
        targetBookTitle: string;
        targetText: unknown;
        targetLineIndex: number;
        targetHeRef: string | null;
        orderIndex?: number;
      }>([
        'SELECT l.id, ' + legacyConnectionTypeExpr + ' AS connectionType,',
        '       b.title AS targetBookTitle, ' + lineTextExpr('tl') + ' AS targetText,',
        '       tl.lineIndex AS targetLineIndex, tl.heRef AS targetHeRef, b.orderIndex',
        'FROM link l',
        'JOIN book b ON b.id = l.sourceBookId',
        'JOIN line tl ON tl.bookId = l.sourceBookId AND tl.lineIndex = l.sourceLineIndex',
        lineTextJoin('tl'),
        'WHERE l.targetBookId = ? AND l.targetLineIndex = ?',
        'UNION ALL',
        'SELECT l.id, ' + legacyConnectionTypeExpr + ' AS connectionType,',
        '       b.title AS targetBookTitle, ' + lineTextExpr('tl') + ' AS targetText,',
        '       tl.lineIndex AS targetLineIndex, tl.heRef AS targetHeRef, b.orderIndex',
        'FROM link l',
        'JOIN book b ON b.id = l.targetBookId',
        'JOIN line tl ON tl.bookId = l.targetBookId AND tl.lineIndex = l.targetLineIndex',
        lineTextJoin('tl'),
        'WHERE l.sourceBookId = ? AND l.sourceLineIndex = ?',
        'ORDER BY orderIndex ASC'
      ].filter(Boolean).join('\n'), [book.id, lineIndex, book.id, lineIndex]);
    } else {
      throw new Error('Unsupported link schema: no source/target line or book identifiers');
    }
    const bookTitleClean = book.title.trim();
    const sourceRef = sourceLine.heRef || '';
    const otherBooksRegex = /שמות|ויקרא|במדבר|דברים|יהושע|שופטים|שמואל|מלכים|ישעיה|ירמיה|יחזקאל|תהילים|משלי|איוב/i;

    const links: CommentaryLink[] = linkRows
      .map(r => ({ ...r, targetText: decodeStoredLineContent(r.targetText, useSplitContent) }))
      .filter(r => {
        // 1. Must be a pure commentary/translation, not unrelated citations (like Talmud Yerushalmi, Zohar, etc.)
        const connType = (r.connectionType || '').toUpperCase();
        const isPureComm =
          connType === 'COMMENTARY' ||
          connType === 'TARGUM' ||
          connType === 'מפרש' ||
          connType === 'תרגום' ||
          connType === 'פירוש' ||
          r.targetBookTitle.includes(`על ${bookTitleClean}`) ||
          r.targetBookTitle.includes('על התורה') ||
          r.targetBookTitle.includes('על תורה');

        if (!isPureComm) return false;

        // 2. Exclude cross-references mentioning other books/chapters
        if (r.targetHeRef) {
          const ref = r.targetHeRef;
          if (bookTitleClean === 'בראשית' && otherBooksRegex.test(ref) && !ref.includes('בראשית')) {
            return false;
          }
          if (bookTitleClean === 'שמות' && /בראשית|ויקרא|במדבר|דברים/i.test(ref) && !ref.includes('שמות')) {
            return false;
          }
          if (sourceRef) {
            const chMatch = sourceRef.match(/,\s*([א-ת]+)\s*,/);
            if (chMatch) {
              const curChapter = chMatch[1];
              const targetChMatch = ref.match(/,\s*([א-ת]+)\s*,/);
              if (targetChMatch && targetChMatch[1] !== curChapter && ref.includes(book.title)) {
                return false;
              }
            }
          }
        }
        return true;
      })
      .map(r => ({
        sourceBook: r.targetBookTitle,
        category: r.connectionType || 'מפרש',
        line: r.targetLineIndex,
        text: r.targetText,
        dibburHamatchil: r.targetHeRef || undefined,
        isLineMatch: true,
        orderIndex: r.orderIndex
      }));

    const sortedLinks = sortCommentariesByGeneration(links);
    const availableCommentators = Array.from(new Set(sortedLinks.map(l => l.sourceBook)));

    const validDafLabel = (sourceLine.heRef && !/^\d+$/.test(sourceLine.heRef.trim())) ? sourceLine.heRef : undefined;

    const result = {
      id: book.id,
      line: lineIndex,
      dafLabel: validDafLabel,
      links: sortedLinks,
      allLinks: sortedLinks,
      availableCommentators
    };

    if (bookLinksCache.size > 200) {
      const firstK = bookLinksCache.keys().next().value;
      if (firstK) bookLinksCache.delete(firstK);
    }
    bookLinksCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    sysLogger.addLog('warn', 'SQLite', `שגיאה בשליפת קישורים: ${err.message}`);
    return null;
  }
}

const bookCommentatorsListCache = new Map<string, string[]>();

/**
 * Retrieves all commentators for a book matching Otzaria original selectCommentatorsByBook & default_commentator queries
 */
export function getAllBookCommentatorsFromDb(bookId: number | string): string[] {
  if (!isSeforimDbAvailable()) return [];
  if (isExcludedBook(bookId)) return [];

  const cacheKey = String(bookId);
  if (bookCommentatorsListCache.has(cacheKey)) {
    return bookCommentatorsListCache.get(cacheKey)!;
  }

  try {
    const book = findBookInDb(bookId);
    if (!book) return [];

    const bookCols = getTableColumns('book');
    const bookOrderCol = bookCols.find(c => /order.*index|order/i.test(c));
    const bookTitleCol = bookCols.find(c => /title|name/i.test(c)) || 'title';
    const bookIdCol = bookCols.find(c => /^id$/i.test(c)) || 'id';

    const orderClause = bookOrderCol ? `b."${bookOrderCol}" ASC, b."${bookTitleCol}" ASC` : `b."${bookTitleCol}" ASC`;

    // 1. Fetch defaults from default_commentator & default_targum if available (ordered by position)
    let defaultList: string[] = [];
    try {
      const defCols = getTableColumns('default_commentator');
      if (defCols.length > 0) {
        const defBookIdCol = defCols.find(c => /^book.*id$/i.test(c)) || 'bookId';
        const defCommBookIdCol = defCols.find(c => /commentator.*book.*id/i.test(c)) || 'commentatorBookId';
        const defPosCol = defCols.find(c => /position|order/i.test(c)) || 'position';

        const defRows = queryAll<{ targetBookTitle: string; position: number }>(`
          SELECT b."${bookTitleCol}" AS targetBookTitle, dc."${defPosCol}" AS position
          FROM default_commentator dc
          JOIN book b ON dc."${defCommBookIdCol}" = b."${bookIdCol}"
          WHERE dc."${defBookIdCol}" = ?
          ORDER BY dc."${defPosCol}" ASC
        `, [book.id]);
        defaultList.push(...defRows.map(r => r.targetBookTitle));
      }

      const targumCols = getTableColumns('default_targum');
      if (targumCols.length > 0) {
        const tBookIdCol = targumCols.find(c => /^book.*id$/i.test(c)) || 'bookId';
        const tCommBookIdCol = targumCols.find(c => /targum.*book.*id/i.test(c)) || 'targumBookId';
        const tPosCol = targumCols.find(c => /position|order/i.test(c)) || 'position';

        const targumRows = queryAll<{ targetBookTitle: string; position: number }>(`
          SELECT b."${bookTitleCol}" AS targetBookTitle, dt."${tPosCol}" AS position
          FROM default_targum dt
          JOIN book b ON dt."${tCommBookIdCol}" = b."${bookIdCol}"
          WHERE dt."${tBookIdCol}" = ?
          ORDER BY dt."${tPosCol}" ASC
        `, [book.id]);
        defaultList.push(...targumRows.map(r => r.targetBookTitle));
      }
    } catch (e: any) {
      console.warn('[SQLite Commentators] Default list notice:', e.message);
    }

    // 2. Fetch all commentators linked to this book matching Otzaria LinkQueries.sq
    let linkedTitles: string[] = [];
    const linkCols = getTableColumns('link');

    if (linkCols.length > 0) {
      const srcBookIdCol = linkCols.find(c => /source.*book.*id/i.test(c));
      const tgtBookIdCol = linkCols.find(c => /target.*book.*id/i.test(c)) || 'targetBookId';
      const connTypeCol = linkCols.find(c => /conn.*type.*id/i.test(c));
      const srcLineIdCol = linkCols.find(c => /source.*line.*id/i.test(c));

      // Strategy A: If link table has direct sourceBookId column
      if (srcBookIdCol) {
        try {
          if (connTypeCol) {
            const rows = queryAll<{ targetBookTitle: string }>(`
              SELECT DISTINCT b."${bookTitleCol}" AS targetBookTitle
              FROM link l
              JOIN connection_type ct ON l."${connTypeCol}" = ct.id
              JOIN book b ON l."${tgtBookIdCol}" = b."${bookIdCol}"
              WHERE l."${srcBookIdCol}" = ?
              AND ct.name IN ('COMMENTARY', 'SUPER_COMMENTARY', 'TARGUM', 'MIDRASH', 'PARSHANUT', 'DIBUR_HAMATCHIL', 'ELUCIDATION', 'FOOTNOTES')
              ORDER BY ${orderClause}
            `, [book.id]);
            linkedTitles = rows.map(r => r.targetBookTitle);
          } else {
            const rows = queryAll<{ targetBookTitle: string }>(`
              SELECT DISTINCT b."${bookTitleCol}" AS targetBookTitle
              FROM link l
              JOIN book b ON l."${tgtBookIdCol}" = b."${bookIdCol}"
              WHERE l."${srcBookIdCol}" = ?
              ORDER BY ${orderClause}
            `, [book.id]);
            linkedTitles = rows.map(r => r.targetBookTitle);
          }
        } catch (e: any) {
          console.warn('[SQLite Commentators] Direct link query notice:', e.message);
        }
      }

      // Strategy B: Join through sourceLine -> line.bookId if Strategy A returned 0 or wasn't available
      if (linkedTitles.length === 0 && srcLineIdCol) {
        try {
          const rows = queryAll<{ targetBookTitle: string }>(`
            SELECT DISTINCT b."${bookTitleCol}" AS targetBookTitle
            FROM link l
            JOIN line sl ON l."${srcLineIdCol}" = sl.id
            JOIN book b ON l."${tgtBookIdCol}" = b."${bookIdCol}"
            WHERE sl.bookId = ?
            ORDER BY ${orderClause}
          `, [book.id]);
          linkedTitles = rows.map(r => r.targetBookTitle);
        } catch (e: any) {
          console.warn('[SQLite Commentators] Line join query notice:', e.message);
        }
      }
    }

    // 3. Combine: defaults first (Rashi -> Tosafot -> etc.), then rest sorted by generation and authority
    const combinedSet = new Set<string>();
    defaultList.forEach(t => {
      if (t && t.trim()) combinedSet.add(t.trim());
    });

    // Sort remaining non-default commentators by generation hierarchy
    const nonDefaults = linkedTitles.filter(t => !combinedSet.has(t));
    const sortedNonDefaults = sortCommentariesByGeneration(nonDefaults);
    sortedNonDefaults.forEach(t => {
      if (t && t.trim()) combinedSet.add(t.trim());
    });

    const finalResult = Array.from(combinedSet);
    bookCommentatorsListCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (err: any) {
    console.error('[SQLite Commentators] Error:', err.message);
    return [];
  }
}

/**
 * Async wrapper with in-flight request coalescing to prevent duplicate concurrent queries
 */
export async function getBookLinksFromDbAsync(
  bookId: number | string,
  lineIndex: number
): Promise<{
  id: number | string;
  line: number;
  chapter?: number;
  verse?: number;
  dafLabel?: string;
  links: CommentaryLink[];
  allLinks: CommentaryLink[];
  availableCommentators: string[];
} | null> {
  if (!isSeforimDbAvailable()) return null;
  if (isExcludedBook(bookId)) return null;

  const cacheKey = `${bookId}_${lineIndex}`;
  if (bookLinksCache.has(cacheKey)) {
    return bookLinksCache.get(cacheKey)!;
  }

  if (inFlightLinksPromises.has(cacheKey)) {
    return inFlightLinksPromises.get(cacheKey)!;
  }

  const promise = Promise.resolve().then(() => getBookLinksFromDb(bookId, lineIndex));
  inFlightLinksPromises.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inFlightLinksPromises.delete(cacheKey);
  }
}

/**
 * Returns raw database schema tables for diagnostics
 */
export function getDatabaseSchema(): any {
  if (!isSeforimDbAvailable()) return { error: 'DB not available' };
  try {
    const tables = queryAll<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    return { count: tables.length, tables };
  } catch (err: any) {
    return { error: err.message };
  }
}

export interface DatabaseSearchResult {
  query: string;
  totalHits: number;
  totalBooks: number;
  results: SearchResultItem[];
}

/**
 * Searches the database using line LIKE queries with full aggregation of total hits and distinct books
 */
export function searchDatabase(
  query: string,
  limit: number = 60,
  bookIds?: number[]
): DatabaseSearchResult | null {
  if (!isSeforimDbAvailable() || !query.trim()) return null;

  const cleanQ = query.trim();
  const catalog = getCatalogFromDb();
  const bookCategoryMap = new Map<number | string, string>();
  if (catalog?.books) {
    for (const b of catalog.books) {
      bookCategoryMap.set(b.id, b.categoryPath || 'ספרייה');
      bookCategoryMap.set(b.title, b.categoryPath || 'ספרייה');
    }
  }

  // Handle multi-word queries: "רבי עקיבא" -> WHERE l.content LIKE '%רבי%' AND l.content LIKE '%עקיבא%'
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  let whereClauses: string[] = [];
  let params: any[] = [];

  if (terms.length > 1) {
    whereClauses = terms.map(() => `l.content LIKE ?`);
    params = terms.map(t => `%${t}%`);
  } else {
    whereClauses = [`l.content LIKE ?`];
    params = [`%${cleanQ}%`];
  }

  if (bookIds && bookIds.length > 0) {
    whereClauses.push(`l.bookId IN (${bookIds.map(() => '?').join(',')})`);
    params.push(...bookIds);
  }
  whereClauses.push(excludedBookIdSql('l.bookId'));

  const whereSql = whereClauses.join(' AND ');

  // 1. Get accurate counts of total hits and total distinct books
  let totalHits = 0;
  let totalBooks = 0;
  try {
    const countRow = queryGet<{ totalHits: number; totalBooks: number }>(`
      SELECT count(*) as totalHits, count(DISTINCT l.bookId) as totalBooks
      FROM line l
      WHERE ${whereSql}
    `, params);
    if (countRow) {
      totalHits = countRow.totalHits;
      totalBooks = countRow.totalBooks;
    }
  } catch (err: any) {
    console.warn('[SQLite Search Count Warning]:', err.message);
  }

  // 2. Fetch limited results
  const rows = queryAll<{
    bookId: number;
    bookTitle: string;
    lineIndex: number;
    content: string;
  }>(`
    SELECT l.bookId, b.title as bookTitle, l.lineIndex, l.content
    FROM line l
    JOIN book b ON l.bookId = b.id
    WHERE ${whereSql}
    LIMIT ?
  `, [...params, limit]);

  const results: SearchResultItem[] = rows.map(r => ({
    bookId: r.bookId,
    bookTitle: r.bookTitle,
    categoryPath: bookCategoryMap.get(r.bookId) || bookCategoryMap.get(r.bookTitle) || 'ספרייה',
    lineIndex: r.lineIndex,
    snippet: r.content
  }));

  if (totalHits === 0) totalHits = results.length;
  if (totalBooks === 0) totalBooks = new Set(results.map(r => r.bookId)).size;

  return {
    query,
    totalHits,
    totalBooks,
    results
  };
}

export interface InBookSearchMatchItem {
  lineIndex: number;
  content: string;
  heRef?: string;
  isCommentary?: boolean;
  sourceType?: 'book' | 'commentary';
  sourceTitle?: string;
  commentaryLine?: number;
  commentarySnippet?: string;
}

/**
 * Searches strictly within a single book, with an optional toggle to also search in linked commentaries
 */
export function searchInBookFromDb(
  bookId: number | string,
  query: string,
  includeCommentaries: boolean = false
): {
  id: number | string;
  bookTitle: string;
  query: string;
  includeCommentaries: boolean;
  resultsCount: number;
  matches: InBookSearchMatchItem[];
} | null {
  if (!isSeforimDbAvailable() || !query.trim()) return null;
  if (isExcludedBook(bookId)) return null;

  const book = findBookInDb(bookId);
  if (!book) return null;

  const cleanQ = stripNikud(query.trim());
  if (!cleanQ) return null;

  const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
  let likeClauses: string[] = [];
  let params: any[] = [];

  for (const t of terms) {
    const rawLetters = stripNikud(t).replace(/["'״׳]/g, '').trim();
    if (rawLetters.length > 0) {
      const wildcard = '%' + rawLetters.split('').join('%') + '%';
      likeClauses.push(`(content LIKE ? OR content LIKE ?)`);
      params.push(`%${t}%`, wildcard);
    } else {
      likeClauses.push(`content LIKE ?`);
      params.push(`%${t}%`);
    }
  }
  const likeSql = likeClauses.length > 0 ? likeClauses.join(' AND ') : `content LIKE ?`;
  if (likeClauses.length === 0) params.push(`%${cleanQ}%`);

  const searchRegex = buildHebrewSearchRegex(query);

  // 1. Query the main book lines
  const lineRows = queryAll<{
    id: number;
    lineIndex: number;
    content: string;
    heRef?: string;
  }>(`
    SELECT id, lineIndex, content, heRef
    FROM line
    WHERE bookId = ? AND ${likeSql}
    ORDER BY lineIndex ASC
  `, [book.id, ...params]);

  const matches: InBookSearchMatchItem[] = [];

  for (const row of lineRows) {
    const plain = row.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (searchRegex) {
      searchRegex.lastIndex = 0;
      if (!searchRegex.test(plain)) continue;
    }
    const snippetInfo = searchRegex ? extractSearchSnippet(plain, searchRegex) : null;
    const snippet = snippetInfo?.snippet || plain.slice(0, 120);

    matches.push({
      lineIndex: row.lineIndex,
      content: snippet,
      heRef: row.heRef,
      isCommentary: false,
      sourceType: 'book',
      sourceTitle: book.title
    });
  }

  // 2. If includeCommentaries is true, also search linked commentaries for this book
  if (includeCommentaries) {
    const linkCols = getTableColumns('link');
    const hasSourceLineId = linkCols.includes('sourceLineId');
    const hasSourceBookId = linkCols.includes('sourceBookId');

    let commRows: Array<{
      mainLineIndex: number;
      commentaryTitle: string;
      commentaryContent: string;
      commentaryHeRef?: string;
      commentaryLine?: number;
    }> = [];

    if (hasSourceLineId) {
      // Schema B: sourceLineId -> targetLineId
      const commLikeClauses = likeSql.replace(/\bcontent\b/g, 'tl.content');
      commRows = queryAll(`
        SELECT sl.lineIndex AS mainLineIndex, b.title AS commentaryTitle,
               tl.content AS commentaryContent, tl.heRef AS commentaryHeRef,
               tl.lineIndex AS commentaryLine
        FROM link l
        JOIN line sl ON sl.id = l.sourceLineId
        JOIN line tl ON tl.id = l.targetLineId
        JOIN book b ON b.id = tl.bookId
        WHERE sl.bookId = ? AND (${commLikeClauses})
      `, [book.id, ...params]);
    } else if (hasSourceBookId) {
      // Schema A: sourceBookId / targetBookId
      const commLikeClauses = likeSql.replace(/\bcontent\b/g, 'cl.content');
      commRows = queryAll(`
        SELECT l.targetLineIndex AS mainLineIndex, b.title AS commentaryTitle,
               cl.content AS commentaryContent, cl.heRef AS commentaryHeRef,
               cl.lineIndex AS commentaryLine
        FROM link l
        JOIN book b ON b.id = l.sourceBookId
        JOIN line cl ON cl.bookId = l.sourceBookId AND cl.lineIndex = l.sourceLineIndex
        WHERE l.targetBookId = ? AND (${commLikeClauses})
        UNION ALL
        SELECT l.sourceLineIndex AS mainLineIndex, b.title AS commentaryTitle,
               cl.content AS commentaryContent, cl.heRef AS commentaryHeRef,
               cl.lineIndex AS commentaryLine
        FROM link l
        JOIN book b ON b.id = l.targetBookId
        JOIN line cl ON cl.bookId = l.targetBookId AND cl.lineIndex = l.targetLineIndex
        WHERE l.sourceBookId = ? AND (${commLikeClauses})
      `, [book.id, ...params, book.id, ...params]);
    }

    for (const row of commRows) {
      const plain = (row.commentaryContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (searchRegex) {
        searchRegex.lastIndex = 0;
        if (!searchRegex.test(plain)) continue;
      }
      const snippetInfo = searchRegex ? extractSearchSnippet(plain, searchRegex) : null;
      const snippet = snippetInfo?.snippet || plain.slice(0, 120);

      matches.push({
        lineIndex: row.mainLineIndex,
        content: snippet,
        heRef: row.commentaryHeRef,
        isCommentary: true,
        sourceType: 'commentary',
        sourceTitle: row.commentaryTitle,
        commentaryLine: row.commentaryLine,
        commentarySnippet: snippet
      });
    }
  }

  // 3. Sort matches deterministically: by lineIndex, then book matches before commentaries
  matches.sort((a, b) => {
    if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
    if (a.isCommentary !== b.isCommentary) return a.isCommentary ? 1 : -1;
    return (a.sourceTitle || '').localeCompare(b.sourceTitle || '');
  });

  return {
    id: book.id,
    bookTitle: book.title,
    query,
    includeCommentaries,
    resultsCount: matches.length,
    matches
  };
}

function normalizeCatQuery(s: string): string {
  if (!s) return '';
  return s.replace(/[\u05F4״"\']/g, '').replace(/[\u05F3׳]/g, '').trim().toLowerCase();
}

/**
 * Retrieves all book IDs belonging to a category and all its subcategories recursively
 */
export function getBookIdsForCategory(category: string | number | Array<string | number>): number[] {
  if (!category) return [];

  const rawInputs = Array.isArray(category) ? category : [category];
  const inputs = rawInputs.filter(x => x !== null && x !== undefined && String(x).trim() !== '');
  if (inputs.length === 0) return [];

  try {
    const catCols = getTableColumns('category');
    const bookCols = getTableColumns('book');

    if (catCols.length > 0 && bookCols.length > 0) {
      const catIdCol = catCols.find(c => /^id$/i.test(c)) || 'id';
      const catParentCol = catCols.find(c => /parent/i.test(c)) || 'parentId';
      const catTitleCol = catCols.find(c => /title|name/i.test(c)) || 'title';

      const catRows = queryAll<{ id: number; parentId: number | null; title: string }>(`
        SELECT "${catIdCol}" AS id, "${catParentCol}" AS parentId, "${catTitleCol}" AS title
        FROM category
      `);

      if (catRows.length > 0) {
        // Map parent to child category IDs
        const childrenMap = new Map<number, number[]>();
        for (const row of catRows) {
          if (row.parentId !== null && row.parentId !== undefined) {
            const pId = Number(row.parentId);
            if (!childrenMap.has(pId)) {
              childrenMap.set(pId, []);
            }
            childrenMap.get(pId)!.push(Number(row.id));
          }
        }

        // Match initial categories
        const matchedCategoryIds = new Set<number>();
        for (const input of inputs) {
          const numInput = Number(input);
          const strInput = String(input).trim();
          const normInput = normalizeCatQuery(strInput);
          
          for (const row of catRows) {
            const normTitle = normalizeCatQuery(row.title);
            if (!isNaN(numInput) && String(row.id) === String(numInput)) {
              matchedCategoryIds.add(Number(row.id));
            } else if (normInput === 'מפרשי תנך' || normInput === 'מפרשי מקרא') {
              if (normTitle.includes('מפרשי') && (normTitle.includes('תנך') || normTitle.includes('מקרא'))) {
                matchedCategoryIds.add(Number(row.id));
              }
            } else if (normInput === 'תנך' || normInput === 'מקרא') {
              if (!normTitle.includes('מפרשי') && (normTitle === 'תנך' || normTitle === 'מקרא' || normTitle.includes('תנך') || normTitle.includes('מקרא'))) {
                matchedCategoryIds.add(Number(row.id));
              }
            } else if (
              normTitle === normInput ||
              strInput.endsWith('/' + row.title) ||
              strInput.includes('/' + row.title + '/') ||
              strInput.startsWith(row.title + '/')
            ) {
              matchedCategoryIds.add(Number(row.id));
            }
          }
        }

        // Recursively gather all subcategory IDs
        const allCategoryIds = new Set<number>();
        const queue: number[] = Array.from(matchedCategoryIds);

        while (queue.length > 0) {
          const currId = queue.shift()!;
          if (!allCategoryIds.has(currId)) {
            allCategoryIds.add(currId);
            const children = childrenMap.get(currId);
            if (children && children.length > 0) {
              queue.push(...children);
            }
          }
        }

        if (allCategoryIds.size > 0) {
          const bookIdCol = bookCols.find(c => /^id$/i.test(c)) || 'id';
          const bookCatCol = bookCols.find(c => /category/i.test(c)) || 'categoryId';

          const catIdList = Array.from(allCategoryIds);
          const placeholders = catIdList.map(() => '?').join(',');

          const bookRows = queryAll<{ id: number }>(`
            SELECT "${bookIdCol}" AS id
            FROM book
            WHERE "${bookCatCol}" IN (${placeholders})
              AND ${excludedBookIdSql(`"${bookIdCol}"`)}
          `, catIdList);

          return bookRows.map(b => Number(b.id)).filter(id => Number.isFinite(id));
        }
      }
    }
  } catch (err: any) {
    console.warn('[getBookIdsForCategory] DB query notice:', err.message);
  }

  // Fallback using loaded catalog in memory
  try {
    const catalog = getCatalogFromDb() || buildComprehensiveCatalog();
    if (catalog && catalog.books) {
      const bookIds: number[] = [];
      for (const b of catalog.books) {
        for (const input of inputs) {
          const strInput = String(input).trim();
          const normInput = normalizeCatQuery(strInput);
          const normCatPath = normalizeCatQuery(b.categoryPath || '');
          const numInput = Number(input);

          if (!isNaN(numInput) && (b as any).categoryId === numInput) {
            bookIds.push(Number(b.id));
          } else if (normInput === 'מפרשי תנך' || normInput === 'מפרשי מקרא') {
            if (normCatPath.includes('מפרשי')) {
              bookIds.push(Number(b.id));
            }
          } else if (normInput === 'תנך' || normInput === 'מקרא') {
            if (!normCatPath.includes('מפרשי') && (normCatPath.startsWith('תנך') || normCatPath.startsWith('מקרא') || normCatPath === 'תנך')) {
              bookIds.push(Number(b.id));
            }
          } else if (
            normCatPath === normInput ||
            normCatPath.startsWith(normInput + '/') ||
            normCatPath.includes('/' + normInput + '/') ||
            normCatPath.endsWith('/' + normInput)
          ) {
            bookIds.push(Number(b.id));
          }
        }
      }
      const excludedIds = getExcludedBookIds();
      return bookIds.filter(id => !excludedIds.has(id));
    }
  } catch {}

  return [];
}

/**
 * Searches line contents for a specific book in seforim.db
 * Supports single and multi-word terms (e.g. "אמר רבי עקיבא")
 */
export function searchBookLinesInDb(
  bookId: number | string,
  query: string,
  limit: number = 5000
): Array<{ lineIndex: number; content: string; heRef?: string }> {
  if (!isSeforimDbAvailable() || !query.trim()) return [];
  if (isExcludedBook(bookId)) return [];

  try {
    const book = findBookInDb(bookId);
    if (!book) return [];

    const cleanQ = query.trim();
    const terms = cleanQ.split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return [];

    const lineCols = getTableColumns('line');
    const bookIdCol = lineCols.find(c => /book.*id/i.test(c)) || 'bookId';
    const contentCol = lineCols.find(c => /content|text/i.test(c)) || 'content';
    const indexCol = lineCols.find(c => /line.*index|index|num/i.test(c)) || 'lineIndex';
    const refCol = lineCols.find(c => /he.*ref|ref/i.test(c));
    const selectRef = refCol ? `, "${refCol}" AS heRef` : '';

    const whereClauses = [`"${bookIdCol}" = ?`];
    const params: any[] = [book.id];

    terms.forEach(t => {
      whereClauses.push(`"${contentCol}" LIKE ?`);
      params.push(`%${t}%`);
    });

    params.push(limit);

    const sql = `
      SELECT "${indexCol}" AS lineIndex, "${contentCol}" AS content ${selectRef}
      FROM line
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY "${indexCol}" ASC
      LIMIT ?
    `;

    return queryAll<{ lineIndex: number; content: string; heRef?: string }>(sql, params);
  } catch (err: any) {
    sysLogger.addLog('error', 'SQLite', `שגיאה בחיפוש בתוך ספר: ${err.message}`);
    return [];
  }
}
