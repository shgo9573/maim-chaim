import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const APP_NAME = 'mayim-chaim-otzaria-mcp';
const APP_VERSION = '0.1.0';
const FAILURE_TEXT = 'אין לי כעת גישה לאתר נסה שוב מאוחר יותר';
const BASE_URL = (process.env.OTZARIA_BASE_URL || 'https://otzaria.duckdns.org').replace(/\/+$/, '');
const OTZARIA_UID = (process.env.OTZARIA_UID || '').trim();
if (!OTZARIA_UID) {
  console.error('Missing OTZARIA_UID. Copy .env.example to .env and set the owner-provided UID before starting this server.');
  process.exit(1);
}
const REQUEST_TIMEOUT_MS = Number(process.env.OTZARIA_TIMEOUT_MS || 20000);
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3010);
const RATE_LIMIT = Number(process.env.MCP_RATE_LIMIT_PER_MINUTE || 90);

const requiredHeaders = {
  accept: 'application/json',
  'accept-language': 'he,en-US;q=0.9,en;q=0.8',
  'content-type': 'application/json',
  'x-otzaria-uid': OTZARIA_UID,
  referer: `${BASE_URL}/`,
  origin: BASE_URL,
};

function apiFailure() {
  return { isError: true, content: [{ type: 'text', text: FAILURE_TEXT }] };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function makeDirectLink(bookId, lineIndex) {
  return `${BASE_URL}/?book=${encodeURIComponent(String(bookId))}&line=${encodeURIComponent(String(lineIndex))}`;
}

// Preserve the API's response while adding a canonical reader link wherever a result
// contains the IDs described by the API contract. Do not synthesize source text or refs.
function addReaderLinks(value) {
  if (Array.isArray(value)) return value.map(addReaderLinks);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = addReaderLinks(child);
  const bookId = out.bookId ?? out.book_id;
  const lineIndex = out.lineIndex ?? out.line_index;
  if (bookId !== undefined && bookId !== null && lineIndex !== undefined && lineIndex !== null) {
    out.otzariaUrl = makeDirectLink(bookId, lineIndex);
  }
  return out;
}

async function fetchOtzaria(path, { method = 'GET', body } = {}) {
  const url = new URL(path, `${BASE_URL}/`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: requiredHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    });
    const text = await response.text();
    if (!response.ok) {
      // Never disclose upstream diagnostics or pretend a failed result is a source.
      throw new Error(`Otzaria HTTP ${response.status}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Upstream did not return JSON');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function registerTools(server) {
  server.registerTool(
    'search_otzaria',
    {
      title: 'חיפוש באוצריא',
      description: 'חיפוש טקסטואלי במסד הנתונים של מים חיים / אוצריא. מחזיר את נתוני ה-API, ללא המצאת ציטוטים. כשאפשר מצורף otzariaUrl לכל תוצאה.',
      inputSchema: {
        query: z.string().trim().min(1).max(500).describe('מחרוזת החיפוש בעברית'),
        limit: z.number().int().min(1).max(50).optional().describe('מספר התוצאות המרבי; ברירת מחדל 15'),
        offset: z.number().int().min(0).max(100000).optional().describe('היסט התוצאות; ברירת מחדל 0'),
        category: z.string().max(200).optional().describe('קטגוריית סינון; ברירת מחדל all'),
        mode: z.enum(['advanced', 'exact', 'phrase', 'fuzzy']).optional().describe('מצב חיפוש; ברירת מחדל advanced'),
        exactMatch: z.boolean().optional(),
        gematriaSearch: z.boolean().optional(),
      },
    },
    async ({ query, limit, offset, category, mode, exactMatch, gematriaSearch }) => {
      try {
        const payload = {
          query,
          limit: limit ?? 15,
          offset: offset ?? 0,
          category: category ?? 'all',
          exactMatch: exactMatch ?? false,
          gematriaSearch: gematriaSearch ?? false,
          mode: mode ?? 'advanced',
          sortBy: 'relevance',
          slop: 0,
          proximityScope: 'wordDistance',
          resultGrouping: 'none',
        };
        const data = await fetchOtzaria('/api/search', { method: 'POST', body: payload });
        const enriched = addReaderLinks(data);
        return { content: [{ type: 'text', text: jsonText(enriched) }] };
      } catch (error) {
        console.error('[search_otzaria]', error?.message || error);
        return apiFailure();
      }
    },
  );

  server.registerTool(
    'get_book_content',
    {
      title: 'שליפת תוכן ספר',
      description: 'שליפת שורות מספר קיים לפי מזהה ושורות התחלה/סיום. השתמש בכלי כדי לאמת ציטוט ואת ההקשר לפני תשובה.',
      inputSchema: {
        bookId: z.union([z.string().min(1).max(80), z.number().int().positive()]).describe('מזהה הספר'),
        start: z.number().int().min(0).max(100000000).describe('מספר שורת התחלה'),
        end: z.number().int().min(0).max(100000000).describe('מספר שורת סיום'),
      },
    },
    async ({ bookId, start, end }) => {
      if (end < start || end - start > 60) {
        return { isError: true, content: [{ type: 'text', text: 'טווח השורות אינו תקין. יש לבחור טווח של עד 61 שורות.' }] };
      }
      try {
        const id = encodeURIComponent(String(bookId));
        const data = await fetchOtzaria(`/api/books/${id}/content?start=${start}&end=${end}`);
        return { content: [{ type: 'text', text: jsonText(addReaderLinks(data)) }] };
      } catch (error) {
        console.error('[get_book_content]', error?.message || error);
        return apiFailure();
      }
    },
  );

  server.registerTool(
    'get_line_commentaries',
    {
      title: 'מפרשים על שורה',
      description: 'שליפת המפרשים והקישורים הקשורים לשורה מסוימת בספר.',
      inputSchema: {
        bookId: z.union([z.string().min(1).max(80), z.number().int().positive()]).describe('מזהה הספר'),
        line: z.number().int().min(0).max(100000000).describe('מספר השורה'),
      },
    },
    async ({ bookId, line }) => {
      try {
        const id = encodeURIComponent(String(bookId));
        const data = await fetchOtzaria(`/api/books/${id}/links?line=${line}`);
        return { content: [{ type: 'text', text: jsonText(addReaderLinks(data)) }] };
      } catch (error) {
        console.error('[get_line_commentaries]', error?.message || error);
        return apiFailure();
      }
    },
  );

  server.registerTool(
    'get_book_toc',
    {
      title: 'תוכן עניינים של ספר',
      description: 'שליפת תוכן העניינים של ספר כדי לאתר פרק, סימן או מראה מקום מדויק.',
      inputSchema: {
        bookId: z.union([z.string().min(1).max(80), z.number().int().positive()]).describe('מזהה הספר'),
      },
    },
    async ({ bookId }) => {
      try {
        const id = encodeURIComponent(String(bookId));
        const data = await fetchOtzaria(`/api/books/${id}/toc`);
        return { content: [{ type: 'text', text: jsonText(data) }] };
      } catch (error) {
        console.error('[get_book_toc]', error?.message || error);
        return apiFailure();
      }
    },
  );

  server.registerTool(
    'check_otzaria_connection',
    {
      title: 'בדיקת חיבור לאוצריא',
      description: 'בודק בפועל אם נקודת הקצה של עץ הספרייה מחזירה JSON. אינו מחזיר את כל הקטלוג.',
      inputSchema: {},
    },
    async () => {
      try {
        const data = await fetchOtzaria('/api/library/tree');
        const summary = {
          ok: true,
          endpoint: `${BASE_URL}/api/library/tree`,
          responseType: Array.isArray(data) ? 'array' : typeof data,
          topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 40) : [],
          itemCount: Array.isArray(data) ? data.length : undefined,
          checkedAt: new Date().toISOString(),
        };
        return { content: [{ type: 'text', text: jsonText(summary) }] };
      } catch (error) {
        console.error('[check_otzaria_connection]', error?.message || error);
        return apiFailure();
      }
    },
  );
}

function createMcpServer() {
  const server = new McpServer(
    { name: APP_NAME, version: APP_VERSION },
    {
      instructions: [
        'אתה משמש כחוקר תורני המחובר למאגר אוצריא באמצעות כלי MCP של מים חיים.',
        'כאשר נשאלת שאלה תורנית, הלכתית, או מתבקשים מקורות יהודיים, השתמש תחילה בכלי search_otzaria לפני ניסוח התשובה, אלא אם המשתמש ביקש במפורש שלא לחפש.',
        'אם החיפוש הראשון אינו מספק, חפש שוב בניסוחים חלופיים, במילות מפתח שונות ובביטויים מדויקים. אל תסתמך רק על זיכרון כללי כאשר אפשר לבדוק את המקורות במאגר.',
        'כאשר תוצאת חיפוש נראית רלוונטית, אמת את לשונה והקשרה באמצעות get_book_content. השתמש ב-get_book_toc לאיתור פרק או סימן וב-get_line_commentaries לבדיקת מפרשים וקישורים כאשר הדבר מועיל.',
        'צטט רק מידע שמופיע בפועל בתוצאות הכלים. השתמש בשם הספר, המחבר, המיקום, מספרי השורות והקישורים כפי שהוחזרו; אל תמציא מראה מקום, מספר עמוד, סימן, לשון מקור או כתובת URL.',
        'כאשר קיים otzariaUrl בתוצאה, השתמש בו כקישור בסיסי לשורה. כאשר אתה מפנה לציטוט מסוים, העדף קישור שמדגיש את המילים המצוטטות בפועל במקום קישור כללי לשורה.',
        'כדי ליצור קישור עם הדגשה, שלוף תחילה את השורה המלאה באמצעות get_book_content, אתר בה את הביטוי המדויק שציטטת, וחשב את טווח המילים שלו בשורה. השתמש בפרמטר w=start-end, כאשר start ו-end הם אינדקסים של מילים החל מ-1 וכוללים את שתי קצות הטווח. לדוגמה, לטווח מילים 38 עד 41 יש להשתמש ב-w=38-41.',
        'מבנה הקישור שהפרונט הנוכחי תומך בו להדגשת ציטוט הוא: https://otzaria.duckdns.org/?book=<bookId>&title=<URL-encoded-title>&line=<lineIndex>&w=<start>-<end>. השתמש בפרמטרים אחרי סימן השאלה ולא בתבנית #book, קח את מזהה הספר, הכותרת ומספר השורה מהתוצאה המאומתת, קודד את הכותרת לכתובת URL, והחלף את מצייני המקום בערכים בפועל.',
        'ספור מילים לפי הטקסט המלא של השורה, לפי סדר הופעתן, ללא תגיות HTML; התאמת הביטוי חייבת להיות מדויקת. אם הביטוי מופיע יותר מפעם אחת, השתמש בהקשר כדי לזהות את ההופעה הנכונה. אל תנחש טווח מילים. אם לא ניתן לאמת את המיקום המדויק, השתמש בקישור לשורה ללא w והבהר שההדגשה אינה זמינה.',
        'הפרד בבירור בין ציטוט מילולי, סיכום של המקור והסבר שלך. אל תציג ניסוח שלך כאילו הוא לשון הספר.',
        'בשאלה הלכתית שיש בה מחלוקת, חפש מקורות לצדדים השונים כאשר ניתן, והבחן בין מקור מפורש, פרשנות ומסקנה. אל תקבע שההלכה הוכרעה רק מפני שמצאת מקור אחד.',
        'אם הכלים לא מצאו מקור מתאים, או שהחיבור נכשל, אמור זאת במפורש. אל תטען שבוצע חיפוש אם לא הופעל כלי בהצלחה, ואל תמציא תוצאות כדי למלא את החסר.',
        'ענה בעברית כברירת מחדל, בשפה תורנית ברורה ומדויקת. הצג תחילה מסקנה תמציתית, אחריה מקורות מאומתים, ולבסוף הסבר קצר על משמעותם ומגבלות החיפוש.'
      ].join('\n')
    }
  );
  registerTools(server);
  return server;
}

const app = express();
app.disable('x-powered-by');
// Nginx is the only public entry point; honor its forwarded client address for rate limiting.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb', strict: true }));

// A lightweight per-process limiter to prevent accidental request floods.
const clients = new Map();
app.use('/mcp', (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = clients.get(key);
  if (!current || now - current.start >= 60_000) {
    clients.set(key, { start: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > RATE_LIMIT) return res.status(429).json({ error: 'Too many requests' });
  return next();
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: APP_NAME, version: APP_VERSION, upstreamBaseUrl: BASE_URL, now: new Date().toISOString() });
});

// MCP uses stateful Streamable HTTP sessions. Each client gets its own server/transport,
// keyed by MCP-Session-Id, so initialize, tools/list and tools/call share protocol state.
const mcpSessions = new Map();
const MAX_MCP_SESSIONS = 200;
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

async function closeMcpSession(sessionId, session) {
  mcpSessions.delete(sessionId);
  try { await session.transport.close(); } catch {}
  try { await session.server.close(); } catch {}
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
  for (const [sessionId, session] of mcpSessions.entries()) {
    if (session.lastActivity < cutoff) void closeMcpSession(sessionId, session);
  }
}, 60_000).unref();

app.all('/mcp', async (req, res) => {
  const suppliedSessionId = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(suppliedSessionId) ? suppliedSessionId[0] : suppliedSessionId;

  if (sessionId) {
    const session = mcpSessions.get(String(sessionId));
    if (!session) {
      return res.status(404).json({ error: 'Unknown or expired MCP session. Initialize a new session.' });
    }
    session.lastActivity = Date.now();
    try {
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[mcp session request]', error?.stack || error);
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
    return;
  }

  // Only initialize may create a new session. Other calls must present MCP-Session-Id.
  if (req.method !== 'POST' || req.body?.method !== 'initialize') {
    return res.status(400).json({ error: 'An MCP-Session-Id is required. Initialize a session first.' });
  }
  if (mcpSessions.size >= MAX_MCP_SESSIONS) {
    return res.status(503).json({ error: 'MCP session capacity reached. Retry shortly.' });
  }

  const server = createMcpServer();
  let transport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      mcpSessions.set(newSessionId, { server, transport, lastActivity: Date.now() });
      console.log('[MCP] Session initialized; active sessions=' + mcpSessions.size);
    },
  });
  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) mcpSessions.delete(id);
    console.log('[MCP] Session closed; active sessions=' + mcpSessions.size);
  };

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp initialize]', error?.stack || error);
    if (transport.sessionId) mcpSessions.delete(transport.sessionId);
    try { await transport.close(); } catch {}
    try { await server.close(); } catch {}
    if (!res.headersSent) res.status(500).json({ error: 'MCP initialization failed' });
  }
});

app.use((error, _req, res, _next) => {
  console.error('[http]', error?.message || error);
  if (res.headersSent) return;
  res.status(400).json({ error: 'Invalid request' });
});

app.listen(PORT, HOST, () => {
  console.log(`${APP_NAME} ${APP_VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`Upstream: ${BASE_URL}`);
  console.log('Upstream reachability is NOT confirmed until check_otzaria_connection succeeds.');
});
