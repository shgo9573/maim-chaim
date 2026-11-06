// src/services/smartSearch.ts — תקשורת IPv4 ישירה ל-Groq API
import https from 'node:https';
import { isExcludedBook } from './seforimDatabase.js';

const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
// שימוש ב-HTTPS למניעת שגיאת 301 Redirect, עם תמיכה ב-API מקומי
const SEARCH_SERVICE = process.env.INTERNAL_API_URL || 'https://otzaria.duckdns.org/api';
const GROQ_HOST = 'api.groq.com';
const GROQ_PATH = '/openai/v1/chat/completions';

export type EmitFn = (e: StreamEvent) => void;

export interface NumberedResult {
  num: number; book_id: number; line_index: number; title: string;
  reference: string; snippet: string; score: number;
  search_query: string; search_mode: string;
}

export type StreamEvent =
  | { type: 'phase'; phase: string; message: string }
  | { type: 'search_plan'; searches: string[]; modes: string[] }
  | { type: 'search_result'; query: string; mode: string; hits: number; results: NumberedResult[] }
  | { type: 'curated_list'; results: NumberedResult[] }
  | { type: 'llm_choosing'; partial: string }
  | { type: 'chosen'; numbers: number[]; reason: string }
  | { type: 'final_results'; results: NumberedResult[] }
  | { type: 'done'; summary: string }
  | { type: 'backend_log'; level: 'info' | 'warn' | 'error'; tag: string; msg: string }
  | { type: 'error'; message: string };

export function backendLog(emit: EmitFn, level: 'info'|'warn'|'error', tag: string, msg: string) {
  const p = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🟢';
  console.log(`${p} [BACKEND:${tag}] ${msg}`);
  emit({ type: 'backend_log', level, tag, msg });
}

// 🌐 פונקציית HTTPS יציבה וחסינת-ברזל שכופה IPv4 (פותרת 100% מבעיות IPv6 Blackhole בענן)
function postHttpsIPv4(
  host: string,
  path: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number = 20000,
  logFn?: (msg: string) => void
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const postData = Buffer.from(body, 'utf8');
    const startTime = Date.now();

    const doLog = (msg: string) => {
      console.log(`[GROQ-NET] ${msg}`);
      logFn?.(msg);
    };

    const req = https.request({
      hostname: host,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
      },
      family: 4, // ⭐ כופה IPv4 מוחלט — מונע תקיעת תקשורת ב-Oracle ובספקי ענן!
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        doLog(`התקבל מקטע נתונים (${chunk.length} בתים)...`);
      });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        doLog(`הבקשה הושלמה בהצלחה בתוך ${duration}ms! קוד סטטוס=${res.statusCode}`);
        resolve({ status: res.statusCode || 200, text: data });
      });
    });

    req.on('socket', (socket) => {
      doLog(`Socket הוקצה עבור ${host}:443`);
      socket.on('lookup', (err, address, family, hostName) => {
        if (err) {
          doLog(`❌ שגיאת DNS lookup: ${err.message}`);
        } else {
          doLog(`🌐 כתובת נפתרה ב-DNS: ${hostName} -> ${address} (IPv${family})`);
        }
      });
      socket.on('connect', () => {
        doLog(`🔌 חיבור TCP הצליח! מתחיל TLS handshake...`);
      });
      socket.on('secureConnect', () => {
        doLog(`🔒 TLS Handshake הושלם בהצלחה! ממתין לתשובת המודל מ-Groq...`);
      });
    });

    req.on('timeout', () => {
      doLog(`⏱️ Timeout אחרי ${timeoutMs}ms בהמתנה ל-${host}!`);
      req.destroy(new Error(`⏱️ Timeout אחרי ${timeoutMs}ms בהתחברות ל-${host}`));
    });

    req.on('error', (err) => {
      doLog(`❌ שגיאת תקשורת: ${err.message}`);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// ניקוי תגיות thinking של מודלי reasoning
function cleanLlmOutput(text: string): string {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function safeParseJson<T>(rawText: string, fb: T): T {
  const text = cleanLlmOutput(rawText);
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : fb;
  } catch {
    return fb;
  }
}

function stripHtml(s: string) { return (s || '').replace(/<[^>]*>/g, ''); }

async function callLLM(prompt: string, emit: EmitFn, tag: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('GROQ_API_KEY חסר בהגדרות הסביבה');
  }

  // רשימת מודלים לניסיון בסדר עדיפויות
  const modelsToTry = [
    GROQ_MODEL,
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768'
  ].filter((v, i, a) => a.indexOf(v) === i); // הסרת כפילויות

  let lastError: any = null;

  for (const currentModel of modelsToTry) {
    backendLog(emit, 'info', tag, `POST Groq (IPv4) | model=${currentModel} | key len=${key.length}`);

    const makeSingleCall = async (withReasoningParam: boolean): Promise<string> => {
      const requestBody: Record<string, any> = {
        model: currentModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      };

      // עבור מודלי Qwen / reasoning — ביטול thinking mode כדי לקבל תשובה מהירה
      if (withReasoningParam && (currentModel.toLowerCase().includes('qwen') || currentModel.toLowerCase().includes('think'))) {
        requestBody.reasoning_effort = 'none';
      }

      backendLog(emit, 'info', tag, `שולח בקשה ישירה ל-Groq עבור [${currentModel}]...`);
      const bodyStr = JSON.stringify(requestBody);

      const res = await postHttpsIPv4(
        GROQ_HOST,
        GROQ_PATH,
        {
          'Authorization': `Bearer ${key}`,
        },
        bodyStr,
        18000,
        (netMsg) => backendLog(emit, 'info', tag, netMsg)
      );

      backendLog(emit, 'info', tag, `[${currentModel}] התקבלה תגובה! status=${res.status} bodyLen=${res.text.length}`);
      
      // ⭐ הדפסה מלאה וישירה של תגובת ה-API הגולמית ללוגים
      backendLog(emit, 'info', tag, `[RAW RESPONSE] ${res.text}`);

      if (res.status < 200 || res.status >= 300) {
        // אם Groq מחזיר שגיאה לגבי reasoning_effort, ננסה שוב בלעדיו
        if (withReasoningParam && res.text.includes('reasoning_effort')) {
          backendLog(emit, 'warn', tag, 'Retrying Groq without reasoning_effort param...');
          return makeSingleCall(false);
        }
        throw new Error(`Groq ${res.status}: ${res.text}`);
      }

      const data = JSON.parse(res.text);
      const choice = data?.choices?.[0]?.message;
      let out = choice?.content ?? '';

      // תמיכה בשדות reasoning אם ה-content העיקרי ריק
      if (!out && choice?.reasoning) {
        out = choice.reasoning;
      }

      // ⭐ הדפסה מלאה של פלט המודל שחולץ
      backendLog(emit, 'info', tag, `[MODEL OUTPUT] ${out}`);
      return cleanLlmOutput(out);
    };

    try {
      return await makeSingleCall(true);
    } catch (err: any) {
      lastError = err;
      backendLog(emit, 'warn', tag, `מודל ${currentModel} נכשל: ${err.message}. עובר למודל חלופי...`);
    }
  }

  backendLog(emit, 'error', tag, `❌ כל המודלים נכשלו: ${lastError?.message}`);
  throw lastError || new Error('כל ניסיונות הקריאה ל-Groq נכשלו');
}

// ═══ שלב 1 ═══
async function questionToSearches(question: string, emit: EmitFn) {
  backendLog(emit, 'info', 'planning', 'start');
  emit({ type: 'phase', phase: 'planning', message: 'מנתח את השאלה וממיר אותה לשפת ספרי המקורות...' });

  const prompt = `אתה מנוע חיפוש תורני וספרן מומחה באוצריית הספרים התורנית "אוצריא".

שים לב לכלל היסוד המרכזי של החיפוש:
המשתמש שואל שאלה מדוברת (למשל: "מה הסיבה שלא תוקעים בשופר בשבת?", "למה אסור לפתוח פקק של בקבוק בשבת?", "איך מברכים על ברק?").
אולם, ספרי הקודש (ש"ס, רמב"ם, שולחן ערוך, נושאי כלים, שו"ת ופוסקים) **אינם כתובים בצורת שאלות ותשובות שיחתיות** ולא מופיעות בהם מילות שאלה כמו "מה הסיבה", "למה", "מדוע", "כיצד", "האם מותר".
בספרים הדברים כתובים כ**טקסט הלכתי או למדני רציף**!

לכן, עליך להמיר את שאלת המשתמש לביטויים כפי שהם כתובים בפועל בספרים:
1. במקום לחפש שאלות על סיבה ("מה הסיבה", "למה", "מדוע"):
   - חפש מילות טעם והסבר תורניות: "טעם ש...", "מפני ש...", "משום ש...", "גזירה שמא...", "כדי שלא...", או את שם הטעם המקובל בהלכה (למשל: "גזירה שמא יעבירנו", "משום מראית עין", "פסיק רישא", "שמא יקצוץ").
2. במקום שאלות על היתר/איסור ("האם מותר לפתוח בקבוק"):
   - חפש את הגדרת הדין בלשון הפוסקים: "מותר לפתוח", "איסור פתיחת", "עשיית פתח", "מתקן כלי", "קורע בית הצוואר", "סוגר ופותח".
3. במקום שאלות על סדר פעולה ("איך עושים", "איך מברכים"):
   - חפש: "סדר עשיית...", "כיצד מברך", "נוסח ברכת", "הרואה רעמים מברך".
4. הסר לחלוטין כל מילת שאלה: "מה", "למה", "מדוע", "האם", "כיצד", "איפה".
5. חובה להגדיר לפחות 3 שאילתות חיפוש מגוונות (בין 3 ל-5 שאילתות לכל שאלה!):
   - "exact": ביטוי תורני מדויק ורציף (2-4 מילים) שמנוסח בדיוק כלשון חז"ל או הפוסקים.
   - "advanced": מילות מפתח תורניות שיכולות להופיע בסמיכות באותו סעיף.

דוגמה 1:
שאלה: "מה הסיבה שלא תוקעים בשופר בראש השנה שחל בשבת?"
תוצאה נדרשת:
{
  "searches": [
    "גזירה שמא יעבירנו ארבע אמות",
    "שופר שחל להיות בשבת",
    "הכל חייבין בתקיעת שופר ואין הכל בקיאין",
    "משום שבות דרבה שמא יוליכנו"
  ],
  "modes": ["exact", "advanced", "advanced", "advanced"]
}

דוגמה 2:
שאלה: "מה הטעם שאסור לפתוח פקק של בקבוק בשבת?"
תוצאה נדרשת:
{
  "searches": [
    "פתיחת פקק בשבת משום עשיית כלי",
    "מותר לפתוח בקבוק",
    "עשיית פתח מתקן כלי",
    "שבירת בית הצוואר פקק"
  ],
  "modes": ["advanced", "advanced", "exact", "advanced"]
}

שאלת המשתמש הנוכחית:
"${question}"

החזר אך ורק אובייקט JSON תקין ומדויק במבנה הזה עם לפחות 3 שאילתות (ללא שום טקסט נוסף):
{"searches": ["שאילתה 1", "שאילתה 2", "שאילתה 3"], "modes": ["exact", "advanced", "advanced"]}`;

  try {
    const raw = await callLLM(prompt, emit, 'planning');
    const json = safeParseJson(raw, { searches: [question], modes: ['advanced'] });
    backendLog(emit, 'info', 'planning', `PARSED: ${JSON.stringify(json)}`);
    emit({ type: 'search_plan', searches: json.searches, modes: json.modes });
    return json;
  } catch (err: any) {
    backendLog(emit, 'warn', 'planning', `שימוש בברירת מחדל בעקבות שגיאה: ${err.message}`);
    const fallback = { searches: [question], modes: ['advanced'] };
    emit({ type: 'search_plan', searches: fallback.searches, modes: fallback.modes });
    return fallback;
  }
}

// ═══ שלב 2 ═══
async function executeNumberedSearches(plan: { searches: string[]; modes: string[] }, emit: EmitFn, userToken?: string) {
  backendLog(emit, 'info', 'searching', 'start');
  emit({ type: 'phase', phase: 'searching', message: `מבצע חיפוש במאגר הספרים (${plan.searches.length} שאילתות)...` });

  const all: NumberedResult[] = [];
  const seen = new Set<string>();
  let counter = 1;

  // נתיבי חיפוש: עדיפות לשרת המקומי (מהיר פי 100 וללא 301 redirect), ואז כתובת חיצונית
  const searchEndpoints = [
    process.env.INTERNAL_API_URL,
    'http://127.0.0.1:3000/api',
    SEARCH_SERVICE,
    'https://otzaria.duckdns.org/api'
  ].filter(Boolean) as string[];

  // הסרת כפילויות
  const uniqueEndpoints = [...new Set(searchEndpoints)];

  for (let i = 0; i < plan.searches.length; i++) {
    const query = plan.searches[i];
    const mode = plan.modes[i] || 'advanced';
    let searchSucceeded = false;

    for (const endpoint of uniqueEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const tokenToSend = userToken || 'internal_smart_search_token';
        const r = await fetch(`${endpoint}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Otzaria-UID': tokenToSend
          },
          body: JSON.stringify({ query, mode, limit: 30, slop: mode === 'advanced' ? 2 : 0 }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        backendLog(emit, 'info', 'search', `"${query}" [${endpoint}] status=${r.status}`);
        if (!r.ok) continue;

        const data = await r.json();
        const resultsList = data.results || [];
        const numbered: NumberedResult[] = [];

        for (const it of resultsList) {
          if (isExcludedBook(it.book_id)) continue;

          const k = `${it.book_id}:${it.line_index}`;
          if (seen.has(k)) continue;
          seen.add(k);

          // שליפת השורה המלאה של הספר מתוך seforim.db אם קיים כדי לא לחתוך
          let fullLine = it.snippet || '';
          try {
            const { getBookContentFromDb, isSeforimDbAvailable } = await import('./seforimDatabase.js');
            if (isSeforimDbAvailable()) {
              const bookData = getBookContentFromDb(it.book_id, it.line_index, it.line_index);
              const found = bookData?.lines?.find(l => l.lineIndex === it.line_index)?.content;
              if (found && found.trim().length > 0) {
                fullLine = found;
              }
            }
          } catch {}

          numbered.push({
            num: counter++,
            book_id: it.book_id,
            line_index: it.line_index,
            title: it.title,
            reference: it.reference,
            snippet: fullLine,
            score: it.score ?? 0,
            search_query: query,
            search_mode: mode
          });
        }

        all.push(...numbered);
        emit({ type: 'search_result', query, mode, hits: numbered.length, results: numbered });
        searchSucceeded = true;
        break; // הצליח עבור שאילתה זו, עובר לשאילתה הבאה
      } catch (e: any) {
        backendLog(emit, 'warn', 'search', `נתיב ${endpoint} נכשל עבור "${query}": ${e.message}`);
      }
    }

    if (!searchSucceeded) {
      backendLog(emit, 'error', 'search', `❌ כל נתיבי החיפוש נכשלו עבור השאילתה: "${query}"`);
    }
  }

  backendLog(emit, 'info', 'searching', `DONE total=${all.length}`);
  return all;
}

// ═══ שלב 3 ═══
async function chooseResults(question: string, results: NumberedResult[], emit: EmitFn) {
  backendLog(emit, 'info', 'choosing', `building list from ${results.length}`);
  emit({ type: 'phase', phase: 'curating', message: `מסנן ומעריך ${results.length} מקורות...` });
  emit({ type: 'curated_list', results });

  // שולח למודל את כל השורה המלאה שבה התוצאה נמצאת
  const listText = results
    .slice(0, 35)
    .map(r => `[${r.num}] ${r.title} - ${r.reference}\n    "${stripHtml(r.snippet)}"`)
    .join('\n');

  const prompt = `אתה מנתח מקורות תורניים מומחה בספריית "אוצריא".

השאלה שנשאלה:
"${question}"

לפניך רשימת תוצאות שנמצאו בספרי המאגר עם השורה המלאה שלהן (מסומנות במספרים בסוגריים מרובעים):
${listText}

תפקידך:
1. לסנן ולבחור מתוכם את המקורות המדויקים, הרלוונטיים והישירים ביותר שעונים על השאלה (בחר בין 3 ל-7 המקורות המנצחים).
2. לתת עדיפות לספרי יסוד ופוסקים (תלמוד בבלי, רמב"ם, טור ושולחן ערוך, נושאי כלים, שו"ת ופוסקים).
3. לנסח נימוק קצר ותמציתי (משפט אחד או שניים) המסכם את התשובה העולה מתוך המקורות שנבחרו.

החזר אך ורק אובייקט JSON תקין במבנה הבא (ללא שום תוספת טקסט מסביב):
{"chosen": [1, 3, 5], "reason": "הגמרא והשולחן ערוך מבארים שהטעם הוא..."}`;

  try {
    const raw = await callLLM(prompt, emit, 'choosing');
    emit({ type: 'llm_choosing', partial: raw });
    const json = safeParseJson(raw, { chosen: [], reason: 'parse fail' });
    const chosen: number[] = Array.isArray(json.chosen) ? json.chosen : [];
    backendLog(emit, 'info', 'choosing', `CHOSEN=${JSON.stringify(chosen)} reason=${json.reason}`);
    emit({ type: 'chosen', numbers: chosen, reason: json.reason || '' });
    return chosen;
  } catch (err: any) {
    backendLog(emit, 'warn', 'choosing', `סינון נכשל, מחזיר את כל התוצאות המובילות: ${err.message}`);
    return results.slice(0, 5).map(r => r.num);
  }
}

// ═══ Orchestrator ═══
export async function runSmartSearch(question: string, emit: EmitFn, userToken?: string) {
  try {
    if (!process.env.GROQ_API_KEY) {
      emit({ type: 'error', message: 'GROQ_API_KEY חסר בהגדרות השרת' });
      return;
    }
    backendLog(emit, 'info', 'orchestrator', `START q="${question}"`);
    const plan = await questionToSearches(question, emit);
    const results = await executeNumberedSearches(plan, emit, userToken);

    if (results.length === 0) {
      emit({ type: 'done', summary: 'לא נמצאו תוצאות עבור השאילתה' });
      return;
    }

    const chosen = await chooseResults(question, results, emit);
    const final = results.filter(r => chosen.includes(r.num));
    const toShow = final.length > 0 ? final : results.slice(0, 5);

    emit({ type: 'final_results', results: toShow });
    emit({ type: 'done', summary: `נבחרו ${toShow.length} מתוך ${results.length} תוצאות` });
  } catch (err: any) {
    backendLog(emit, 'error', 'orchestrator', `UNCAUGHT: ${err?.message}`);
    emit({ type: 'error', message: err?.message || 'שגיאה כללית בחיפוש החכם' });
  }
}
