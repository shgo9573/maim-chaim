import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');   // ⭐ כופה IPv4 — כמו curl
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { sysLogger } from './src/services/logger.js';
import { runSmartSearch, backendLog } from './src/services/smartSearch.js';
import { getCommentatorEra, getCommentatorPriority, getBookCanonicalScore } from './src/utils/generationOrder.js';
import { buildOtzariaCatalogueOrder } from './src/utils/catalogueOrder.js';
import { createRateLimiter } from './src/services/rateLimiter.js';
import { hasApprovedFrontend } from './src/services/frontendGuard.js';
import { isCompletePdf, isReadableDafPdf, sliceDafPage, startOcrIndex } from './src/services/talmudPages.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
import {
  getUserRecord,
  addBookmark,
  removeBookmark,
  recordReadingHistory,
  clearReadingHistory,
  linkEmailToUser,
  findUserIdByEmail,
  getUserSettings,
  updateUserSettings,
  exportUserBackup,
  importUserBackup,
  removeReadingHistoryItem,
  recordFeedback
} from './src/services/userStore.js';
import {
  isSeforimDbAvailable,
  getCatalogFromDb,
  getBookContentFromDb,
  getBookLineSnippets,
  getBookTocFromDb,
  getBookLinksFromDb,
  getBookLinksFromDbAsync,
  getAllBookCommentatorsFromDb,
  searchDatabase,
  searchBookLinesInDb,
  getDatabaseDetails,
  getDatabaseSchema,
  getDbDiagnosticsReport,
  getBookIdsForCategory,
  searchInBookFromDb,
  getAllowedBookIds,
  getExcludedBookIds,
  isExcludedBook
} from './src/services/seforimDatabase.js';

// Safeguard against unhandled exceptions causing crashes
process.on('uncaughtException', (err) => {
  console.error('[Otzaria Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Otzaria Server] Unhandled Rejection:', reason);
});
process.on('exit', (code) => {
  console.log(`[Otzaria Server] Process exiting with code: ${code}`);
});
process.on('SIGTERM', () => {
  console.log('[Otzaria Server] Received SIGTERM signal');
});
process.on('SIGINT', () => {
  console.log('[Otzaria Server] Received SIGINT signal');
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`[BOOT] Otzaria Server starting (Pure SQLite Mode)... Node: ${process.version}, Arch: ${process.arch}, Platform: ${process.platform}, PID: ${process.pid}`);

/**
 * Automatically warm up / preload seforim.db into Linux OS Page Cache / RAM
 */
function autoWarmupDatabase() {
  const dbPath = '/var/data/otzaria/seforim.db';
  if (!fs.existsSync(dbPath)) return;

  console.log(`[Otzaria Auto-Warmup] Starting automatic background preloading of ${dbPath} into RAM (Linux Page Cache)...`);
  const startTime = Date.now();

  try {
    const dd = spawn('dd', [`if=${dbPath}`, 'of=/dev/null', 'bs=2M', 'status=none']);
    dd.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[Otzaria Auto-Warmup] Complete! 7.4GB loaded into RAM Page Cache in ${elapsed}s. All subsequent SQLite queries will run at memory speed (0-2ms).`);
        sysLogger.addLog('success', 'Warmup', `טעינת ה-DB המלאה ל-RAM הושלמה בהצלחה ב-${elapsed} שניות!`);
      } else {
        console.log(`[Otzaria Auto-Warmup] Background dd process exited with code ${code}`);
      }
    });
    dd.on('error', () => {
      // Fallback: Node.js stream reader
      const stream = fs.createReadStream(dbPath, { highWaterMark: 2 * 1024 * 1024 });
      stream.on('data', () => {});
      stream.on('end', () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Otzaria Auto-Warmup] Complete (Stream)! 7.4GB loaded into RAM in ${elapsed}s.`);
      });
    });
  } catch (err: any) {
    console.warn('[Otzaria Auto-Warmup] Notice:', err.message);
  }
}

// Trigger automatic background warm-up on boot
autoWarmupDatabase();

const app = express();
const PORT = 3000;

// Enable Gzip/Brotli HTTP compression (reduces JSON / text payloads by ~75-85%)
// מחריג text/event-stream כדי למנוע השהיה/buffering בחיפוש חכם בזמן אמת
app.use(compression({
  filter: (req, res) => {
    if (req.headers.accept?.includes('text/event-stream') || req.path?.includes('stream')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Support /old/ subpath transparently (used by reverse proxies and subfolder rewrites)
app.use((req, res, next) => {
  if (req.url.startsWith('/old/')) {
    req.url = req.url.slice(4);
  }
  next();
});

// Detailed Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api') || res.statusCode >= 400) {
      console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// === Rate Limiting (הגבלת קצב בקשות לכל האתר ללא החרגות) ===
const siteRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '2000', 10),
  message: 'חריגה ממגבלת הבקשות המותרת לדקה. אנא נסה שוב מאוחר יותר.',
  keyPrefix: 'site_global'
});
app.use(siteRateLimiter);

// מנגנון Rate Limit ייעודי ומחמיר למנועי החיפוש
export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: parseInt(process.env.SEARCH_RATE_LIMIT_MAX || '45', 10),
  message: 'חריגה ממגבלת בקשות החיפוש לדקה. אנא המתן מספר שניות ונסה שוב.',
  keyPrefix: 'search_endpoint'
});

// === מנגנון אבטחת חיפוש - חובת שליחת X-Otzaria-UID בכל חיפוש ===
export const requireSearchToken: express.RequestHandler = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const uidHeader = req.headers['x-otzaria-uid'];

  // חובה לשלוח X-Otzaria-UID בבקשת החיפוש (או בעוגיית otzaria_uid)
  const token = (
    (typeof uidHeader === 'string' ? uidHeader.trim() : '') ||
    cookies['otzaria_uid']
  );

  const cleanToken = typeof token === 'string' ? token.trim() : '';

  // אם לא נשלח X-Otzaria-UID תקין (לפחות 10 תווים תקינים) - מענה 'Access Denied' באנגלית!
  if (!cleanToken || cleanToken.length < 10 || !/^[a-zA-Z0-9_-]{10,64}$/.test(cleanToken)) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Access Denied'
    });
  }

  (req as any).userToken = cleanToken;
  (req as any).userId = cleanToken;
  next();
};

// === מערכת לוגים ===
let LOG_DIR = '/var/log/otzaria';

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[LOG] Could not create absolute log dir, falling back to local temp folder:', err);
  LOG_DIR = path.join(process.cwd(), 'logs', 'otzaria');
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (e) {}
}

function writeLog(logData: any) {
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOG_DIR, `${today}.json`);
  
  try {
    fs.appendFileSync(logFile, JSON.stringify(logData) + '\n');
  } catch (err) {
    console.error('[LOG] Error writing log:', err);
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown',
      bookId: req.params?.id || req.query?.bookId,
      query: req.query?.q || req.body?.query,
      category: req.query?.category,
      userId: req.query?.userId || req.body?.userId,
    };
    
    if (!req.path.includes('/assets/') && !req.path.includes('.js') && !req.path.includes('.css') && !req.path.includes('/api/status')) {
      writeLog(logData);
    }
  });
  
  next();
});

app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['X-Otzaria-UID', 'Set-Cookie']
}));
app.use(express.json({ limit: '50mb' }));

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (!name) return;
    const value = parts.slice(1).join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// User Identity Middleware: Extract or generate UUID cookie
app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const headerUid = req.headers['x-otzaria-uid'] as string | undefined;

  let userId = cookies['otzaria_uid'] || (headerUid && headerUid.trim().length > 5 ? headerUid.trim() : '');
  const isSearchPath = req.path.startsWith('/api/search') || req.path.includes('/search') || req.path.includes('smart-search');

  if (!userId || !/^[a-zA-Z0-9_-]{10,64}$/.test(userId)) {
    if (isSearchPath) {
      // Do not auto-generate a token for search calls - client must provide it!
      return next();
    }
    userId = crypto.randomUUID();
  }

  // Set long-lived cookie (400 days - standard maximum)
  const maxAgeSeconds = 400 * 24 * 60 * 60;
  res.setHeader('Set-Cookie', `otzaria_uid=${userId}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`);
  res.setHeader('X-Otzaria-UID', userId);

  (req as any).userId = userId;
  next();
});

// Remote Otzaria server fallback configuration
const REMOTE_OTZARIA_URL = process.env.REMOTE_OTZARIA_URL || 'https://otzaria.duckdns.org';
let remoteLibraryTreeCache: any = null;
let remoteBooksSortedCache: any = null;

// Helper to fetch from remote Otzaria server
async function fetchRemoteOtzaria(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${REMOTE_OTZARIA_URL}${path}`;
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };
  return fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(15000)
  });
}

function filterBookReferences<T extends { bookId?: number | string; id?: number | string }>(items: T[] | undefined): T[] {
  return (items || []).filter(item => !isExcludedBook(item.bookId ?? item.id ?? ''));
}

function filterUserBookCollections(userData: any): any {
  return {
    ...userData,
    bookmarks: filterBookReferences(userData.bookmarks),
    history: filterBookReferences(userData.history),
    notes: filterBookReferences(userData.notes)
  };
}

function filterCatalogPayload(data: any): any {
  const allowedIds = new Set(getAllowedBookIds());
  const filterBooks = (books: any[] | undefined) =>
    (books || []).filter(book => allowedIds.has(Number(book.id)));
  const filterCategory = (category: any): any => ({
    ...category,
    books: filterBooks(category.books),
    children: (category.children || []).map(filterCategory)
  });
  const books = filterBooks(data?.books);

  return {
    ...data,
    books,
    sortedBooks: Array.isArray(data?.sortedBooks) ? filterBooks(data.sortedBooks) : data?.sortedBooks,
    categories: Array.isArray(data?.categories) ? data.categories.map(filterCategory) : data?.categories,
    totalBooksCount: books.length
  };
}

function hasSearchResultText(item: any): boolean {
  const candidates = [
    item?.snippet, item?.text, item?.content, item?.lineText, item?.line_text,
    item?.textStored, item?.text_stored, item?.textVocalizedStored, item?.text_vocalized_stored
  ];
  return candidates.some(value =>
    typeof value === 'string' &&
    Boolean(value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').trim())
  );
}

function filterSearchResponse(data: any, allowedIds: Set<number>): any {
  const bookIdOf = (item: any) => Number(item?.book_id ?? item?.bookId ?? item?.id);
  const filtered = { ...data };
  if (Array.isArray(data?.results)) {
    filtered.results = data.results.filter((item: any) => allowedIds.has(bookIdOf(item)));

    // The Rust search index may return a hit without its source line text.
    // Recover just those exact lines in one batched SQLite query so results normally
    // show their excerpt immediately instead of requiring a click to load the preview.
    if (filtered.results.length > 0 && isSeforimDbAvailable()) {
      const missingText = filtered.results.filter((item: any) => !hasSearchResultText(item)).slice(0, 300);
      if (missingText.length > 0) {
        const snippets = getBookLineSnippets(missingText.map((item: any) => ({
          bookId: item?.book_id ?? item?.bookId ?? item?.id,
          lineIndex: Number(item?.lineIndex ?? item?.line_index ?? item?.line)
        })));
        if (snippets.size > 0) {
          filtered.results = filtered.results.map((item: any) => {
            if (hasSearchResultText(item)) return item;
            const bookId = item?.book_id ?? item?.bookId ?? item?.id;
            const lineIndex = Number(item?.lineIndex ?? item?.line_index ?? item?.line);
            const snippet = snippets.get(`${Number(bookId)}:${lineIndex}`);
            return snippet ? { ...item, snippet } : item;
          });
        }
      }
    }
  }
  for (const key of ['book_counts', 'bookCounts', 'facets']) {
    if (Array.isArray(data?.[key])) {
      filtered[key] = data[key].filter((item: any) => allowedIds.has(bookIdOf(item)));
    }
  }
  return filtered;
}

app.use('/api/books/:id', (req, res, next) => {
  try {
    if (isExcludedBook(req.params.id)) {
      return res.status(404).json({ error: 'Book not found' });
    }
    next();
  } catch (error: any) {
    sysLogger.addLog('error', 'Book access', `בדיקת מקור ספר נכשלה: ${error.message}`);
    return res.status(503).json({ error: 'Book source verification unavailable' });
  }
});

// API Endpoints - Pure Local seforim.db SQLite Backend with Automatic Remote Server Fallback

// SQLite status / Remote status
app.get('/api/status', async (req, res) => {
  const dbInfo = getDatabaseDetails();
  if (dbInfo.available) {
    return res.json({
      status: 'ready',
      mode: 'sqlite_local',
      message: `מסד נתונים מקומי seforim.db פעיל (${dbInfo.sizeGB})`,
      databasePath: dbInfo.path,
      databaseSize: dbInfo.sizeGB,
      databaseEngine: dbInfo.engine,
      totalBooks: dbInfo.booksCount,
      storageUsageMB: Math.round(dbInfo.sizeBytes / (1024 * 1024)),
      lastUpdated: new Date().toISOString()
    });
  }

  // Connect to Remote Otzaria Server
  try {
    const remoteRes = await fetchRemoteOtzaria('/api/status', { signal: AbortSignal.timeout(6000) });
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json({
        ...data,
        mode: 'remote_proxy',
        remoteUrl: REMOTE_OTZARIA_URL,
        message: `מחובר לשרת מרוחק (${REMOTE_OTZARIA_URL})`
      });
    }
  } catch (err: any) {
    console.warn('[Proxy] Remote status check error:', err.message);
  }

  res.json({
    status: 'ready',
    mode: 'remote_proxy',
    remoteUrl: REMOTE_OTZARIA_URL,
    message: `מחובר לשרת מרוחק (${REMOTE_OTZARIA_URL})`,
    totalBooks: 14805,
    storageUsageMB: 7544,
    lastUpdated: new Date().toISOString()
  });
});

// Library tree catalog from seforim.db or remote Otzaria server
app.get('/api/library/tree', async (req, res) => {
  try {
    if (isSeforimDbAvailable()) {
      const dbCatalog = getCatalogFromDb();
      if (dbCatalog && dbCatalog.books.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.json({
          categories: dbCatalog.categories,
          books: dbCatalog.books,
          sortedBooks: getSortedBooksOnce()
        });
      }
    }

    // Serve from cache if already fetched from remote
    if (remoteLibraryTreeCache) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(filterCatalogPayload(remoteLibraryTreeCache));
    }

    // Fetch from remote Otzaria server
    const remoteRes = await fetchRemoteOtzaria('/api/library/tree');
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      remoteLibraryTreeCache = filterCatalogPayload(data);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(remoteLibraryTreeCache);
    }

    res.status(502).json({ error: 'Failed to fetch library tree from remote server' });
  } catch (err: any) {
    sysLogger.addLog('error', 'Server', `שגיאה בטעינת קטלוג: ${err.message}`);
    res.status(500).json({ error: 'Failed to build catalog', message: err.message });
  }
});

// Cache for pre-sorted generation-order books
let sortedBooksCache: any[] | null = null;

export function getSortedBooksOnce(): any[] {
  if (sortedBooksCache && sortedBooksCache.length > 0) {
    return sortedBooksCache;
  }

  const dbCatalog = getCatalogFromDb();
  if (!dbCatalog || !dbCatalog.books || dbCatalog.books.length === 0) return [];

  // Build exact Otzaria Flutter catalogue tree order
  const catalogueOrdered = buildOtzariaCatalogueOrder(dbCatalog);

  // Dedup by book.id (resolves React duplicate key warnings)
  const seen = new Set<string | number>();
  let idx = 1;
  const unique = catalogueOrdered.filter(b => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    b.orderIndex = idx++;
    return true;
  });

  sortedBooksCache = unique;
  console.log(`📚 [books-sorted] ${sortedBooksCache.length} unique books sorted by Otzaria catalogue tree order (Tanach -> Midrash -> Mishnah -> Bavli -> Yerushalmi -> Tosefta -> Halacha -> Responsa) and cached`);
  return sortedBooksCache;
}

// Return one book's available metadata on demand, without re-downloading the full catalog.
app.get('/api/books/:id/info', async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (!rawId || isExcludedBook(rawId)) {
      return res.status(404).json({ error: 'Book information not found' });
    }

    const findIn = (data: any) => {
      const books = Array.isArray(data?.books) ? data.books : [];
      return books.find((book: any) => String(book?.id) === rawId) || null;
    };

    if (isSeforimDbAvailable()) {
      const localBook = findIn(getCatalogFromDb());
      if (localBook) return res.json({ book: localBook, source: 'database' });
    }

    if (!remoteLibraryTreeCache) {
      const remoteRes = await fetchRemoteOtzaria('/api/library/tree');
      if (remoteRes.ok) {
        remoteLibraryTreeCache = filterCatalogPayload(await remoteRes.json());
      } else {
        return res.status(502).json({ error: 'Could not load book information from the catalog server' });
      }
    }

    const remoteBook = findIn(remoteLibraryTreeCache);
    if (remoteBook) return res.json({ book: remoteBook, source: 'remote-catalog' });
    return res.status(404).json({ error: 'Book information not found' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to load book information', message: err.message });
  }
});

// Pre-sorted books endpoint with instant freshness
app.get('/api/books-sorted', async (_req, res) => {
  try {
    if (isSeforimDbAvailable()) {
      const sorted = getSortedBooksOnce();
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(sorted);
    }

    if (remoteBooksSortedCache) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(filterBookReferences(remoteBooksSortedCache));
    }

    const remoteRes = await fetchRemoteOtzaria('/api/books-sorted');
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      remoteBooksSortedCache = filterBookReferences(data);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(remoteBooksSortedCache);
    }

    if (remoteLibraryTreeCache?.books) {
      return res.json(filterBookReferences(remoteLibraryTreeCache.books));
    }
    res.status(502).json({ error: 'Failed to retrieve sorted books from remote' });
  } catch (err: any) {
    sysLogger.addLog('error', 'Server', `שגיאה ב-books-sorted: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve sorted books', message: err.message });
  }
});

// Range lines endpoint from seforim.db or remote Otzaria server
app.get('/api/books/:id/lines', async (req, res) => {
  try {
    const rawId = req.params.id;
    const startLine = parseInt(req.query.start as string, 10) || 1;
    const endLine = parseInt(req.query.end as string, 10) || (startLine + 150);

    if (isSeforimDbAvailable()) {
      const dbData = getBookContentFromDb(rawId, startLine, endLine);
      if (dbData) {
        return res.json({
          id: dbData.id,
          title: dbData.title,
          content: dbData.content,
          startLine,
          endLine,
          totalLines: dbData.totalLines
        });
      }
      return res.status(404).json({ error: 'Book lines not found in local database' });
    }

    // Proxy to remote Otzaria server
    const remoteRes = await fetchRemoteOtzaria(`/api/books/${encodeURIComponent(rawId)}/lines?start=${startLine}&end=${endLine}`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json(data);
    }

    res.status(remoteRes.status).json({ error: 'Book lines not found' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load lines', message: err.message });
  }
});

// Book content endpoint from seforim.db or remote Otzaria server
app.get('/api/books/:id/content', async (req, res) => {
  try {
    const rawId = req.params.id;
    const startLine = req.query.start ? parseInt(req.query.start as string, 10) : undefined;
    const endLine = req.query.end ? parseInt(req.query.end as string, 10) : undefined;

    if (isSeforimDbAvailable()) {
      const dbData = getBookContentFromDb(rawId, startLine, endLine);
      if (dbData) {
        return res.json({
          id: dbData.id,
          title: dbData.title,
          lines: dbData.lines,
          totalLines: dbData.totalLines
        });
      }
      return res.status(404).json({ error: 'Book content not found in local database' });
    }

    // Proxy to remote Otzaria server
    const queryParams = new URLSearchParams();
    if (startLine !== undefined) queryParams.set('start', String(startLine));
    if (endLine !== undefined) queryParams.set('end', String(endLine));
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const remoteRes = await fetchRemoteOtzaria(`/api/books/${encodeURIComponent(rawId)}/content${qs}`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json(data);
    }

    res.status(remoteRes.status).json({ error: 'Book content not found' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load book content', message: err.message });
  }
});

// Book in-text search endpoint with selectable commentaries support and SQLite & Tantivy engines (Protected by Search Token & Rate Limiter)
app.get('/api/books/:id/search', searchRateLimiter, requireSearchToken, async (req, res) => {
  try {
    const rawId = req.params.id;
    const query = (req.query.q as string || '').trim();
    const includeCommentaries = req.query.commentaries === 'true' || req.query.includeCommentaries === 'true';

    if (!query) {
      return res.json({ id: rawId, query: '', includeCommentaries, resultsCount: 0, matches: [] });
    }

    // 1. Always use the external search engine with the book ID
    const searchUrl = process.env.SEARCH_SERVICE_URL || 'http://localhost:8080/search';
    const parsedId = Number(rawId);
    const searchPayload = {
      query,
      limit: 5000,
      book_ids: !isNaN(parsedId) ? [parsedId] : undefined,
      mode: 'advanced'
    };

    try {
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        const matches = (data && Array.isArray(data.results))
          ? data.results.map((r: any) => ({
              lineIndex: r.line_index ?? r.lineIndex ?? 1,
              content: r.snippet ?? r.content ?? '',
              heRef: r.heRef || undefined,
              isCommentary: false,
              sourceType: 'book'
            }))
          : [];

        return res.json({
          id: rawId,
          query,
          includeCommentaries,
          resultsCount: matches.length,
          matches
        });
      } else {
        return res.status(502).json({ error: 'Search engine failed', status: response.status });
      }
    } catch (err: any) {
      return res.status(502).json({ error: 'Search engine failed', message: err.message });
    }
  } catch (err: any) {
    console.error('[Search Error] In-book search failed:', err.message);
    res.status(500).json({
      error: 'In-book search failed',
      message: err.message
    });
  }
});

// Book Table of Contents endpoint from seforim.db or remote Otzaria server
app.get('/api/books/:id/toc', async (req, res) => {
  try {
    const rawId = req.params.id;

    if (isSeforimDbAvailable()) {
      const dbToc = getBookTocFromDb(rawId);
      if (dbToc && dbToc.length > 0) {
        return res.json({
          id: rawId,
          toc: dbToc
        });
      }
    }

    // Proxy to remote Otzaria server
    const remoteRes = await fetchRemoteOtzaria(`/api/books/${encodeURIComponent(rawId)}/toc`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json(data);
    }

    res.json({ id: rawId, toc: [] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate TOC', message: err.message });
  }
});

// Commentary links endpoint from seforim.db or remote Otzaria server
app.get('/api/books/:id/links', async (req, res) => {
  try {
    const rawId = req.params.id;
    const lineIndex = parseInt(req.query.line as string, 10) || 1;

    if (isSeforimDbAvailable()) {
      const dbLinks = await getBookLinksFromDbAsync(rawId, lineIndex);
      if (dbLinks) {
        return res.json(dbLinks);
      }
    }

    // Proxy to remote Otzaria server
    const remoteRes = await fetchRemoteOtzaria(`/api/books/${encodeURIComponent(rawId)}/links?line=${lineIndex}`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json(data);
    }

    res.json({
      id: rawId,
      line: lineIndex,
      links: [],
      allLinks: [],
      availableCommentators: []
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get commentary links', message: err.message });
  }
});

// Full book commentators list endpoint from seforim.db or remote Otzaria server
app.get('/api/books/:id/commentators', async (req, res) => {
  try {
    const rawId = req.params.id;

    if (isSeforimDbAvailable()) {
      const commentators = getAllBookCommentatorsFromDb(rawId);
      if (commentators && commentators.length > 0) {
        return res.json({
          bookId: rawId,
          commentators
        });
      }
    }

    // Proxy to remote Otzaria server
    const remoteRes = await fetchRemoteOtzaria(`/api/books/${encodeURIComponent(rawId)}/commentators`);
    if (remoteRes.ok) {
      const data = await remoteRes.json();
      return res.json(data);
    }

    res.json({ bookId: rawId, commentators: [] });
  } catch (err: any) {
    res.json({ bookId: req.params.id, commentators: [] });
  }
});

// Database schema diagnostics endpoint
app.get('/api/debug/schema', (req, res) => {
  try {
    const schema = getDatabaseSchema();
    res.json(schema);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Database connectivity and status report endpoint
app.get('/api/debug/db', (req, res) => {
  try {
    const report = getDbDiagnosticsReport();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Shas Daf Tzurat HaDaf Proxy & Cache
const shasDafCache = new Map<string, Buffer>();

interface ShasMasechtaMeta {
  names: string[];
  slug: string;
  startDaf: number;
  maxDaf: number;
  req: number;
  /** Offset used by the existing HebrewBooks Vilna page mapping (e.g. Kinnim shares a volume). */
  pageOffset?: number;
}

const SHAS_MASECHTOT: ShasMasechtaMeta[] = [
  { names: ['ברכות'], slug: 'berachos', startDaf: 2, maxDaf: 64, req: 21111 },
  { names: ['שבת'], slug: 'shabbos', startDaf: 2, maxDaf: 157, req: 21112 },
  { names: ['עירובין', 'ערובין'], slug: 'eruvin', startDaf: 2, maxDaf: 105, req: 21113 },
  { names: ['פסחים'], slug: 'pesachim', startDaf: 2, maxDaf: 121, req: 21114 },
  { names: ['שקלים'], slug: 'shekalim', startDaf: 2, maxDaf: 22, req: 21115 },
  { names: ['יומא'], slug: 'yoma', startDaf: 2, maxDaf: 88, req: 21116 },
  { names: ['סוכה'], slug: 'sukkah', startDaf: 2, maxDaf: 56, req: 21117 },
  { names: ['ביצה'], slug: 'beitzah', startDaf: 2, maxDaf: 40, req: 21118 },
  { names: ['ראש השנה', 'ראש-השנה', 'ר"ה', 'ר״ה'], slug: 'rosh-hashanah', startDaf: 2, maxDaf: 35, req: 21119 },
  { names: ['תענית', 'תעניות'], slug: 'taanis', startDaf: 2, maxDaf: 31, req: 21120 },
  { names: ['מגילה'], slug: 'megillah', startDaf: 2, maxDaf: 32, req: 21121 },
  { names: ['מועד קטן', 'מועד-קטן', 'מו"ק', 'מו״ק'], slug: 'moed-katan', startDaf: 2, maxDaf: 29, req: 21122 },
  { names: ['חגיגה'], slug: 'chagigah', startDaf: 2, maxDaf: 27, req: 21123 },
  { names: ['יבמות'], slug: 'yevamos', startDaf: 2, maxDaf: 122, req: 21124 },
  { names: ['כתובות'], slug: 'kesubos', startDaf: 2, maxDaf: 112, req: 21125 },
  { names: ['נדרים'], slug: 'nedarim', startDaf: 2, maxDaf: 91, req: 21126 },
  { names: ['נזיר'], slug: 'nazir', startDaf: 2, maxDaf: 66, req: 21127 },
  { names: ['סוטה'], slug: 'sotah', startDaf: 2, maxDaf: 49, req: 21128 },
  { names: ['גיטין'], slug: 'gittin', startDaf: 2, maxDaf: 90, req: 21129 },
  { names: ['קידושין', 'קדושין'], slug: 'kiddushin', startDaf: 2, maxDaf: 82, req: 21130 },
  { names: ['בבא קמא', 'בבא-קמא', 'ב"ק', 'ב״ק'], slug: 'bava-kamma', startDaf: 2, maxDaf: 119, req: 21131 },
  { names: ['בבא מציעא', 'בבא-מציעא', 'ב"מ', 'ב״מ'], slug: 'bava-metzia', startDaf: 2, maxDaf: 119, req: 21132 },
  { names: ['בבא בתרא', 'בבא-בתרא', 'ב"ב', 'ב״ב'], slug: 'bava-basra', startDaf: 2, maxDaf: 176, req: 21133 },
  { names: ['סנהדרין'], slug: 'sanhedrin', startDaf: 2, maxDaf: 113, req: 21134 },
  { names: ['מכות'], slug: 'makkos', startDaf: 2, maxDaf: 24, req: 21135 },
  { names: ['שבועות'], slug: 'shevuos', startDaf: 2, maxDaf: 49, req: 21136 },
  { names: ['עבודה זרה', 'עבודה-זרה', 'ע"ז', 'ע״ז'], slug: 'avodah-zarah', startDaf: 2, maxDaf: 76, req: 21137 },
  { names: ['הוריות'], slug: 'horayos', startDaf: 2, maxDaf: 14, req: 21138 },
  { names: ['זבחים'], slug: 'zevachim', startDaf: 2, maxDaf: 120, req: 21139 },
  { names: ['מנחות'], slug: 'menachos', startDaf: 2, maxDaf: 110, req: 21140 },
  { names: ['חולין'], slug: 'chullin', startDaf: 2, maxDaf: 142, req: 21141 },
  { names: ['בכורות'], slug: 'bechoros', startDaf: 2, maxDaf: 61, req: 21142 },
  { names: ['ערכין'], slug: 'arachin', startDaf: 2, maxDaf: 34, req: 21143 },
  { names: ['תמורה'], slug: 'temurah', startDaf: 2, maxDaf: 34, req: 21144 },
  { names: ['כריתות'], slug: 'kereisos', startDaf: 2, maxDaf: 28, req: 21145 },
  { names: ['מעילה'], slug: 'meilah', startDaf: 2, maxDaf: 22, req: 21146 },
  { names: ['קנים'], slug: 'kinim', startDaf: 22, maxDaf: 25, req: 21146, pageOffset: -40 },
  { names: ['תמיד'], slug: 'tamid', startDaf: 26, maxDaf: 33, req: 21147 },
  { names: ['מידות', 'מדות'], slug: 'middos', startDaf: 34, maxDaf: 37, req: 21148 },
  { names: ['נידה', 'נדה'], slug: 'niddah', startDaf: 2, maxDaf: 73, req: 21149 }
];

function findShasMasechtaMeta(name: string): ShasMasechtaMeta | null {
  if (!name || typeof name !== 'string') return null;
  const clean = name
    .replace(/[־–—\-_,.:;()\[\]{}'\"״׳]/g, ' ')
    .replace(/\b(תלמוד|בבלי|שס|ש"ס|ש״ס|מסכת|משנה|פירוש|רש"י|תוספות|על|סדר|נשים|נזיקין|מועד|קדשים|טהרות|זרעים)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Exact match on slug or any Hebrew alias
  for (const m of SHAS_MASECHTOT) {
    if (m.slug.toLowerCase() === name.trim().toLowerCase() || m.slug.toLowerCase() === clean.toLowerCase()) {
      return m;
    }
    if (m.names.some(n => clean === n || name.trim() === n)) {
      return m;
    }
  }

  // 2. Contains match
  for (const m of SHAS_MASECHTOT) {
    if (m.names.some(n => clean.includes(n) || name.includes(n))) {
      return m;
    }
  }
  return null;
}

/** Normalize a tractate name for matching only against files in the known local library folder. */
function normalizeTalmudFileLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\.pdf$/i, '')
    .replace(/[־–—\-_,.:;()\[\]{}'""״׳]/g, '')
    .replace(/\s+/g, '')
    .replace(/(מסכת|תלמוד|בבלי)/g, '');
}

/** Return a local PDF only when its filename matches a known tractate alias. */
function findLocalTalmudBavliPdf(meta: ShasMasechtaMeta): string | null {
  if (!fs.existsSync(LOCAL_TALMUD_BAVLI_DIR)) return null;

  const aliases = [...meta.names];
  if (meta.slug === 'kinim') aliases.push('קינים');
  if (meta.slug === 'eruvin') aliases.push('ערובין');
  if (meta.slug === 'kiddushin') aliases.push('קדושין');

  const wanted = new Set(aliases.map(normalizeTalmudFileLabel));
  try {
    const file = fs.readdirSync(LOCAL_TALMUD_BAVLI_DIR).find((entry) =>
      entry.toLowerCase().endsWith('.pdf') &&
      wanted.has(normalizeTalmudFileLabel(entry))
    );
    return file ? path.join(LOCAL_TALMUD_BAVLI_DIR, file) : null;
  } catch {
    return null;
  }
}

/** Page number for the bundled local tractate PDFs: the first daf is PDF page 1. */
function getTalmudPdfPageNumber(meta: ShasMasechtaMeta, daf: number, amud: 'a' | 'b'): number {
  return Math.max(1, (daf - meta.startDaf) * 2 + (amud === 'a' ? 1 : 2));
}

// Serve the full local tractate PDF. PDF.js and native browser viewers can request byte ranges,
// so a single tractate is streamed on demand instead of downloading all 452 MB of scans.
app.get('/api/tzurat-hadaf/book', (req, res) => {
  try {
    const rawMasechta = String(req.query.masechta || '').trim();
    const meta = findShasMasechtaMeta(rawMasechta);
    if (!meta) {
      return res.status(400).json({ error: `Unknown or unsupported Talmud tractate: ${rawMasechta}` });
    }

    const rawDaf = parseInt(String(req.query.daf || String(meta.startDaf)), 10) || meta.startDaf;
    let amud = String(req.query.amud || 'a').trim().toLowerCase();
    if (amud === 'א' || amud === '1' || amud === 'amud_a' || amud === 'aleph') amud = 'a';
    if (amud === 'ב' || amud === '2' || amud === 'amud_b' || amud === 'bet') amud = 'b';
    if (amud !== 'a' && amud !== 'b') amud = 'a';
    const safeDaf = rawDaf < meta.startDaf || rawDaf > meta.maxDaf ? meta.startDaf : rawDaf;

    const localPdfPath = findLocalTalmudBavliPdf(meta);
    if (!localPdfPath || !fs.existsSync(localPdfPath) || fs.statSync(localPdfPath).size < 15000) {
      // Keep existing behavior for tractates not present in the downloaded bundle.
      return res.redirect(302,
        `/api/tzurat-hadaf/page?masechta=${encodeURIComponent(rawMasechta)}&daf=${safeDaf}&amud=${amud}`);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Otzaria-PDF-Source', 'local-talmud-bavli');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(localPdfPath))}"`);
    return res.sendFile(localPdfPath, (err) => {
      if (err && !res.headersSent) {
        console.error('[Tzurat HaDaf] Could not serve local tractate PDF:', err.message);
        res.status(500).json({ error: 'Could not serve local tractate PDF' });
      }
    });
  } catch (err: any) {
    console.error('[Tzurat HaDaf local PDF error]:', err.message);
    return res.status(500).json({ error: 'Internal server error serving local Talmud PDF' });
  }
});

const MASECHTOT_HEBREW_TO_ENGLISH: Record<string, string> = {};
for (const m of SHAS_MASECHTOT) {
  for (const n of m.names) {
    MASECHTOT_HEBREW_TO_ENGLISH[n] = m.slug;
  }
}

// Experimental external PDF source for HTML reconstruction and bubble detection.
app.get('/api/tzurat-hadaf/html-pdf', async (req, res) => {
  const requestedSource = String(req.query.source || 'local');
  if (requestedSource === 'local') {
    const query = new URLSearchParams({
      masechta: String(req.query.masechta || ''),
      daf: String(req.query.daf || '2'),
      amud: String(req.query.amud || 'a'),
    });
    return res.redirect(302, '/api/tzurat-hadaf/page?' + query.toString());
  }
  if (requestedSource !== 'shas' && requestedSource !== 'hebrewbooks') {
    return res.status(400).json({ error: 'מקור HTML לא מוכר' });
  }
  const rawMasechta = String(req.query.masechta || '').trim();
  const meta = findShasMasechtaMeta(rawMasechta);
  if (!meta) return res.status(400).json({ error: 'מסכת לא מוכרת' });
  const rawDaf = Number.parseInt(String(req.query.daf || meta.startDaf), 10) || meta.startDaf;
  const daf = Math.min(meta.maxDaf, Math.max(meta.startDaf, rawDaf));
  const amud = String(req.query.amud || 'a') === 'b' ? 'b' : 'a';

  if (requestedSource === 'shas') {
    // This is the original SHAS.org PDF source that used to be selectable in
    // Tzurat HaDaf. Reuse its existing cache/validation route.
    const query = new URLSearchParams({ masechta: rawMasechta, daf: String(daf), amud, forHtml: '1' });
    return res.redirect(302, '/api/shas/daf?' + query.toString());
  }

  // HebrewBooks stores a complete Vilna volume. Download/cache that volume once,
  // then cut the requested printed page out of it. Both the HTML layout and bubble
  // detector receive this exact one-page PDF, not the PDF pager's HTML wrapper.
  const pdfPage = Math.max(1, (daf - meta.startDaf) * 2 + (amud === 'a' ? 2 : 3) + (meta.pageOffset || 0));
  const volumeDir = path.join(LOCAL_PDF_DIR, 'hebrewbooks-html-volumes');
  const pageDir = path.join(LOCAL_PDF_DIR, 'hebrewbooks-html-pages');
  const volumePath = path.join(volumeDir, `${meta.slug}_${meta.req}.pdf`);
  const pagePath = path.join(pageDir, `${meta.slug}_${daf}_${amud}.pdf`);
  const validPdf = (value: Buffer) =>
    value.length > 15000 &&
    value.subarray(0, 5).toString('latin1') === '%PDF-' &&
    value.subarray(Math.max(0, value.length - 2048)).includes(Buffer.from('%%EOF'));

  try {
    if (fs.existsSync(pagePath)) {
      const cached = fs.readFileSync(pagePath);
      if (validPdf(cached)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('X-Otzaria-PDF-Source', 'hebrewbooks-page-cache');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.send(cached);
      }
      try { fs.unlinkSync(pagePath); } catch {}
    }

    await fs.promises.mkdir(volumeDir, { recursive: true });
    await fs.promises.mkdir(pageDir, { recursive: true });
    let volume: Buffer | null = null;
    try {
      if (fs.existsSync(volumePath)) {
        const cached = await fs.promises.readFile(volumePath);
        if (validPdf(cached)) volume = cached;
      }
    } catch { /* refetch corrupt or missing volume */ }

    if (!volume) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let response: Response;
      try {
        response = await fetch(`https://download.hebrewbooks.org/downloadhandler.ashx?req=${meta.req}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://hebrewbooks.org/',
            'Accept': 'application/pdf,*/*',
          },
          signal: controller.signal,
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        return res.status(502).json({ error: `HebrewBooks volume download failed (${response.status})` });
      }
      const finalHost = new URL(response.url).hostname.toLowerCase();
      if (!finalHost.endsWith('hebrewbooks.org') && !finalHost.endsWith('hebrewbooksoffline.dpdns.org')) {
        return res.status(502).json({ error: 'HebrewBooks redirected to an unapproved download host' });
      }
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 120 * 1024 * 1024) {
        return res.status(413).json({ error: 'HebrewBooks volume is larger than the permitted limit' });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 120 * 1024 * 1024 || !validPdf(bytes)) {
        return res.status(502).json({ error: 'HebrewBooks did not return a valid PDF volume' });
      }
      volume = bytes;
      const temporary = volumePath + '.tmp';
      await fs.promises.writeFile(temporary, volume);
      await fs.promises.rename(temporary, volumePath);
    }

    const { PDFDocument } = await import('pdf-lib');
    const sourceDoc = await PDFDocument.load(volume, { ignoreEncryption: true, updateMetadata: false });
    const pageIndex = pdfPage - 1;
    if (pageIndex < 0 || pageIndex >= sourceDoc.getPageCount()) {
      return res.status(404).json({ error: `העמוד ${pdfPage} אינו קיים בכרך HebrewBooks של מסכת ${rawMasechta}` });
    }
    const singlePage = await PDFDocument.create();
    const [page] = await singlePage.copyPages(sourceDoc, [pageIndex]);
    singlePage.addPage(page);
    const singleBytes = Buffer.from(await singlePage.save());
    const temporaryPage = pagePath + '.tmp';
    await fs.promises.writeFile(temporaryPage, singleBytes);
    await fs.promises.rename(temporaryPage, pagePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Otzaria-PDF-Source', 'hebrewbooks');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.send(singleBytes);
  } catch (error: any) {
    console.error('[Tzurat HaDaf HebrewBooks HTML source] Failed:', error.message);
    return res.status(502).json({
      error: 'לא ניתן להוריד ולעבד את דף HebrewBooks כרגע',
      message: error.name === 'AbortError' ? 'ההורדה חרגה ממגבלת הזמן' : error.message,
    });
  }
});

app.get('/api/shas/daf', async (req, res) => {
  try {
    let masechta = String(req.query.masechta || '').trim();
    const rawDaf = parseInt(String(req.query.daf || '2'), 10) || 2;
    let amud = String(req.query.amud || 'a').trim().toLowerCase();

    // Normalize amud
    if (amud === 'א' || amud === '1' || amud === 'amud_a') amud = 'a';
    if (amud === 'ב' || amud === '2' || amud === 'amud_b') amud = 'b';
    if (amud !== 'a' && amud !== 'b') amud = 'a';

    // Map Hebrew masechta name if provided in Hebrew
    for (const [hebKey, engVal] of Object.entries(MASECHTOT_HEBREW_TO_ENGLISH)) {
      if (masechta.includes(hebKey) || hebKey.includes(masechta)) {
        masechta = engVal;
        break;
      }
    }

    if (!masechta) {
      return res.status(400).json({ error: 'Missing masechta parameter' });
    }

    const cacheKey = `${masechta}_${rawDaf}_${amud}`;
    if (shasDafCache.has(cacheKey)) {
      const cachedBuf = shasDafCache.get(cacheKey)!;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
      res.setHeader('Content-Disposition', `inline; filename="${cacheKey}.pdf"`);
      return res.send(cachedBuf);
    }

    const targetUrl = `https://www.shas.org/daf-pdf/api/?masechta=${encodeURIComponent(masechta)}&daf=${rawDaf}&amud=${amud}`;
    console.log(`[Shas API] Fetching Tzurat HaDaf from ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch Tzurat HaDaf from Shas provider (${response.status})`
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cache up to 200 dapim in memory
    if (shasDafCache.size > 200) {
      const firstK = shasDafCache.keys().next().value;
      if (firstK) shasDafCache.delete(firstK);
    }
    shasDafCache.set(cacheKey, buffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Disposition', `inline; filename="${cacheKey}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[Shas API Error]:', err.message);
    res.status(500).json({ error: 'Internal server error fetching Tzurat HaDaf', message: err.message });
  }
});

// Local PDF Storage Directory for Tzurat HaDaf
const LOCAL_PDF_DIR = fs.existsSync('/var/data/otzaria')
  ? '/var/data/otzaria/pdf'
  : path.join(__dirname, 'data/pdf');

// Full tractate scans extracted from talmud_bavli_latest.tar.zst.
// Keep them outside the application bundle and serve only allow-listed tractate files.
const LOCAL_TALMUD_BAVLI_DIR = [
  '/var/data/otzaria/talmud_bavli/תלמוד בבלי',
  path.join(__dirname, 'data/talmud_bavli', 'תלמוד בבלי')
].find((dir) => fs.existsSync(dir)) || '/var/data/otzaria/talmud_bavli/תלמוד בבלי';

if (!fs.existsSync(LOCAL_PDF_DIR)) {
  try {
    fs.mkdirSync(LOCAL_PDF_DIR, { recursive: true });
  } catch {}
}

// Admin authentication secret code and middleware
const ADMIN_SECRET_CODE = process.env.ADMIN_CODE || '9632';

const requireAdminAuth: express.RequestHandler = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const adminKeyHeader = req.headers['x-admin-key'] || req.headers['x-admin-code'];
  const queryCode = req.query.adminCode || req.query.adminKey || req.query.key;
  const bodyCode = req.body && (req.body.adminCode || req.body.adminKey || req.body.key);

  let providedCode = '';
  if (adminKeyHeader && typeof adminKeyHeader === 'string') {
    providedCode = adminKeyHeader.trim();
  } else if (authHeader && typeof authHeader === 'string') {
    providedCode = authHeader.replace(/^Bearer\s+/i, '').trim();
  } else if (queryCode && typeof queryCode === 'string') {
    providedCode = queryCode.trim();
  } else if (bodyCode && typeof bodyCode === 'string') {
    providedCode = String(bodyCode).trim();
  }

  if (!providedCode || providedCode !== ADMIN_SECRET_CODE) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'נדרש קוד מנהל מורשה לביצוע פעולה זו'
    });
  }

  next();
};

// Persistent site feature gates. Production storage is outside the Git checkout.
const SITE_FEATURE_SETTINGS_PATH = process.env.OTZARIA_SITE_FEATURES_PATH ||
  (fs.existsSync('/var/data/otzaria')
    ? '/var/data/otzaria/site-feature-settings.json'
    : path.join(process.cwd(), 'data', 'site-feature-settings.json'));

type HtmlBracketMode = 'swap' | 'keep';
type HtmlWordRecognitionMode = 'tight' | 'balanced' | 'wide';
type SiteFeatureSettings = {
  allowExternalHtmlSource: boolean;
  htmlBracketMode: HtmlBracketMode;
  htmlWordRecognition: HtmlWordRecognitionMode;
};
const DEFAULT_SITE_FEATURE_SETTINGS: SiteFeatureSettings = {
  allowExternalHtmlSource: false,
  htmlBracketMode: 'swap',
  htmlWordRecognition: 'balanced',
};
function readSiteFeatureSettings(): SiteFeatureSettings {
  try {
    const value = JSON.parse(fs.readFileSync(SITE_FEATURE_SETTINGS_PATH, 'utf8'));
    return {
      allowExternalHtmlSource: value?.allowExternalHtmlSource === true,
      htmlBracketMode: value?.htmlBracketMode === 'keep' ? 'keep' : 'swap',
      htmlWordRecognition: value?.htmlWordRecognition === 'tight' || value?.htmlWordRecognition === 'wide'
        ? value.htmlWordRecognition
        : 'balanced',
    };
  } catch {
    return { ...DEFAULT_SITE_FEATURE_SETTINGS };
  }
}
function writeSiteFeatureSettings(update: Partial<SiteFeatureSettings>): SiteFeatureSettings {
  const current = readSiteFeatureSettings();
  const next: SiteFeatureSettings = {
    allowExternalHtmlSource: typeof update.allowExternalHtmlSource === 'boolean'
      ? update.allowExternalHtmlSource
      : current.allowExternalHtmlSource,
    htmlBracketMode: update.htmlBracketMode === 'swap' || update.htmlBracketMode === 'keep'
      ? update.htmlBracketMode
      : current.htmlBracketMode,
    htmlWordRecognition: update.htmlWordRecognition === 'tight' || update.htmlWordRecognition === 'balanced' || update.htmlWordRecognition === 'wide'
      ? update.htmlWordRecognition
      : current.htmlWordRecognition,
  };
  fs.mkdirSync(path.dirname(SITE_FEATURE_SETTINGS_PATH), { recursive: true });
  const temp = SITE_FEATURE_SETTINGS_PATH + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, SITE_FEATURE_SETTINGS_PATH);
  return next;
}

// The public reader receives only the one feature flag needed to decide whether
// to show the experimental external-source controls.
app.get('/api/tzurat-hadaf/html-source-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readSiteFeatureSettings());
});

app.get('/api/admin/settings/tzurat-hadaf-html-source', requireAdminAuth, (_req, res) => {
  res.json(readSiteFeatureSettings());
});
app.post('/api/admin/settings/tzurat-hadaf-html-source', requireAdminAuth, (req, res) => {
  const body = req.body || {};
  const update: Partial<SiteFeatureSettings> = {};
  if ('allowExternalHtmlSource' in body) {
    if (typeof body.allowExternalHtmlSource !== 'boolean') {
      return res.status(400).json({ success: false, error: 'allowExternalHtmlSource חייב להיות true או false' });
    }
    update.allowExternalHtmlSource = body.allowExternalHtmlSource;
  }
  if ('htmlBracketMode' in body) {
    if (body.htmlBracketMode !== 'swap' && body.htmlBracketMode !== 'keep') {
      return res.status(400).json({ success: false, error: 'htmlBracketMode חייב להיות swap או keep' });
    }
    update.htmlBracketMode = body.htmlBracketMode;
  }
  if ('htmlWordRecognition' in body) {
    if (!['tight', 'balanced', 'wide'].includes(body.htmlWordRecognition)) {
      return res.status(400).json({ success: false, error: 'htmlWordRecognition חייב להיות tight, balanced או wide' });
    }
    update.htmlWordRecognition = body.htmlWordRecognition;
  }
  if (!Object.keys(update).length) {
    return res.status(400).json({ success: false, error: 'לא נשלחו הגדרות HTML לעדכון' });
  }
  try {
    const settings = writeSiteFeatureSettings(update);
    const message = 'הגדרות צורת הדף נשמרו.';
    return res.json({ success: true, settings, message });
  } catch (error: any) {
    console.error('[Admin site features] Save failed:', error.message);
    return res.status(500).json({ success: false, error: 'שמירת הגדרות הניהול נכשלה' });
  }
});

// Endpoint to verify admin credentials
app.post('/api/admin/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const adminKeyHeader = req.headers['x-admin-key'] || req.headers['x-admin-code'];
  const code = req.body?.adminCode || req.body?.adminKey || req.body?.key || (authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : adminKeyHeader);
  if (code && String(code).trim() === ADMIN_SECRET_CODE) {
    return res.json({ success: true, authorized: true });
  }
  return res.status(401).json({ success: false, authorized: false, error: 'קוד מנהל שגוי' });
});

// Endpoint to clear PDF cache on demand (Protected by Admin Code)
app.post('/api/admin/clear-pdf-cache', requireAdminAuth, (req, res) => {
  try {
    shasDafCache.clear();
    let deletedCount = 0;
    const dirsToClean = ['/var/data/otzaria/pdf', path.join(__dirname, 'data/pdf')];
    for (const dir of dirsToClean) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.pdf')) {
            try {
              fs.unlinkSync(path.join(dir, file));
              deletedCount++;
            } catch {}
          }
        }
      }
    }
    res.json({ success: true, message: `נמחקו ${deletedCount} קבצי מטמון בהצלחה`, deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Local PDF page fetch endpoint with automatic disk persistence & strict tractate isolation
app.get('/api/tzurat-hadaf/page', async (req, res) => {
  try {
    const rawMasechta = String(req.query.masechta || '').trim();
    const rawDaf = parseInt(String(req.query.daf || '2'), 10) || 2;
    let amud = String(req.query.amud || 'a').trim().toLowerCase();
    if (amud === 'א' || amud === '1' || amud === 'amud_a' || amud === 'aleph') amud = 'a';
    if (amud === 'ב' || amud === '2' || amud === 'amud_b' || amud === 'bet') amud = 'b';
    if (amud !== 'a' && amud !== 'b') amud = 'a';

    const meta = findShasMasechtaMeta(rawMasechta);
    if (!meta) {
      return res.status(400).json({ error: `Unknown or unsupported Talmud tractate: ${rawMasechta}` });
    }

    // Strict page bounds validation for the requested tractate:
    // If daf exceeds maxDaf (e.g. user sent a book lineIndex like 834 instead of daf),
    // clamp strictly to the tractate's startDaf (or maxDaf) - NEVER leak to another tractate!
    let safeDaf = rawDaf;
    if (safeDaf < meta.startDaf || safeDaf > meta.maxDaf) {
      console.warn(`[Tzurat HaDaf] Daf ${rawDaf} out of bounds for ${meta.slug} (${meta.startDaf}-${meta.maxDaf}), clamping to ${meta.startDaf}`);
      safeDaf = meta.startDaf;
    }

    const localFileName = `${meta.slug}_${safeDaf}_${amud}.pdf`;
    const localFilePath = path.join(LOCAL_PDF_DIR, localFileName);

    // A daf the browser could not open is asked for again with fresh=1, which always
    // cuts it anew instead of handing back the same unreadable file.
    const wantFreshCut = String(req.query.fresh || '') === '1';

    // 1. Check local disk cache (only if verified valid PDF)
    if (!wantFreshCut && fs.existsSync(localFilePath)) {
      // A file that was written halfway renders as an empty sheet, so it is checked
      // for a real ending — and for actually opening — before it is served, and is
      // re-cut when it is broken.
      const cachedBuffer = fs.readFileSync(localFilePath);
      if (await isReadableDafPdf(cachedBuffer)) {
        res.setHeader('Content-Type', 'application/pdf');
        // Revalidate with the server: a daf that was cut again must replace the copy
        // the browser kept, instead of the reader being stuck with a file that never opens.
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(localFileName)}"`);
        return res.send(cachedBuffer);
      } else {
        // Remove truncated / corrupt file
        console.warn(`[Tzurat HaDaf] Cached daf ${localFileName} cannot be opened; cutting it again`);
        try { fs.unlinkSync(localFilePath); } catch {}
      }
    }

    // 2. Cut this daf out of the tractate already on this server. The reader downloads
    // one page instead of the whole volume, and the page is kept for the next visit.
    const localTractatePath = findLocalTalmudBavliPdf(meta);
    if (localTractatePath) {
      const sliced = await sliceDafPage({
        sourcePath: localTractatePath,
        cacheDir: LOCAL_PDF_DIR,
        slug: meta.slug,
        startDaf: meta.startDaf,
        daf: safeDaf,
        amud: amud as 'a' | 'b',
        fresh: wantFreshCut,
      });
      if (sliced) {
        res.setHeader('Content-Type', 'application/pdf');
        // Revalidate with the server: a daf that was cut again must replace the copy
        // the browser kept, instead of the reader being stuck with a file that never opens.
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Otzaria-PDF-Source', sliced.cached ? 'local-cache' : 'local-tractate-slice');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(localFileName)}"`);
        return res.send(sliced.buffer);
      }
    }

    // 3. Fetch directly from verified shas.org API (100% exact Vilna page-by-page scan)
    const shasUrl = `https://www.shas.org/daf-pdf/api/?masechta=${encodeURIComponent(meta.slug)}&daf=${safeDaf}&amud=${amud}`;
    console.log(`[Tzurat HaDaf] Fetching ${meta.slug} daf ${safeDaf} amud ${amud} from shas.org...`);

    const shasResp = await fetch(shasUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*'
      }
    });

    if (shasResp.ok) {
      const contentType = shasResp.headers.get('content-type') || '';
      const arrayBuffer = await shasResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Verify it's an authentic, complete PDF: an interrupted download paints as a blank page.
      if (isCompletePdf(buffer)) {
        try {
          fs.writeFileSync(localFilePath, buffer);
        } catch (writeErr: any) {
          console.warn('[Tzurat HaDaf] Could not persist to disk cache:', writeErr.message);
        }
        res.setHeader('Content-Type', 'application/pdf');
        // Revalidate with the server: a daf that was cut again must replace the copy
        // the browser kept, instead of the reader being stuck with a file that never opens.
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(localFileName)}"`);
        return res.send(buffer);
      }
    }

    console.error(`[Tzurat HaDaf Error] Failed to fetch PDF for tractate ${meta.slug} daf ${safeDaf} amud ${amud} (status: ${shasResp.status})`);
    res.status(502).json({
      error: `Failed to fetch Tzurat HaDaf for ${meta.names[0]} daf ${safeDaf} amud ${amud}`,
      tractate: meta.names[0],
      daf: safeDaf,
      amud
    });
  } catch (err: any) {
    console.error('[Tzurat HaDaf Exception]:', err.message);
    res.status(500).json({ error: 'Internal server error fetching Tzurat HaDaf', message: err.message });
  }
});

// Searchable text of the scanned tractate. The text layer of the print is its OCR, so
// the index holds the readable rows of every page and the reader searches it directly
// instead of downloading the volume. Built once per tractate and kept on disk.
app.get('/api/tzurat-hadaf/ocr-index', (req, res) => {
  try {
    const rawMasechta = String(req.query.masechta || '').trim();
    const meta = findShasMasechtaMeta(rawMasechta);
    if (!meta) {
      return res.status(400).json({ error: `Unknown or unsupported Talmud tractate: ${rawMasechta}` });
    }

    const sourcePath = findLocalTalmudBavliPdf(meta);
    if (!sourcePath) {
      return res.status(503).json({ error: 'The scan of this tractate is not on this server yet', tractate: meta.names[0] });
    }

    const job = startOcrIndex({
      sourcePath,
      cacheDir: LOCAL_PDF_DIR,
      slug: meta.slug,
      startDaf: meta.startDaf,
      maxDaf: meta.maxDaf,
    });

    if (job.error) {
      return res.status(500).json({ error: job.error });
    }

    res.setHeader('Cache-Control', 'no-store');
    if (!job.done) {
      return res.status(202).json({ ready: false, page: job.nextPage, total: job.total });
    }
    return res.json({ ready: true, total: job.pages.length, pages: job.pages });
  } catch (err: any) {
    console.error('[Tzurat HaDaf OCR index error]:', err.message);
    return res.status(500).json({ error: 'Internal server error building the OCR index', message: err.message });
  }
});

// High-Resolution Pristine Vilna Page Image Endpoint
app.get('/api/tzurat-hadaf/page-image', async (req, res) => {
  try {
    const rawMasechta = String(req.query.masechta || '').trim();
    const rawDaf = parseInt(String(req.query.daf || '2'), 10) || 2;
    let amud = String(req.query.amud || 'a').trim().toLowerCase();
    if (amud === 'א' || amud === '1' || amud === 'amud_a' || amud === 'aleph') amud = 'a';
    if (amud === 'ב' || amud === '2' || amud === 'amud_b' || amud === 'bet') amud = 'b';
    if (amud !== 'a' && amud !== 'b') amud = 'a';

    const meta = findShasMasechtaMeta(rawMasechta);
    if (!meta) {
      return res.status(400).json({ error: `Unknown or unsupported Talmud tractate: ${rawMasechta}` });
    }

    let safeDaf = rawDaf;
    if (safeDaf < meta.startDaf || safeDaf > meta.maxDaf) {
      safeDaf = meta.startDaf;
    }

    // Prefer rendering the requested page from the full local tractate PDF.
    // A separate cache name prevents stale single-page images from the old online provider.
    const localTractatePdf = findLocalTalmudBavliPdf(meta);
    if (localTractatePdf) {
      const localPngFileName = `${meta.slug}_${safeDaf}_${amud}_local_v2.png`;
      const localPngFilePath = path.join(LOCAL_PDF_DIR, localPngFileName);
      if (fs.existsSync(localPngFilePath) && fs.statSync(localPngFilePath).size > 20000) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('X-Otzaria-PDF-Source', 'local-talmud-bavli');
        return res.sendFile(localPngFilePath);
      }

      try {
        const { execFile } = await import('node:child_process');
        const gsBin = fs.existsSync('/usr/bin/gs')
          ? '/usr/bin/gs'
          : (fs.existsSync('/usr/local/bin/gs') ? '/usr/local/bin/gs' : 'gs');
        const pageNumber = getTalmudPdfPageNumber(meta, safeDaf, amud as 'a' | 'b');
        const envPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        // Rendering runs beside the server, not inside it: a slow Ghostscript must not
        // hold up every other request while a page is being drawn.
        await new Promise<void>((resolve, reject) => {
          execFile(gsBin, [
            '-sDEVICE=png16m',
            '-r150',
            '-dTextAlphaBits=4',
            '-dGraphicsAlphaBits=4',
            `-dFirstPage=${pageNumber}`,
            `-dLastPage=${pageNumber}`,
            '-o',
            localPngFilePath,
            localTractatePdf
          ], {
            timeout: 30000,
            env: { ...process.env, PATH: `${process.env.PATH || ''}:${envPath}` }
          }, (error) => (error ? reject(error) : resolve()));
        });

        if (fs.existsSync(localPngFilePath) && fs.statSync(localPngFilePath).size > 20000) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=604800');
          res.setHeader('X-Otzaria-PDF-Source', 'local-talmud-bavli');
          return res.sendFile(localPngFilePath);
        }
      } catch (gsErr: any) {
        console.warn('[Tzurat HaDaf] Local tractate image rendering failed; falling back to the local PDF canvas:', gsErr?.message);
      }

      // Do not silently show an online scan when the local tractate PDF exists.
      // Returning an image error makes SimplePdfViewer load that local PDF with PDF.js instead.
      return res.status(503).json({ error: 'Local PDF image rendering unavailable; use the local PDF viewer' });
    }

    const pngFileName = `${meta.slug}_${safeDaf}_${amud}.png`;
    const pngFilePath = path.join(LOCAL_PDF_DIR, pngFileName);
    const pdfFileName = `${meta.slug}_${safeDaf}_${amud}.pdf`;
    const pdfFilePath = path.join(LOCAL_PDF_DIR, pdfFileName);

    // 1. Serve from disk if PNG already exists and valid
    if (fs.existsSync(pngFilePath)) {
      const stats = fs.statSync(pngFilePath);
      if (stats.size > 20000) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.sendFile(pngFilePath);
      }
    }

    // 2. Ensure exact PDF file exists from shas.org
    if (!fs.existsSync(pdfFilePath) || fs.statSync(pdfFilePath).size < 15000) {
      const shasUrl = `https://www.shas.org/daf-pdf/api/?masechta=${encodeURIComponent(meta.slug)}&daf=${safeDaf}&amud=${amud}`;
      console.log(`[Tzurat HaDaf Image] Fetching PDF for ${meta.slug} daf ${safeDaf}${amud} from shas.org...`);

      const shasResp = await fetch(shasUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*'
        }
      });

      if (shasResp.ok) {
        const buf = Buffer.from(await shasResp.arrayBuffer());
        if (buf.length > 15000 && buf.toString('utf-8', 0, 5).startsWith('%PDF')) {
          try {
            fs.writeFileSync(pdfFilePath, buf);
          } catch (writeErr: any) {
            console.warn('[Tzurat HaDaf Image] Could not persist PDF to disk cache:', writeErr.message);
          }
        }
      }
    }

    // 3. Render PDF to crystal-clear high-res PNG using Ghostscript
    if (fs.existsSync(pdfFilePath) && fs.statSync(pdfFilePath).size > 15000) {
      try {
        const { execFile } = await import('node:child_process');
        const gsBin = fs.existsSync('/usr/bin/gs') ? '/usr/bin/gs' : (fs.existsSync('/usr/local/bin/gs') ? '/usr/local/bin/gs' : 'gs');
        const envPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

        await new Promise<void>((resolve, reject) => {
          execFile(gsBin, ['-sDEVICE=png16m', '-r150', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-o', pngFilePath, pdfFilePath], {
            timeout: 30000,
            env: { ...process.env, PATH: (process.env.PATH || '') + ':' + envPath }
          }, (error) => (error ? reject(error) : resolve()));
        });

        if (fs.existsSync(pngFilePath) && fs.statSync(pngFilePath).size > 20000) {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return res.sendFile(pngFilePath);
        }
      } catch (gsErr: any) {
        console.error('[Ghostscript Render Error]:', gsErr?.message);
      }
    }

    // 4. Fallback: redirect to direct PDF endpoint if image rendering is unavailable
    return res.redirect(`/api/tzurat-hadaf/page?masechta=${encodeURIComponent(rawMasechta)}&daf=${safeDaf}&amud=${amud}`);
  } catch (err: any) {
    console.error('[Page Image Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PDF Download Proxy Endpoint with strict SSRF defense, domain allowlist, redirect validation, and size limits
const ALLOWED_PDF_HOSTNAMES = new Set([
  'hebrewbooks.org',
  'www.hebrewbooks.org',
  'beta.hebrewbooks.org',
  'shas.org',
  'www.shas.org',
  'archive.org',
  'www.archive.org',
  'otzaria.org',
  'www.otzaria.org'
]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = lower.match(ipv4Regex);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    if (p1 === 10) return true;
    if (p1 === 127) return true;
    if (p1 === 169 && p2 === 254) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 0) return true;
  }

  return false;
}

function validateDownloadUrl(rawUrl: string): { valid: boolean; error?: string; urlObj?: URL; isLocalRedirect?: boolean } {
  const trimmed = rawUrl.trim();

  // Safe local relative paths (e.g. /api/tzurat-hadaf/page?...)
  if (trimmed.startsWith('/api/tzurat-hadaf/')) {
    return { valid: true, isLocalRedirect: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'כתובת URL אינה תקינה' };
  }

  // Only HTTPS permitted
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'פרוטוקול לא מורשה - נדרש HTTPS בלבד' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private IPs / loopback addresses
  if (isPrivateOrLoopbackHost(hostname)) {
    return { valid: false, error: 'גישה לרשתות או כתובות פנימיות חסומה' };
  }

  // Strict domain allowlist
  if (!ALLOWED_PDF_HOSTNAMES.has(hostname)) {
    return { valid: false, error: `דומיין אינו ברשימת המורשים: ${hostname}` };
  }

  // Reject non-standard ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'שימוש בפורט לא סטנדרטי אינו מורשה' };
  }

  return { valid: true, urlObj: parsed };
}

const MAX_PDF_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50MB limit
const PDF_DOWNLOAD_TIMEOUT_MS = 15000; // 15 seconds limit

app.get('/api/pdf/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'חסר פרמטר url' });
  }

  const validation = validateDownloadUrl(url);
  if (!validation.valid) {
    console.warn(`[PDF Download Blocked] URL: ${url} | Reason: ${validation.error}`);
    return res.status(403).json({ error: 'Forbidden', message: validation.error });
  }

  // If local route, redirect immediately without server fetch
  if (validation.isLocalRedirect) {
    return res.redirect(url.trim());
  }

  let currentTargetUrl = validation.urlObj!.toString();

  try {
    let redirectsCount = 0;
    const maxRedirects = 3;
    let finalResponse: Response | null = null;

    while (redirectsCount <= maxRedirects) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PDF_DOWNLOAD_TIMEOUT_MS);

      let resp: Response;
      try {
        resp = await fetch(currentTargetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://hebrewbooks.org/'
          },
          redirect: 'manual',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Check for redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get('location');
        if (!location) {
          return res.status(502).json({ error: 'Redirect location missing' });
        }

        const resolvedRedirect = new URL(location, currentTargetUrl).toString();
        const redirectCheck = validateDownloadUrl(resolvedRedirect);
        if (!redirectCheck.valid || !redirectCheck.urlObj) {
          console.warn(`[PDF Download Redirect Blocked] Target: ${resolvedRedirect} Reason: ${redirectCheck.error}`);
          return res.status(403).json({ error: 'Redirect to unauthorized target blocked', details: redirectCheck.error });
        }

        currentTargetUrl = redirectCheck.urlObj.toString();
        redirectsCount++;
        continue;
      }

      finalResponse = resp;
      break;
    }

    if (!finalResponse) {
      return res.status(504).json({ error: 'Too many redirects' });
    }

    if (!finalResponse.ok) {
      return res.status(finalResponse.status).send('Failed to fetch PDF from source');
    }

    // Check Content-Length if provided
    const contentLengthHeader = finalResponse.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (contentLength > MAX_PDF_DOWNLOAD_BYTES) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `גודל הקובץ (${Math.round(contentLength / 1024 / 1024)}MB) חורג מהמגבלה המותרת של 50MB`
        });
      }
    }

    // Sanitize filename against CRLF and path traversal
    const rawFilename = (typeof filename === 'string' && filename.trim()) ? filename.trim() : 'tzurat_hadaf.pdf';
    const safeFilename = rawFilename
      .replace(/[\r\n\t]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .slice(0, 150);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);

    // Stream with byte limit counting to protect memory
    if (!finalResponse.body) {
      return res.status(500).send('Empty response body');
    }

    let totalBytes = 0;
    const reader = (finalResponse.body as any).getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_PDF_DOWNLOAD_BYTES) {
        reader.cancel();
        if (!res.headersSent) {
          return res.status(413).json({ error: 'Response exceeded maximum allowed size of 50MB' });
        } else {
          return res.destroy();
        }
      }

      res.write(Buffer.from(value));
    }

    res.end();
  } catch (err: any) {
    console.error('[PDF Download Proxy] Error:', err.message);
    if (!res.headersSent) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return res.status(504).json({ error: 'Request timed out downloading PDF' });
      }
      return res.status(500).send('Error downloading PDF: ' + err.message);
    } else {
      res.destroy();
    }
  }
});

// Search proxy endpoint (proxies strictly to Tantivy / Rust search engine - Protected by Search Token & Rate Limiter)
app.post('/api/search', searchRateLimiter, requireSearchToken, async (req, res) => {
  const { query, limit = 50 } = req.body || {};
  console.log('🔍 [API Search Request Payload]:', JSON.stringify(req.body, null, 2));

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.json({ query: '', resultsCount: 0, results: [] });
  }

  let allowedBookIds: number[];
  try {
    if (req.body?.bookId && isExcludedBook(req.body.bookId)) {
      return res.status(404).json({ error: 'Book not found' });
    }
    allowedBookIds = getAllowedBookIds();
  } catch (error: any) {
    sysLogger.addLog('error', 'Search', `טעינת הספרים המותרים לחיפוש נכשלה: ${error.message}`);
    return res.status(503).json({ error: 'Book source verification unavailable' });
  }

  // Convert bookId / category to book_ids before sending to Rust engine
  const searchPayload = { ...req.body };
  if (req.body?.bookId && (!searchPayload.book_ids || searchPayload.book_ids.length === 0)) {
    const parsedId = Number(req.body.bookId);
    if (!isNaN(parsedId)) {
      searchPayload.book_ids = [parsedId];
    } else {
      const catalog = getCatalogFromDb();
      if (catalog?.books) {
        const found = catalog.books.find(b => b.title === req.body.bookId || b.id === req.body.bookId);
        if (found && !isNaN(Number(found.id))) {
          searchPayload.book_ids = [Number(found.id)];
        }
      }
    }
  }
  // The frontend sends category="all" for an unrestricted library search.
  // Do not treat this sentinel as a real category: it has no matching category
  // rows and would otherwise force book_ids=[] (making every search return no results).
  const rawCategory = req.body?.category ?? req.body?.categories;
  const category = Array.isArray(rawCategory)
    ? rawCategory.filter((value: any) => String(value).trim().toLowerCase() !== 'all')
    : (typeof rawCategory === 'string' && rawCategory.trim().toLowerCase() === 'all')
      ? undefined
      : rawCategory;
  const categoryScoped = Array.isArray(category)
    ? category.length > 0
    : Boolean(category);
  if (categoryScoped && category) {
    const categoryBookIds = getBookIdsForCategory(category);
    if (categoryBookIds && categoryBookIds.length > 0) {
      if (Array.isArray(searchPayload.book_ids) && searchPayload.book_ids.length > 0) {
        const catSet = new Set(categoryBookIds);
        searchPayload.book_ids = searchPayload.book_ids.filter((id: number) => catSet.has(id));
      } else {
        searchPayload.book_ids = categoryBookIds;
      }
    } else {
      searchPayload.book_ids = [];
    }
  }

  const allowedIds = new Set(allowedBookIds);
  const requestedBookIds = categoryScoped
    ? searchPayload.book_ids
    : Array.isArray(searchPayload.book_ids) && searchPayload.book_ids.length > 0
      ? searchPayload.book_ids
      : allowedBookIds;
  searchPayload.book_ids = requestedBookIds
    .map((id: number | string) => Number(id))
    .filter((id: number) => Number.isInteger(id) && allowedIds.has(id));

  if (searchPayload.book_ids.length === 0) {
    return res.json({
      query,
      resultsCount: 0,
      totalBooks: 0,
      book_counts: [],
      results: []
    });
  }

  const searchUrl = process.env.SEARCH_SERVICE_URL || 'http://localhost:8080/search';

  try {
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Search Warning] Local search returned ${response.status}, falling back to remote server`);
      try {
        const remoteSearchRes = await fetchRemoteOtzaria('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchPayload),
          signal: AbortSignal.timeout(12000)
        });
        if (remoteSearchRes.ok) {
          const remoteData = await remoteSearchRes.json();
          return res.json(filterSearchResponse(remoteData, allowedIds));
        }
      } catch (remoteErr: any) {
        console.error(`[Search Remote Error]:`, remoteErr.message);
      }

      return res.status(response.status).json({
        error: `Search engine error (${response.status})`,
        message: 'שירות החיפוש החזיר שגיאה. אנא נסה שוב מאוחר יותר.'
      });
    }

    const results = await response.json();
    return res.json(filterSearchResponse(results, allowedIds));
  } catch (error: any) {
    console.warn(`[Search Service Notice] Local search service unavailable at ${searchUrl}, trying remote server:`, error.message);
    try {
      const remoteSearchRes = await fetchRemoteOtzaria('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
        signal: AbortSignal.timeout(12000)
      });
      if (remoteSearchRes.ok) {
        const remoteData = await remoteSearchRes.json();
        return res.json(filterSearchResponse(remoteData, allowedIds));
      }
    } catch (remoteErr: any) {
      console.error(`[Search Remote Error]:`, remoteErr.message);
    }

    return res.status(503).json({
      error: 'Search engine service unavailable',
      message: 'שירות החיפוש אינו זמין כעת, אנא נסה שוב מאוחר יותר.'
    });
  }
});

// Search service health check endpoint
app.get('/api/search-health', async (req, res) => {
  try {
    const response = await fetch('http://localhost:8080/health');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(503).json({ error: 'Search service down', status: 'offline' });
  }
});

// === אנדפוינט לסטטיסטיקות ואדמין (מוגן בקוד מנהל) ===
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const stats = {
    period: `${days} days`,
    totalRequests: 0,
    uniqueIPs: new Set<string>(),
    requestsByDay: {} as Record<string, number>,
    topBooks: {} as Record<string, number>,
    topSearches: {} as Record<string, number>,
    topCategories: {} as Record<string, number>,
    requestsByHour: Array(24).fill(0),
    statusCodes: {} as Record<string, number>,
    avgDuration: 0,
    totalDuration: 0,
    requestCount: 0,
  };
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `${dateStr}.json`);
    
    if (!fs.existsSync(logFile)) continue;
    
    try {
      const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
      lines.forEach(line => {
        try {
          const log = JSON.parse(line);
          stats.totalRequests++;
          if (log.ip) stats.uniqueIPs.add(log.ip);
          stats.requestsByDay[dateStr] = (stats.requestsByDay[dateStr] || 0) + 1;
          
          if (log.bookId) {
            stats.topBooks[log.bookId] = (stats.topBooks[log.bookId] || 0) + 1;
          }
          if (log.query) {
            stats.topSearches[log.query] = (stats.topSearches[log.query] || 0) + 1;
          }
          if (log.category) {
            stats.topCategories[log.category] = (stats.topCategories[log.category] || 0) + 1;
          }
          
          const hour = new Date(log.timestamp).getHours();
          if (!isNaN(hour) && hour >= 0 && hour < 24) {
            stats.requestsByHour[hour]++;
          }
          if (log.status) {
            stats.statusCodes[log.status] = (stats.statusCodes[log.status] || 0) + 1;
          }
          if (log.duration) {
            stats.totalDuration += log.duration;
            stats.requestCount++;
          }
        } catch {}
      });
    } catch {}
  }
  
  stats.avgDuration = stats.requestCount > 0 
    ? Math.round(stats.totalDuration / stats.requestCount) 
    : 0;
  
  delete (stats as any).totalDuration;
  delete (stats as any).requestCount;
  
  (stats as any).uniqueIPs = stats.uniqueIPs.size;
  
  stats.topBooks = Object.fromEntries(
    Object.entries(stats.topBooks)
      .filter(([bookId]) => !getExcludedBookIds().has(Number(bookId)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
  );
  stats.topSearches = Object.fromEntries(
    Object.entries(stats.topSearches).sort((a, b) => b[1] - a[1]).slice(0, 20)
  );
  stats.topCategories = Object.fromEntries(
    Object.entries(stats.topCategories).sort((a, b) => b[1] - a[1]).slice(0, 20)
  );
  
  res.json(stats);
});

app.get('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    const dataDir = path.resolve(process.cwd(), 'data/user-data');
    const altDataDir = '/var/data/otzaria/user-data';
    const targetDir = fs.existsSync(altDataDir) ? altDataDir : dataDir;

    const users: Array<{ userId: string; email: string | null; createdAt: string; updatedAt: string }> = [];

    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'email-index.json') {
          try {
            const filePath = path.join(targetDir, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            users.push({
              userId: content.userId || file.replace('.json', ''),
              email: content.email || null,
              createdAt: content.createdAt || '',
              updatedAt: content.updatedAt || ''
            });
          } catch {}
        }
      }
    }

    res.json({ success: true, count: users.length, users });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list users', message: err.message });
  }
});

app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  const date = req.query.date as string || new Date().toISOString().split('T')[0];
  const limit = parseInt(req.query.limit as string) || 100;
  const logFile = path.join(LOG_DIR, `${date}.json`);
  
  if (!fs.existsSync(logFile)) {
    return res.json({ logs: [], total: 0 });
  }
  
  try {
    const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
    const logs = lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(l => l !== null);
    
    res.json({ logs: logs.reverse(), total: lines.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read logs', message: err.message });
  }
});

// Feedback endpoint used by frontend-v2. Messages are stored outside the Git checkout.
app.post('/api/feedback', (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Feedback message is required' });
  if (message.length > 5000) return res.status(413).json({ error: 'Feedback message is too long' });

  try {
    recordFeedback(message);
    return res.status(201).json({ success: true, message: 'המשוב התקבל' });
  } catch (err: any) {
    console.error('[Feedback] Failed to save feedback:', err.message);
    return res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// User Profile, Bookmarks, and History Endpoints (Disk-Persistent by UUID Cookie)

app.get('/api/user/data', (req, res) => {
  try {
    const userId = (req as any).userId;
    const userData = filterUserBookCollections(getUserRecord(userId));
    res.json(userData);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get user data', message: err.message });
  }
});

app.get('/api/user/bookmarks', (req, res) => {
  try {
    const userId = (req as any).userId;
    const userData = filterUserBookCollections(getUserRecord(userId));
    res.json({ userId, bookmarks: userData.bookmarks });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get bookmarks', message: err.message });
  }
});

app.post('/api/user/bookmarks', (req, res) => {
  try {
    const userId = (req as any).userId;
    const { bookId, bookTitle, lineIndex, textSnippet, description, category, heRef } = req.body;
    if (!bookId || lineIndex === undefined) {
      return res.status(400).json({ error: 'Missing bookId or lineIndex' });
    }
    if (isExcludedBook(bookId)) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const item = addBookmark(userId, {
      bookId,
      bookTitle: bookTitle || 'ספר',
      lineIndex,
      textSnippet: textSnippet || '',
      description,
      category,
      heRef
    });

    const user = getUserRecord(userId);
    res.json({ success: true, item, bookmarks: filterBookReferences(user.bookmarks) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add bookmark', message: err.message });
  }
});

app.delete('/api/user/bookmarks/:id', (req, res) => {
  try {
    const userId = (req as any).userId;
    const bookmarkId = req.params.id;
    removeBookmark(userId, bookmarkId);
    const user = getUserRecord(userId);
    res.json({ success: true, bookmarks: filterBookReferences(user.bookmarks) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove bookmark', message: err.message });
  }
});

app.get('/api/user/history', (req, res) => {
  try {
    const userId = (req as any).userId;
    const userData = filterUserBookCollections(getUserRecord(userId));
    res.json({ userId, history: userData.history });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get reading history', message: err.message });
  }
});

app.post('/api/user/history', (req, res) => {
  try {
    const userId = (req as any).userId;
    const { bookId, bookTitle, category, lastPosition, lastSection } = req.body;
    if (!bookId) {
      return res.status(400).json({ error: 'Missing bookId' });
    }
    if (isExcludedBook(bookId)) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const item = recordReadingHistory(userId, {
      bookId,
      bookTitle: bookTitle || 'ספר',
      category: category || '',
      lastPosition: lastPosition || 1,
      lastSection: lastSection || ''
    });

    const user = getUserRecord(userId);
    res.json({ success: true, item, history: filterBookReferences(user.history) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record reading history', message: err.message });
  }
});

app.delete('/api/user/history/:id', (req, res) => {
  try {
    const userId = (req as any).userId;
    const history = removeReadingHistoryItem(userId, String(req.params.id));
    res.json({ success: true, history: filterBookReferences(history) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove reading history item', message: err.message });
  }
});

app.delete('/api/user/history', (req, res) => {
  try {
    const userId = (req as any).userId;
    clearReadingHistory(userId);
    res.json({ success: true, history: [] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear reading history', message: err.message });
  }
});

app.post('/api/user/link-email', (req, res) => {
  try {
    const userId = (req as any).userId;
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    linkEmailToUser(userId, email);
    res.json({ success: true, email, userId });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to link email', message: err.message });
  }
});


// ... (existing imports)

// User Settings endpoints (Disk-Persistent)
app.get('/api/user/settings', (req, res) => {
  try {
    const userId = (req as any).userId;
    const settings = getUserSettings(userId);
    res.json({ success: true, userId, settings });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get settings', message: err.message });
  }
});

app.post('/api/user/settings', (req, res) => {
  try {
    const userId = (req as any).userId;
    const newSettings = req.body || {};
    const updated = updateUserSettings(userId, newSettings);
    res.json({ success: true, userId, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update settings', message: err.message });
  }
});

app.post('/api/user/reset-settings', (req, res) => {
  try {
    const userId = (req as any).userId;
    const updated = updateUserSettings(userId, {});
    const user = getUserRecord(userId);
    user.settings = {};
    res.json({ success: true, userId, settings: {} });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset settings', message: err.message });
  }
});

// Full Backup and Restore endpoints
app.get('/api/user/backup', (req, res) => {
  try {
    const userId = (req as any).userId;
    const backup = filterUserBookCollections(exportUserBackup(userId));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="otzaria_backup_${Date.now()}.json"`);
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export backup', message: err.message });
  }
});

app.post('/api/user/restore', (req, res) => {
  try {
    const userId = (req as any).userId;
    const { backupData, mode } = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ error: 'Invalid backup data' });
    }

    const safeBackup = filterUserBookCollections(backupData);
    const updatedUser = filterUserBookCollections(
      importUserBackup(userId, safeBackup, mode === 'replace' ? 'replace' : 'merge')
    );
    res.json({
      success: true,
      userId,
      bookmarks: updatedUser.bookmarks,
      history: updatedUser.history,
      settings: updatedUser.settings
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore backup', message: err.message });
  }
});

app.post('/api/smart-search/stream', searchRateLimiter, requireSearchToken, (req, res) => {
  const { question } = req.body;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let isClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      isClosed = true;
      console.log('🟡 [smart-search] client socket closed');
    }
  });

  const emit = (event: any) => {
    if (isClosed || res.writableEnded) return;
    try {
      const payload = `data: ${JSON.stringify(event)}\n\n`;
      res.write(payload);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {
      isClosed = true;
    }
  };

  // 🟢 לוג כניסה + מצב ה-key ברגע הבקשה
  backendLog(emit, 'info', 'route', `HIT. question=${JSON.stringify(question)} | KEY present?=${!!process.env.GROQ_API_KEY} len=${process.env.GROQ_API_KEY?.length}`);

  if (!question?.trim()) {
    emit({ type: 'error', message: 'שאלה חסרה' });
    res.write('data: {"type":"close"}\n\n');
    return res.end();
  }

  runSmartSearch(question, emit, (req as any).userToken || (req as any).userId)
    .then(() => backendLog(emit, 'info', 'route', 'runSmartSearch resolved'))
    .catch((e) => backendLog(emit, 'error', 'route', `runSmartSearch REJECTED: ${e.message}`))
    .finally(() => {
      if (!res.writableEnded) {
        backendLog(emit, 'info', 'route', 'closing stream');
        res.write('data: {"type":"close"}\n\n');
        res.end();
      }
    });
});

// Start Express server with Vite in dev mode or static files in production
async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const indexPath = path.join(distPath, 'index.html');
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDist = fs.existsSync(indexPath);
  let frontendApproved = false;

  try {
    frontendApproved = hasApprovedFrontend(indexPath);
  } catch (error: any) {
    console.error(`[FRONTEND GUARD] Could not inspect ${indexPath}:`, error.message);
  }

    // The new frontend is served at the origin root (/). Retire the experimental /a path.
  if (isProduction) {
    app.get(['/a', '/a/*'], (_req, res) => res.redirect(308, '/'));
  }

  if (isProduction && !frontendApproved) {
    console.error('[FRONTEND GUARD] Missing or unapproved dist/index.html; showing the unavailable page.');
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.status(503).type('text/plain').send('Frontend unavailable. Please try again later.');
    });
  } else if (hasDist) {
    // The embedded HTML reader is a standalone document, not the app shell.
    // Serve it and its local PDF.js modules without immutable caching. Previous
    // versions used a one-year immutable cache and could leave broken HTML in browsers.
    const vilnaHtmlRoot = path.join(distPath, 'vilna-html');
    app.get('/vilna-html/index.html', (_req, res) => {
      const htmlPath = path.join(vilnaHtmlRoot, 'index.html');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      if (!fs.existsSync(htmlPath)) {
        return res.status(503).type('text/plain').send(
          'Tzurat HaDaf HTML unavailable: dist/vilna-html/index.html is missing. Rebuild the frontend.'
        );
      }
      return res.sendFile(htmlPath);
    });
    app.use('/vilna-html', express.static(vilnaHtmlRoot, {
      index: false,
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }));

    // Production Mode: Serve highly-optimized production assets from build folder
    console.log('[PROD] Serving built static files from dist/ with long-lived client caching');
    app.use(express.static(distPath, { 
      maxAge: '31536000000', // 1 year cache
      immutable: true,
      index: false
    }));

    // Support /old/ subpath routing for assets
    app.use('/old', express.static(distPath, { 
      maxAge: '31536000000',
      immutable: true,
      index: false
    }));

    // Asset fallback resolver: if a hashed bundle (e.g. index-E2R312Bd.js or vendor-*.js) was requested
    // but the exact hash changed, serve the current equivalent build chunk so it NEVER fails or gets HTML!
    app.get(['/assets/:file', '/old/assets/:file'], (req, res, next) => {
      const requestedFile = String(req.params.file || '');
      const directPath = path.join(distPath, 'assets', requestedFile);
      if (fs.existsSync(directPath)) {
        return res.sendFile(directPath);
      }

      try {
        const files = fs.readdirSync(path.join(distPath, 'assets'));
        const prefix = requestedFile.split('-')[0]; // e.g. 'index' or 'vendor'
        const ext = path.extname(requestedFile);
        const match = files.find(f => f.startsWith(prefix + '-') && f.endsWith(ext));
        if (match) {
          return res.sendFile(path.join(distPath, 'assets', match));
        }
      } catch {}

      if (requestedFile.endsWith('.js')) {
        return res.status(404).type('application/javascript').send('// Script not found');
      }
      if (requestedFile.endsWith('.css')) {
        return res.status(404).type('text/css').send('/* Stylesheet not found */');
      }
      next();
    });

    app.get('*', (req, res) => {
      // Guard against returning HTML for missing static files
      if (req.path.endsWith('.js') || req.path.endsWith('.mjs')) {
        return res.status(404).type('application/javascript').send('// Script not found');
      }
      if (req.path.endsWith('.css')) {
        return res.status(404).type('text/css').send('/* Stylesheet not found */');
      }
      if (req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.ico') || req.path.endsWith('.svg')) {
        return res.status(404).send('Not found');
      }
      // The app shell embeds the complete frontend bundle. Never let browsers or
      // reverse proxies keep an older index.html after a deployment.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Development Mode: Enable Vite Dev Server Middlewares (Local development only)
    console.log('[DEV] Vite dev server middlewares activated (On-demand compilation)');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false
      },
      appType: 'custom'
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Otzaria Server] Pure SQLite Server successfully listening on http://0.0.0.0:${PORT}`);

    // Check if the search service (Tantivy) is running on port 8080 during boot
    setTimeout(async () => {
      try {
        const healthCheck = await fetch('http://localhost:8080/health', {
          signal: AbortSignal.timeout(5000)
        });
        if (healthCheck.ok) {
          console.log('[BOOT] ✅ Search service (Tantivy) is available on port 8080');
        } else {
          console.error('[BOOT] ⚠️ Search service returned status', healthCheck.status);
        }
      } catch (e: any) {
        console.error('[BOOT] ⚠️ Search service is NOT available! Search will fail until it starts.');
        console.error('[BOOT]    To start it: pm2 start /home/opc/otzaria-web-search/search_service/target/release/otzaria_search_service --name otzaria-search');
      }
    }, 1000);
  });
}

if (process.env.VERCEL !== '1' && !process.env.NOW_REGION) {
  startServer();
}

export default app;
