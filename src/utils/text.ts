const ALLOWED = new Set([
  'B', 'I', 'U', 'STRONG', 'EM', 'BIG', 'SMALL', 'SUP', 'SUB', 'BR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'P', 'DIV', 'MARK',
]);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META']);

function clean(node: Node, doc: Document) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      const el = child as Element;
      if (DROP.has(el.tagName)) {
        node.removeChild(el);
        continue;
      }
      clean(el, doc);
      if (ALLOWED.has(el.tagName)) {
        for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
      } else {
        while (el.firstChild) node.insertBefore(el.firstChild, el);
        node.removeChild(el);
      }
    } else if (child.nodeType !== 3) {
      node.removeChild(child);
    }
  }
}

const cache = new Map<string, string>();

export function sanitize(html: string): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return html;
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  clean(doc.body, doc);
  const out = doc.body.innerHTML;
  if (cache.size > 3000) cache.clear();
  cache.set(html, out);
  return out;
}

export function stripTags(html: string): string {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export const NIKUD_RE = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
export const TEAMIM_RE = /[\u0591-\u05AF]/g;

export interface TextOpts {
  nikud: boolean;
  teamim: boolean;
  punctuation: boolean;
  holyName: string;
}

const HOLY_RE = /י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה[\u0591-\u05C7]*/g;

export function processHtml(html: string, o: TextOpts): string {
  let out = sanitize(html);
  const needs = !o.nikud || !o.teamim || !o.punctuation || o.holyName !== 'יהוה';
  if (!needs) return out;
  const parts = out.split(/(<[^>]*>)/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;
    let t = parts[i];
    if (!t) continue;
    if (!o.teamim) t = t.replace(TEAMIM_RE, '');
    if (!o.nikud) t = t.replace(NIKUD_RE, '');
    if (o.holyName !== 'יהוה') t = t.replace(HOLY_RE, o.holyName);
    if (!o.punctuation) t = t.replace(/[.,:;!?]/g, '');
    parts[i] = t;
  }
  out = parts.join('');
  return out;
}

export function normalizeHe(s: string): string {
  return s.replace(NIKUD_RE, '').replace(TEAMIM_RE, '').replace(/["'״׳]/g, '').toLowerCase();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlight(html: string, query: string): string {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(NIKUD_RE, '').replace(/[*"]/g, ''))
    .filter((w) => w.length > 0 && !/^(AND|OR|NOT)$/.test(w));
  if (!words.length) return html;
  const sep = '[\\u0591-\\u05C7]*';
  const re = new RegExp(
    '(' + words.map((w) => Array.from(w).map((c) => escapeRe(c)).join(sep)).join('|') + ')',
    'gi',
  );
  const parts = html.split(/(<[^>]*>)/);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) parts[i] = parts[i].replace(re, '<mark class="hl">$1</mark>');
  }
  return parts.join('');
}

/** Wrap words [from..to] (0-based, by whitespace) of the text content in <mark>. */
export function highlightWords(html: string, from: number, to: number): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let idx = 0;
  let inWord = false;
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    for (const tok of node.data.split(/(\s+)/u)) {
      if (!tok) continue;
      if (/^\s+$/u.test(tok)) {
        if (inWord) {
          idx++;
          inWord = false;
        }
        fragment.append(doc.createTextNode(tok));
      } else {
        if (idx >= from && idx <= to) {
          const mark = doc.createElement('mark');
          mark.className = 'hl';
          mark.textContent = tok;
          fragment.append(mark);
        } else {
          fragment.append(doc.createTextNode(tok));
        }
        inWord = true;
      }
    }
    node.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}

/** Short snippet of ±n words around the first match of query in plain text. */
export function snippetAround(text: string, query: string, n = 8): string {
  const words = text.split(/\s+/).filter(Boolean);
  const qn = normalizeHe(query.trim());
  const qw = qn.split(/\s+/).filter(Boolean);
  if (!qw.length) return words.slice(0, n * 2).join(' ');
  let hit = -1;
  for (let i = 0; i < words.length; i++) {
    if (normalizeHe(words[i]).includes(qw[0])) {
      hit = i;
      break;
    }
  }
  if (hit < 0) return words.slice(0, n * 2).join(' ') + (words.length > n * 2 ? '…' : '');
  const s = Math.max(0, hit - n);
  const e = Math.min(words.length, hit + qw.length + n);
  return (s > 0 ? '…' : '') + words.slice(s, e).join(' ') + (e < words.length ? '…' : '');
}

export interface DeepLink {
  book: string;
  title?: string;
  line: number;
  from?: number;
  to?: number;
  text?: string;
}

/**
 * Links are written in the URL *fragment* (#book=..&line=..&w=..).
 * The fragment never reaches the server, so SPA fallbacks / redirects / CDNs
 * that drop or rewrite the query string cannot lose it.
 */
export function buildDeepLink(d: DeepLink): string {
  const url = new URL(window.location.href);
  url.search = '';
  const p = new URLSearchParams();
  p.set('book', d.book);
  if (d.title) p.set('title', d.title);
  p.set('line', String(d.line));
  if (d.from !== undefined && d.to !== undefined) p.set('w', `${d.from}-${d.to}`);
  url.hash = p.toString();
  return url.toString();
}

function locationsToCheck(): Location[] {
  const out: Location[] = [window.location];
  // when the app is embedded in a preview/wrapper frame, the link may live on the outer page
  try {
    if (window.top && window.top !== window && window.top.location.href) out.push(window.top.location);
  } catch {
    /* cross-origin parent – not readable */
  }
  return out;
}

export function parseDeepLink(): DeepLink | null {
  const clean = (s: string) => s.replace(/^#\/?/, '').replace(/^\?/, '').replace(/^\//, '');
  let p: URLSearchParams | null = null;
  for (const loc of locationsToCheck()) {
    const hashRaw = clean(loc.hash);
    // also accept "#/?book=..." and "#something?book=..."
    const hashParams = new URLSearchParams(hashRaw.includes('?') ? hashRaw.slice(hashRaw.indexOf('?') + 1) : hashRaw);
    const queryParams = new URLSearchParams(clean(loc.search));
    if (hashParams.has('book')) p = hashParams;
    else if (queryParams.has('book')) p = queryParams;
    if (p) break;
  }
  if (!p) return null;
  const book = p.get('book');
  if (!book) return null;
  const line = Math.max(1, Number(p.get('line')) || 1);
  const w = p.get('w');
  let from: number | undefined;
  let to: number | undefined;
  if (w) {
    const [a, b] = w.split('-').map(Number);
    if (Number.isFinite(a)) {
      from = a;
      to = Number.isFinite(b) ? b : a;
    }
  }
  return { book, title: p.get('title') || undefined, line, from, to, text: p.get('text') || undefined };
}

// Gematria
const STD: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
  ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90,
};
const SOFIT_BIG: Record<string, number> = { ך: 500, ם: 600, ן: 700, ף: 800, ץ: 900 };
const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

export function gematria(text: string, method: string, sofiyot: boolean): number {
  let sum = 0;
  for (const ch of text.replace(NIKUD_RE, '')) {
    if (!(ch in STD)) continue;
    if (method === 'standard') {
      sum += sofiyot && SOFIT_BIG[ch] ? SOFIT_BIG[ch] : STD[ch];
    } else if (method === 'small') {
      const v = STD[ch];
      sum += v % 9 === 0 ? 9 : v % 9;
    } else if (method === 'atbash' || method === 'albam') {
      const base = 'ךםןףץ'.includes(ch) ? 'כמנפצ'['ךםןףץ'.indexOf(ch)] : ch;
      const idx = LETTERS.indexOf(base);
      const mapped = method === 'atbash' ? LETTERS[LETTERS.length - 1 - idx] : LETTERS[(idx + 11) % 22];
      sum += STD[mapped];
    }
  }
  return sum;
}

export function toHebrewNumber(n: number): string {
  if (n <= 0) return String(n);
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];
  let s = '';
  let x = n;
  while (x >= 400) { s += 'ת'; x -= 400; }
  s += hundreds[Math.floor(x / 100)]; x %= 100;
  if (x === 15) return s + 'טו';
  if (x === 16) return s + 'טז';
  s += tens[Math.floor(x / 10)] + ones[x % 10];
  return s;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' });
}
