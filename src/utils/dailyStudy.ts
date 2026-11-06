import { HDate, HebrewCalendar, Location, Locale, Sedra, Zmanim } from '@hebcal/core';
import { DafYomi, MishnaYomiIndex } from '@hebcal/learning';
import { dailyRambam1 } from '@hebcal/learning/rambam1Base';
import { chofetzChaim } from '@hebcal/learning/chofetzChaimBase';
import { dirshuDafHalacha } from '@hebcal/learning/dirshuDafHalachaBase';
import { arukhHaShulchanYomi } from '@hebcal/learning/arukhHaShulchanYomiBase';
import { kitzurShulchanAruch } from '@hebcal/learning/kitzurShulchanAruchBase';
import { hebrewNumber } from './talmud';

/** Convert every Arabic number in a string to plain Hebrew letters (7 → ז, 443 → תמג). */
export function hebNums(text: string): string {
  return text.replace(/\d+/g, (m) => hebrewNumber(Number(m)) || m);
}

export interface DailyItem {
  key: string;
  label: string;
  value: string;
  bookHint?: string;
  lineHint?: number;
}

/** Hebrew date string for a given JS date. */
export function hebrewDate(d: Date): string {
  const hd = new HDate(d);
  return hd.renderGematriya();
}

export function dafYomiFor(d: Date): { name: string; blatt: number; label: string } | null {
  try {
    const daf = new DafYomi(d);
    return { name: daf.getName(), blatt: Number(daf.getBlatt()), label: hebNums(daf.render('he')) };
  } catch {
    return null;
  }
}

let mishnaIndex: MishnaYomiIndex | null = null;
export function mishnaYomiReadingsFor(d: Date): { k: string; v: string }[] {
  try {
    if (!mishnaIndex) mishnaIndex = new MishnaYomiIndex();
    return mishnaIndex.lookup(d);
  } catch {
    return [];
  }
}
export function mishnaYomiFor(d: Date): string | null {
  const pair = mishnaYomiReadingsFor(d);
  if (pair.length) {
    const fmt = (m: { k: string; v: string }) => `${Locale.gettext(m.k, 'he')} ${hebNums(m.v)}`;
    if (pair.length > 1 && pair[0].k === pair[pair.length - 1].k) {
      return `${Locale.gettext(pair[0].k, 'he')} ${hebNums(pair[0].v)}–${hebNums(pair[pair.length - 1].v.split(':').pop() || pair[pair.length - 1].v)}`;
    }
    return pair.length > 1 ? `${fmt(pair[0])} – ${fmt(pair[pair.length - 1])}` : fmt(pair[0]);
  }
  return null;
}

export function parashaFor(d: Date): string | null {
  try {
    const hd = new HDate(d);
    const result = new Sedra(hd.getFullYear(), true).lookup(hd);
    if (result.chag || !result.parsha.length) return null;
    return `פרשת ${result.parsha.map((name) => Locale.gettext(name, 'he')).join('־')}`;
  } catch {
    return null;
  }
}

export function rambamReadingFor(d: Date): { name: string; perek: number | string } | null {
  try { return dailyRambam1(d); } catch { return null; }
}

export function rambamFor(d: Date): string {
  const r = rambamReadingFor(d);
  return r ? `${Locale.gettext(r.name, 'he')}, פרק ${hebNums(String(r.perek))}` : '—';
}

export function chofetzChaimReadingFor(d: Date) {
  try { return chofetzChaim(new HDate(d)); } catch { return null; }
}

const HEB = (n: number) => hebrewNumber(n);

/**
 * Today's portion of the worldwide Sefer Chofetz Chaim daily calendar (completed three times a year:
 * from א׳ תשרי, א׳ שבט and א׳ סיון). For example כלל א׳ סעיף א׳ is learned on כ״ו תשרי / כ״ה שבט / כ״ה סיון.
 */
export function chofetzChaimFor(d: Date, schedule: string = 'world_three_times'): string {
  if (schedule === 'world_biannual' || schedule === 'daily_order') {
    const r = chofetzChaimBiannual(d);
    return r.label;
  }
  const r = chofetzChaimReadingFor(d);
  if (!r) return '—';
  const sections: Record<string, string> = {
    Hakdamah: 'הקדמה', Psichah: 'פתיחה', Lavin: 'לאוין', Asin: 'עשיין', Arurin: 'ארורין',
    HilchosLH: 'הלכות לשון הרע', HilchosRechilus: 'הלכות רכילות', Tziyurim: 'ציורים',
  };
  const name = sections[r.k] || 'חפץ חיים';
  const ends = (Array.isArray(r.e) ? r.e : [r.e]).filter((x) => x !== undefined && String(x) !== String(r.b));
  if (r.k === 'HilchosLH' || r.k === 'HilchosRechilus' || r.k === 'Tziyurim') {
    const [rule, para] = String(r.b).split('.').map(Number);
    const begin = para ? `כלל ${HEB(rule)} סעיף ${HEB(para)}` : `כלל ${HEB(rule)}`;
    const last = ends[ends.length - 1];
    if (last === undefined) return `${name}, ${begin}`;
    const [eRule, ePara] = String(last).split('.').map(Number);
    const end = eRule === rule ? `${HEB(ePara)}` : `כלל ${HEB(eRule)} סעיף ${HEB(ePara)}`;
    return `${name}, ${begin}–${end}`;
  }
  if (r.k === 'Arurin') return name;
  const b = Number(r.b);
  const last = ends.length ? Number(ends[ends.length - 1]) : NaN;
  return `${name} ${HEB(b)}${Number.isFinite(last) ? `–${HEB(last)}` : ''}`;
}

export interface ChofetzReadingCustom {
  k: string;
  b: string | number;
  e: string | number;
  label: string;
}

/** 2-halachot a day biannual schedule (נוצרי לשון / מפעל החפץ חיים) */
export function chofetzChaimBiannual(d: Date): ChofetzReadingCustom {
  const hd = new HDate(d);
  const roshHashana = new HDate(1, 'Tishrei', hd.getFullYear()).abs();
  const dayOfYear = Math.max(0, hd.abs() - roshHashana);
  const cycleDay = (dayOfYear % 180) + 1;

  // Schedule mapping:
  if (cycleDay <= 5) return { k: 'Hakdamah', b: 1, e: 4, label: 'הקדמה' };
  if (cycleDay <= 10) {
    const n = (cycleDay - 5) * 2;
    return { k: 'Psichah', b: n - 1, e: n, label: `פתיחה לאוין ${HEB(n - 1)}–${HEB(n)}` };
  }
  if (cycleDay <= 15) {
    const n = (cycleDay - 10) * 2;
    return { k: 'Asin', b: n - 1, e: n, label: `פתיחה עשין ${HEB(n - 1)}–${HEB(n)}` };
  }
  if (cycleDay === 16) return { k: 'Arurin', b: 1, e: 4, label: 'פתיחה ארורין' };

  // Hilchos Lashon Hara (rules 1..10)
  const lhSchedule: [number, number, number][] = [
    // [rule, startPara, endPara]
    [1, 1, 2], [1, 3, 4], [1, 5, 6], [1, 7, 8], [1, 9, 9], // days 17..21 (כלל א)
    [2, 1, 2], [2, 3, 4], [2, 5, 6], [2, 7, 8], [2, 9, 10], [2, 11, 12], [2, 13, 13], // days 22..28 (כלל ב)
    [3, 1, 2], [3, 3, 4], [3, 5, 6], [3, 7, 8], // days 29..32 (כלל ג)
    [4, 1, 2], [4, 3, 4], [4, 5, 6], [4, 7, 8], [4, 9, 10], [4, 11, 12], // days 33..38 (כלל ד)
    [5, 1, 2], [5, 3, 4], [5, 5, 6], [5, 7, 8], // days 39..42 (כלל ה)
    [6, 1, 2], [6, 3, 4], [6, 5, 6], [6, 7, 8], [6, 9, 10], [6, 11, 12], // days 43..48 (כלל ו)
    [7, 1, 2], [7, 3, 4], [7, 5, 6], [7, 7, 8], [7, 9, 10], [7, 11, 12], [7, 13, 14], // days 49..55 (כלל ז)
    [8, 1, 2], [8, 3, 4], [8, 5, 6], [8, 7, 8], [8, 9, 10], [8, 11, 12], [8, 13, 14], // days 56..62 (כלל ח)
    [9, 1, 2], [9, 3, 4], [9, 5, 6], // days 63..65 (כלל ט)
    [10, 1, 2], [10, 3, 4], [10, 5, 6], [10, 7, 8], [10, 9, 10], [10, 11, 12], [10, 13, 14], [10, 15, 16], [10, 17, 17], // days 66..74 (כלל י)
  ];

  const lhIndex = cycleDay - 17;
  if (lhIndex < lhSchedule.length) {
    const [rule, startP, endP] = lhSchedule[lhIndex];
    return {
      k: 'HilchosLH',
      b: `${rule}.${startP}`,
      e: `${rule}.${endP}`,
      label: startP === endP ? `הלכות לשון הרע, כלל ${HEB(rule)} סעיף ${HEB(startP)}` : `הלכות לשון הרע, כלל ${HEB(rule)} סעיף ${HEB(startP)}–${HEB(endP)}`,
    };
  }

  // Hilchos Rechilut (rules 1..9)
  const rechSchedule: [number, number, number][] = [
    [1, 1, 2], [1, 3, 4], [1, 5, 6], [1, 7, 8], [1, 9, 10], [1, 11, 11],
    [2, 1, 2], [2, 3, 4],
    [3, 1, 2], [3, 3, 4],
    [4, 1, 2], [4, 3, 3],
    [5, 1, 2], [5, 3, 4], [5, 5, 6], [5, 7, 7],
    [6, 1, 2], [6, 3, 4], [6, 5, 6], [6, 7, 8], [6, 9, 10], [6, 11, 11],
    [7, 1, 2], [7, 3, 4], [7, 5, 5],
    [8, 1, 2], [8, 3, 4], [8, 5, 5],
    [9, 1, 2], [9, 3, 4], [9, 5, 6], [9, 7, 8], [9, 9, 10], [9, 11, 12], [9, 13, 14], [9, 15, 15],
  ];

  const rechIndex = cycleDay - 17 - lhSchedule.length;
  if (rechIndex < rechSchedule.length) {
    const [rule, startP, endP] = rechSchedule[rechIndex];
    return {
      k: 'HilchosRechilus',
      b: `${rule}.${startP}`,
      e: `${rule}.${endP}`,
      label: startP === endP ? `הלכות רכילות, כלל ${HEB(rule)} סעיף ${HEB(startP)}` : `הלכות רכילות, כלל ${HEB(rule)} סעיף ${HEB(startP)}–${HEB(endP)}`,
    };
  }

  return { k: 'Tziyurim', b: 1, e: 2, label: 'ציורים והערות' };
}

export function halachaYomitFor(d: Date, schedule: string = 'dirshu_mishna_berura'): string {
  try {
    if (schedule === 'kitzur_shulchan_aruch') {
      const r = kitzurShulchanAruch(d);
      return r ? `קיצור שולחן ערוך ${hebNums(String(r.b))}${r.e ? `–${hebNums(String(r.e))}` : ''}` : 'אין לימוד מתוזמן היום';
    }
    if (schedule === 'shulchan_aruch') {
      const r = arukhHaShulchanYomi(d);
      return `${Locale.gettext(r.k, 'he')} ${hebNums(r.v)}`;
    }
    if (schedule === 'rambam_halacha') {
      const r = dailyRambam1(d);
      return `${Locale.gettext(r.name, 'he')}, פרק ${hebNums(String(r.perek))}`;
    }
    const r = dirshuDafHalacha(d);
    if (!r) return 'אין מראה מקום זמין לתאריך זה';
    return `${r.review ? 'חזרה · ' : ''}שולחן ערוך סימן ${hebNums(String(r.b))}${r.e ? `–${hebNums(String(r.e))}` : ''}`;
  } catch {
    return 'אין מראה מקום זמין לתאריך זה';
  }
}

export interface ZmanimRow {
  key: string;
  label: string;
  time: string;
}

export const LOCATIONS: { id: string; label: string; lat: number; lon: number; tz: string; il: boolean }[] = [
  { id: 'jerusalem', label: 'ירושלים', lat: 31.7683, lon: 35.2137, tz: 'Asia/Jerusalem', il: true },
  { id: 'telaviv', label: 'תל אביב', lat: 32.0853, lon: 34.7818, tz: 'Asia/Jerusalem', il: true },
  { id: 'haifa', label: 'חיפה', lat: 32.794, lon: 34.9896, tz: 'Asia/Jerusalem', il: true },
  { id: 'beersheva', label: 'באר שבע', lat: 31.2518, lon: 34.7915, tz: 'Asia/Jerusalem', il: true },
  { id: 'bneibrak', label: 'בני ברק', lat: 32.0807, lon: 34.8338, tz: 'Asia/Jerusalem', il: true },
  { id: 'tsfat', label: 'צפת', lat: 32.9646, lon: 35.496, tz: 'Asia/Jerusalem', il: true },
  { id: 'newyork', label: 'ניו יורק', lat: 40.7128, lon: -74.006, tz: 'America/New_York', il: false },
  { id: 'london', label: 'לונדון', lat: 51.5074, lon: -0.1278, tz: 'Europe/London', il: false },
  { id: 'paris', label: 'פריז', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', il: false },
];

export function zmanimFor(d: Date, locationId: string, method: 'gra' | 'mga' | 'baal_hatanya'): ZmanimRow[] {
  const loc = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0];
  const location = new Location(loc.lat, loc.lon, loc.il, loc.tz, loc.label, loc.il ? 'IL' : undefined);
  const z = new Zmanim(location, d, false);
  const fmt = (t: Date | null | undefined) => {
    if (!t || isNaN(t.getTime())) return '—';
    return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: loc.tz }).format(t);
  };
  const mga = method === 'mga';
  const rows: ZmanimRow[] = [
    { key: 'alot', label: 'עלות השחר', time: fmt(z.alotHaShachar()) },
    { key: 'talit', label: 'טלית ותפילין', time: fmt(z.misheyakir()) },
    { key: 'sunrise', label: 'הנץ החמה', time: fmt(z.sunrise()) },
    { key: 'shma', label: mga ? 'סוף זמן ק"ש (מג"א)' : 'סוף זמן ק"ש (גר"א)', time: fmt(mga ? z.sofZmanShmaMGA() : z.sofZmanShma()) },
    { key: 'tfila', label: mga ? 'סוף זמן תפילה (מג"א)' : 'סוף זמן תפילה (גר"א)', time: fmt(mga ? z.sofZmanTfillaMGA() : z.sofZmanTfilla()) },
    { key: 'chatzot', label: 'חצות היום', time: fmt(z.chatzot()) },
    { key: 'mincha-g', label: 'מנחה גדולה', time: fmt(z.minchaGedola()) },
    { key: 'mincha-k', label: 'מנחה קטנה', time: fmt(z.minchaKetana()) },
    { key: 'plag', label: 'פלג המנחה', time: fmt(z.plagHaMincha()) },
    { key: 'sunset', label: 'שקיעה', time: fmt(z.sunset()) },
    { key: 'tzeit', label: 'צאת הכוכבים', time: fmt(z.tzeit(8.5)) },
  ];
  return rows;
}

export function holidaysFor(d: Date): string[] {
  try {
    const events = HebrewCalendar.calendar({ start: d, end: d, il: true, locale: 'he', candlelighting: false });
    return events.map((e) => e.render('he'));
  } catch {
    return [];
  }
}
