import { hebrewToNumber } from './gematria';
import { Locale } from '@hebcal/core';

export interface Masechta {
  he: string;
  english: string;
  aliases?: string[];
  last: number;
}

export const MASECHTOT: Masechta[] = [
  { he: 'ברכות', english: 'Berakhot', aliases: ['Berachos', 'Berachot'], last: 64 },
  { he: 'שבת', english: 'Shabbat', aliases: ['Shabbos'], last: 157 },
  { he: 'עירובין', english: 'Eruvin', last: 105 },
  { he: 'פסחים', english: 'Pesachim', last: 121 },
  { he: 'שקלים', english: 'Shekalim', last: 22 },
  { he: 'יומא', english: 'Yoma', last: 88 },
  { he: 'סוכה', english: 'Sukkah', aliases: ['Sukah'], last: 56 },
  { he: 'ביצה', english: 'Beitzah', aliases: ['Beitzah', 'Beytzah'], last: 40 },
  { he: 'ראש השנה', english: 'Rosh Hashana', aliases: ['Rosh Hashanah'], last: 35 },
  { he: 'תענית', english: 'Ta’anit', aliases: ['Taanis', 'Taanit'], last: 31 },
  { he: 'מגילה', english: 'Megillah', aliases: ['Megillah', 'Megilah'], last: 32 },
  { he: 'מועד קטן', english: 'Moed Katan', aliases: ['Moed Koton'], last: 29 },
  { he: 'חגיגה', english: 'Chagigah', last: 27 },
  { he: 'יבמות', english: 'Yevamot', aliases: ['Yevamos'], last: 122 },
  { he: 'כתובות', english: 'Ketubot', aliases: ['Kesubos', 'Ketubos'], last: 112 },
  { he: 'נדרים', english: 'Nedarim', last: 91 },
  { he: 'נזיר', english: 'Nazir', last: 66 },
  { he: 'סוטה', english: 'Sotah', last: 49 },
  { he: 'גיטין', english: 'Gittin', aliases: ['Gitin'], last: 90 },
  { he: 'קידושין', english: 'Kiddushin', aliases: ['Kidushin'], last: 82 },
  { he: 'בבא קמא', english: 'Bava Kamma', aliases: ['Baba Kamma'], last: 119 },
  { he: 'בבא מציעא', english: 'Bava Metzia', aliases: ['Baba Metzia'], last: 119 },
  { he: 'בבא בתרא', english: 'Bava Batra', aliases: ['Baba Basra'], last: 176 },
  { he: 'סנהדרין', english: 'Sanhedrin', last: 113 },
  { he: 'מכות', english: 'Makkot', aliases: ['Makkos'], last: 24 },
  { he: 'שבועות', english: 'Shevuot', aliases: ['Shevuos'], last: 49 },
  { he: 'עבודה זרה', english: 'Avodah Zarah', aliases: ['Avodah Zara'], last: 76 },
  { he: 'הוריות', english: 'Horayot', aliases: ['Horayos'], last: 14 },
  { he: 'זבחים', english: 'Zevachim', aliases: ['Zevachim'], last: 120 },
  { he: 'מנחות', english: 'Menachot', aliases: ['Menachos'], last: 110 },
  { he: 'חולין', english: 'Chullin', aliases: ['Chulin'], last: 142 },
  { he: 'בכורות', english: 'Bekhorot', aliases: ['Bechorot', 'Bechoros'], last: 61 },
  { he: 'ערכין', english: 'Arakhin', aliases: ['Arachin'], last: 34 },
  { he: 'תמורה', english: 'Temurah', last: 34 },
  { he: 'כריתות', english: 'Keritot', aliases: ['Kerisos'], last: 28 },
  { he: 'מעילה', english: 'Meilah', last: 22 },
  { he: 'תמיד', english: 'Tamid', last: 33 },
  { he: 'נדה', english: 'Niddah', aliases: ['Nidah'], last: 73 },
];

const SOFIT: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const GEMATRIA: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };

export function hebrewNumber(value: number): string {
  if (value <= 0) return '';
  let n = value;
  let out = '';
  while (n >= 400) { out += 'ת'; n -= 400; }
  if (n === 15) return out + 'טו';
  if (n === 16) return out + 'טז';
  for (const [letter, number] of [['ש', 300], ['ר', 200], ['ק', 100], ['צ', 90], ['פ', 80], ['ע', 70], ['ס', 60], ['נ', 50], ['מ', 40], ['ל', 30], ['כ', 20], ['י', 10], ['ט', 9], ['ח', 8], ['ז', 7], ['ו', 6], ['ה', 5], ['ד', 4], ['ג', 3], ['ב', 2], ['א', 1]] as [string, number][]) {
    if (n >= number) { out += letter; n -= number; }
  }
  return out;
}

export function parseHebrewNumber(value: string): number | null {
  let n = 0;
  for (const raw of value.replace(/[״׳"'.,:\s]/g, '')) {
    const ch = SOFIT[raw] || raw;
    if (!GEMATRIA[ch]) return null;
    n += GEMATRIA[ch];
  }
  return n || null;
}

export function masechtaForName(name: string): Masechta | undefined {
  const norm = name.toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z\u0590-\u05ff]/g, '');
  const translated = Locale.gettext(name, 'he');
  const byHebrew = MASECHTOT.find((m) => m.he === translated);
  if (byHebrew) return byHebrew;
  return MASECHTOT.find((m) => [m.he, m.english, ...(m.aliases || [])].some((a) => {
    const x = a.toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z\u0590-\u05ff]/g, '');
    return norm === x || norm.includes(x) || x.includes(norm);
  }));
}

/**
 * Number of amudim of each masechta in the daf-yomi.com "צורת הדף" viewer.
 * Ids are sequential across Shas, one per amud, starting at ברכות ב. = 1.
 * Verified against the portal: ברכות לב: = 62, שבת כג. = 168, יבמות יח. = 1613,
 * נדרים לב. = 2105, נזיר לג: = 2288, בבא קמא יט. = 2825, חולין ו. = 4616.
 * מעילה covers 2a–37b (קינים, תמיד ומידות continue its numbering).
 */
const PORTAL_AMUDIM: [string, number][] = [
  ['ברכות', 125], ['שבת', 312], ['עירובין', 207], ['פסחים', 240], ['שקלים', 42], ['יומא', 173],
  ['סוכה', 110], ['ביצה', 78], ['ראש השנה', 67], ['תענית', 59], ['מגילה', 61], ['מועד קטן', 55],
  ['חגיגה', 51], ['יבמות', 242], ['כתובות', 222], ['נדרים', 180], ['נזיר', 130], ['סוטה', 96],
  ['גיטין', 178], ['קידושין', 162], ['בבא קמא', 236], ['בבא מציעא', 235], ['בבא בתרא', 350],
  ['סנהדרין', 224], ['מכות', 46], ['שבועות', 96], ['עבודה זרה', 150], ['הוריות', 25], ['זבחים', 238],
  ['מנחות', 217], ['חולין', 281], ['בכורות', 119], ['ערכין', 65], ['תמורה', 65], ['כריתות', 54],
  ['מעילה', 72], ['נדה', 143],
];

/** daf-yomi.com page id for a given masechta / daf / amud, or null when unknown. */
export function dafYomiPortalId(masechtaHe: string, daf: number, amud: 'a' | 'b'): number | null {
  const name = masechtaHe === 'תמיד' || masechtaHe === 'קינים' || masechtaHe === 'מידות' || masechtaHe === 'מדות' ? 'מעילה' : masechtaHe;
  let start = 1;
  for (const [he, count] of PORTAL_AMUDIM) {
    if (he === name) {
      const offset = (Math.max(2, daf) - 2) * 2 + (amud === 'b' ? 1 : 0);
      return start + Math.min(offset, count - 1);
    }
    start += count;
  }
  return null;
}

export function dafYomiPortalUrl(masechtaHe: string, daf: number, amud: 'a' | 'b'): string {
  const id = dafYomiPortalId(masechtaHe, daf, amud);
  return id ? `https://daf-yomi.com/DafYomi_Page.aspx?vt=1&id=${id}` : 'https://daf-yomi.com/DafYomi_Page.aspx?vt=1&id=1';
}

export function dafTocTitle(daf: number, amud: 'a' | 'b'): string {
  return `דף ${hebrewNumber(daf)}${amud === 'a' ? '.' : ':'}`;
}

export function parseDafRef(ref: string): { daf: number; amud: 'a' | 'b' } | null {
  if (!ref || typeof ref !== 'string') return null;
  const plain = ref
    .replace(/[\u05F3\u05F4'"\u0060´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Common Otzaria headings: "דף כג עא", "דף כג ע"ב", "דף 23 עמוד ב".
  const explicit = plain.match(/(?:^|\s)דף\s*([א-תךםןףץ]{1,6}|\d{1,3})\s*(?:ע\s*([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב]))/u);
  if (explicit) {
    const daf = /^\d+$/.test(explicit[1]) ? Number(explicit[1]) : parseHebrewNumber(explicit[1]);
    if (!daf || daf < 1) return null;
    const side = explicit[2] || explicit[3] || explicit[4] || 'א';
    return { daf, amud: side.includes('ב') || side.includes('שני') ? 'b' : 'a' };
  }

  // Compact headings use a period for amud alef and a colon for amud bet.
  const compact = plain.match(/(?:דף\s*)?([א-תךםןףץ]{1,6}|\d{1,3})\s*([.:])/u);
  if (compact) {
    const daf = /^\d+$/.test(compact[1]) ? Number(compact[1]) : parseHebrewNumber(compact[1]);
    if (!daf || daf < 1) return null;
    return { daf, amud: compact[2] === '.' ? 'a' : 'b' };
  }

  // A bare "דף כג" heading means the first side unless a side was specified.
  const withoutSide = plain.match(/(?:^|\s)דף\s*([א-תךםןףץ]{1,6}|\d{1,3})$/u);
  if (withoutSide) {
    const daf = /^\d+$/.test(withoutSide[1]) ? Number(withoutSide[1]) : parseHebrewNumber(withoutSide[1]);
    if (daf && daf >= 1) return { daf, amud: 'a' };
  }
  return null;
}

export function talmudBookFor(masechta: Masechta, books: { title: string; categoryPath?: string; heCategories?: string }[]) {
  const aliases = [masechta.he, `תלמוד בבלי ${masechta.he}`, `בבלי ${masechta.he}`];
  const isTalmud = (b: { title: string; categoryPath?: string; heCategories?: string }) => /תלמוד|גמרא|בבלי/u.test(`${b.title} ${b.categoryPath || ''} ${b.heCategories || ''}`);
  const scored = books.map((book) => {
    const title = book.title.replace(/^תלמוד בבלי\s*/u, '').replace(/^בבלי\s*/u, '').trim();
    const exact = aliases.some((a) => book.title === a || title === a.replace(/^(תלמוד בבלי|בבלי)\s*/u, ''));
    const contains = aliases.some((a) => book.title.includes(a) || a.includes(book.title));
    const score = exact && isTalmud(book) ? 0 : isTalmud(book) && contains ? 1 : exact ? 2 : contains ? 3 : 99;
    return { book, score };
  }).filter((x) => x.score < 99).sort((a, b) => a.score - b.score);
  return scored[0]?.book;
}

export type ParsedDafHeading = { daf: number; amud: 'a' | 'b' };

/**
 * Reads a daf heading in any of the shapes the library uses: "דף מ״ז.",
 * "דף מז:", "דף מ״ז ע״ב", "דף 47" — with or without gershayim, and with either
 * Hebrew letters or Arabic digits.
 */
export function parseDafHeading(title: string): ParsedDafHeading | null {
  // Gershayim inside a numeral ("מ״ז") would otherwise cut the number short,
  // which silently loses every heading and leaves a daf without bubbles.
  const plain = title.replace(/[\u05F3\u05F4'"`´]/g, '').replace(/\s+/g, ' ').trim();
  const match = plain.match(/דף\s*([א-תךםןףץ]{1,6})\s*(?:([.:])|ע\s*([אב]))?/u)
    || plain.match(/דף\s*(\d{1,3})\s*(?:([.:])|ע\s*([אב]))?/u);
  if (!match) return null;
  const daf = /^\d+$/.test(match[1]) ? Number(match[1]) : hebrewToNumber(match[1]);
  if (!daf) return null;
  return { daf, amud: match[2] === ':' || match[3] === 'ב' ? 'b' : 'a' };
}
