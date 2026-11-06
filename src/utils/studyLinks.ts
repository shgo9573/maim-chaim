import { api } from '../api';
import type { BookItem, ID, TocEntry } from '../types';
import { hebrewNumber, masechtaForName } from './talmud';
import { chofetzChaimBiannual, chofetzChaimFor, chofetzChaimReadingFor, dafYomiFor, halachaYomitFor, mishnaYomiReadingsFor, parashaFor, rambamReadingFor } from './dailyStudy';
import { HDate, Locale, Sedra } from '@hebcal/core';

/** English → Hebrew names of the Mishnah tractates. */
const MISHNA_HE: Record<string, string> = {
  Berakhot: 'ברכות', Peah: 'פאה', Demai: 'דמאי', Kilayim: 'כלאים', Sheviit: 'שביעית', Terumot: 'תרומות',
  Maasrot: 'מעשרות', 'Maaser Sheni': 'מעשר שני', Challah: 'חלה', Orlah: 'ערלה', Bikkurim: 'ביכורים',
  Shabbat: 'שבת', Eruvin: 'עירובין', Pesachim: 'פסחים', Shekalim: 'שקלים', Yoma: 'יומא', Sukkah: 'סוכה',
  Beitzah: 'ביצה', 'Rosh Hashanah': 'ראש השנה', Taanit: 'תענית', Megillah: 'מגילה', 'Moed Katan': 'מועד קטן',
  Chagigah: 'חגיגה', Yevamot: 'יבמות', Ketubot: 'כתובות', Nedarim: 'נדרים', Nazir: 'נזיר', Sotah: 'סוטה',
  Gittin: 'גיטין', Kiddushin: 'קידושין', 'Bava Kamma': 'בבא קמא', 'Bava Metzia': 'בבא מציעא',
  'Bava Batra': 'בבא בתרא', Sanhedrin: 'סנהדרין', Makkot: 'מכות', Shevuot: 'שבועות', Eduyot: 'עדויות',
  'Avodah Zarah': 'עבודה זרה', Avot: 'אבות', Horayot: 'הוריות', Zevachim: 'זבחים', Menachot: 'מנחות',
  Chullin: 'חולין', Bekhorot: 'בכורות', Arakhin: 'ערכין', Temurah: 'תמורה', Keritot: 'כריתות',
  Meilah: 'מעילה', Tamid: 'תמיד', Middot: 'מידות', Kinnim: 'קינים', Kelim: 'כלים', Oholot: 'אהלות',
  Negaim: 'נגעים', Parah: 'פרה', Tahorot: 'טהרות', Mikvaot: 'מקוואות', Niddah: 'נדה', Makhshirin: 'מכשירין',
  Zavim: 'זבים', 'Tevul Yom': 'טבול יום', Yadayim: 'ידיים', Oktzin: 'עוקצין',
};

export interface StudyTarget {
  /** candidate book titles, best first */
  titles: string[];
  /** TOC titles to look for inside the book, best first */
  tocTitles?: string[];
  label: string;
  kind?: 'bavli' | 'mishnah' | 'rambam' | 'parasha' | 'chofetz' | 'other';
  /** For a known Torah chapter/verse, use the content endpoint to find the verse. */
  chapter?: number;
  verse?: number;
  /** Chofetz Chaim section and rule/paragraph. */
  section?: string;
  rule?: number;
  paragraph?: number;
}

// Weekly Torah reading starts, indexed by Sedra's 1-based parsha number.
const PARASHA_STARTS: [string, number, number][] = [
  ['בראשית',1,1], ['בראשית',6,9], ['בראשית',12,1], ['בראשית',18,1], ['בראשית',23,1],
  ['בראשית',25,19], ['בראשית',28,10], ['בראשית',32,4], ['בראשית',37,1], ['בראשית',41,1],
  ['בראשית',44,18], ['בראשית',47,28], ['שמות',1,1], ['שמות',6,2], ['שמות',10,1],
  ['שמות',13,17], ['שמות',18,1], ['שמות',21,1], ['שמות',25,1], ['שמות',27,20],
  ['שמות',30,11], ['שמות',35,1], ['שמות',38,21], ['ויקרא',1,1], ['ויקרא',6,1],
  ['ויקרא',9,1], ['ויקרא',12,1], ['ויקרא',14,1], ['ויקרא',16,1], ['ויקרא',19,1],
  ['ויקרא',21,1], ['ויקרא',25,1], ['ויקרא',26,3], ['במדבר',1,1], ['במדבר',4,21],
  ['במדבר',8,1], ['במדבר',13,1], ['במדבר',16,1], ['במדבר',19,1], ['במדבר',22,2],
  ['במדבר',25,10], ['במדבר',30,2], ['במדבר',33,1], ['דברים',1,1], ['דברים',3,23],
  ['דברים',7,12], ['דברים',11,26], ['דברים',16,18], ['דברים',21,10], ['דברים',26,1],
  ['דברים',29,9], ['דברים',31,1], ['דברים',32,1], ['דברים',33,1],
];

function normalize(s: string): string {
  return s.replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
}

/** Picks the catalogue book that best matches one of the candidate titles. */
export function findBook(books: BookItem[], titles: string[]): BookItem | undefined {
  for (const want of titles) {
    const w = normalize(want);
    const exact = books.find((b) => normalize(b.title) === w);
    if (exact) return exact;
  }
  for (const want of titles) {
    const w = normalize(want);
    const partial = books
      .filter((b) => w.length >= 3 && normalize(b.title).includes(w))
      .sort((a, b) => a.title.length - b.title.length)[0];
    if (partial) return partial;
  }
  return undefined;
}

/** Finds the line index of the first TOC entry matching one of the wanted titles. */
export function findTocLine(toc: TocEntry[], wanted: string[]): number | undefined {
  for (const want of wanted) {
    const w = normalize(want);
    const exact = toc.find((t) => normalize(t.title) === w);
    if (exact) return exact.index;
  }
  for (const want of wanted) {
    const w = normalize(want);
    const partial = toc.find((t) => normalize(t.title).startsWith(w) || normalize(t.title).includes(w));
    if (partial) return partial.index;
  }
  return undefined;
}

/** Resolves a daily-study track to concrete book titles + a place inside the book. */
export function targetForTrack(key: string, date: Date, halachaSchedule = 'dirshu_mishna_berura', chofetzSchedule = 'world_three_times'): StudyTarget | null {
  if (key === 'dafYomi') {
    const daf = dafYomiFor(date);
    if (!daf) return null;
    const m = masechtaForName(daf.name);
    const he = m?.he ?? daf.name;
    return {
      titles: [`תלמוד בבלי ${he}`, `בבלי ${he}`, he], kind: 'bavli',
      tocTitles: [`דף ${hebrewNumber(daf.blatt)}.`, `דף ${hebrewNumber(daf.blatt)}`],
      label: `${he} דף ${hebrewNumber(daf.blatt)}`,
    };
  }

  if (key === 'mishnaYomi') {
    const pair = mishnaYomiReadingsFor(date);
    if (!pair.length) return null;
    const he = MISHNA_HE[pair[0].k] ?? pair[0].k;
    const perek = Number(String(pair[0].v).split(':')[0]);
    return {
      titles: [`משנה ${he}`, `משניות ${he}`, he],
      kind: 'mishnah',
      tocTitles: Number.isFinite(perek) ? [`פרק ${hebrewNumber(perek)}`, `משנה ${hebrewNumber(perek)}`] : undefined,
      label: `משנה ${he} ${pair[0].v.replace(/\d+/g, (n) => hebrewNumber(Number(n)))}`,
    };
  }

  if (key === 'rambam') {
    const r = rambamReadingFor(date);
    if (!r) return null;
    const perek = Number(r.perek);
    const heName = Locale.gettext(r.name, 'he');
    const halachot = heName.startsWith('הלכות ') ? heName : `הלכות ${heName}`;
    return {
      titles: [`משנה תורה, ${halachot}`, halachot, `משנה תורה ${halachot}`],
      kind: 'rambam',
      tocTitles: Number.isFinite(perek) ? [`פרק ${hebrewNumber(perek)}`] : undefined,
      label: `${heName} פרק ${typeof r.perek === 'number' ? hebrewNumber(r.perek) : r.perek}`,
    };
  }

  if (key === 'chofetzChaim') {
    const r = chofetzSchedule === 'world_biannual' || chofetzSchedule === 'daily_order'
      ? chofetzChaimBiannual(date)
      : chofetzChaimReadingFor(date);
    const section = r?.k || '';
    const numbers = String(r?.b ?? '').split('.').map(Number);
    return {
      titles: ['חפץ חיים', 'ספר חפץ חיים'],
      kind: 'chofetz',
      section,
      rule: numbers.length > 1 ? numbers[0] : undefined,
      paragraph: numbers.length > 1 ? numbers[1] : numbers[0],
      label: chofetzChaimFor(date, chofetzSchedule),
    };
  }

  if (key === 'halachaYomit') {
    if (halachaSchedule === 'kitzur_shulchan_aruch') {
      const m = halachaYomitFor(date, halachaSchedule).match(/(\d+)(?=:|\s|$)/);
      return { titles: ['קיצור שולחן ערוך'],
        tocTitles: m ? [`סימן ${hebrewNumber(Number(m[1]))}`] : undefined,
        label: 'קיצור שולחן ערוך' };
    }
    if (halachaSchedule === 'shulchan_aruch') {
      const m = halachaYomitFor(date, halachaSchedule).match(/(\d+)(?=[.:\s]|$)/);
      return { titles: ['ערוך השולחן', 'שולחן ערוך'],
        tocTitles: m ? [`סימן ${hebrewNumber(Number(m[1]))}`] : undefined,
        label: 'ערוך השולחן' };
    }
    if (halachaSchedule === 'rambam_halacha') {
      return targetForTrack('rambam', date);
    }
    // Halacha Yomit opens Shulchan Aruch at the specific Siman
    const text = halachaYomitSiman(date);
    return {
      titles: ['שולחן ערוך', 'שולחן ערוך אורח חיים', 'שולחן ערוך - אורח חיים', 'שולחן ערוך או"ח', 'משנה ברורה'],
      tocTitles: text ? [`סימן ${hebrewNumber(text)}`] : undefined,
      label: text ? `שולחן ערוך סימן ${hebrewNumber(text)}` : 'שולחן ערוך',
    };
  }

  if (key === 'parasha') {
    const p = parashaFor(date);
    if (!p) return null;
    const hd = new HDate(date);
    const sedra = new Sedra(hd.getFullYear(), true).lookup(hd);
    const number = Array.isArray(sedra.num) ? sedra.num[0] : sedra.num;
    const start = PARASHA_STARTS[number - 1];
    if (!start) return null;
    return {
      titles: [start[0], `חומש ${start[0]}`, `ספר ${start[0]}`, 'חומשה', 'תורה'],
      tocTitles: [`פרק ${hebrewNumber(start[1])}`],
      chapter: start[1],
      verse: start[2],
      kind: 'parasha',
      label: p,
    };
  }

  return null;
}

/** First siman number of today's Dirshu Mishnah Berurah portion ("345:1-3" → 345). */
function halachaYomitSiman(date: Date): number | null {
  const m = halachaYomitFor(date).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface ResolvedTarget {
  book: BookItem;
  line: number;
  label: string;
}

const tocCache = new Map<string, TocEntry[]>();

/** Resolves a track to an actual book + line, loading the TOC when needed. */
export async function resolveTarget(target: StudyTarget, books: BookItem[]): Promise<ResolvedTarget | null> {
  let book: BookItem | undefined;
  if (target.kind === 'bavli') {
    const he = target.titles[2];
    book = books.find((b) => b.title === he && /תלמוד|גמרא|בבלי/u.test(`${b.categoryPath} ${b.heCategories || ''}`))
      || books.find((b) => b.title === `תלמוד בבלי ${he}`)
      || books.find((b) => b.title === he)
      || findBook(books, target.titles);
  } else if (target.kind === 'mishnah') {
    const he = target.titles[2];
    book = books.find((b) => b.title === `משנה ${he}`)
      || books.find((b) => b.title === he && /משנה/u.test(`${b.categoryPath} ${b.heCategories || ''}`))
      || findBook(books, target.titles);
  } else if (target.kind === 'rambam') {
    const halachot = normalize(target.titles[1]);
    book = books.find((b) => target.titles.some((title) => normalize(b.title) === normalize(title)) && /רמבם|משנה תורה/u.test(normalize(`${b.categoryPath} ${b.title}`)))
      || books.find((b) => normalize(b.title).includes(halachot) && /רמבם|משנה תורה/u.test(normalize(`${b.categoryPath} ${b.title}`)))
      || findBook(books, target.titles);
  } else {
    book = findBook(books, target.titles);
  }
  if (!book) return null;
  if (!target.tocTitles?.length && target.kind !== 'chofetz') return { book, line: 1, label: target.label };

  const key = String(book.id);
  let toc = tocCache.get(key);
  if (!toc) {
    try {
      toc = await api.toc(book.id as ID);
      tocCache.set(key, toc);
    } catch {
      return null;
    }
  }

  if (target.kind === 'chofetz') {
    const sectionName = target.section === 'HilchosLH' ? 'חלק ראשון' : target.section === 'HilchosRechilus' ? 'חלק שני' : '';
    const sectionIndex = sectionName ? toc.findIndex((e) => e.title.includes(sectionName)) : -1;
    const nextSection = sectionIndex >= 0 ? toc.findIndex((e, i) => i > sectionIndex && e.level === 1) : -1;
    const end = nextSection >= 0 ? nextSection : toc.length;

    if (target.rule && sectionIndex >= 0) {
      const ruleTitle = `כלל ${hebrewNumber(target.rule)}`;
      const ruleIndex = toc.findIndex((e, i) => i > sectionIndex && i < end && e.title === ruleTitle && e.level === 2);
      if (ruleIndex >= 0) {
        const following = toc.findIndex((e, i) => i > ruleIndex && (e.level ?? 1) <= 2);
        const ruleEnd = following < 0 ? end : Math.min(following, end);
        const paraTitle = `סעיף ${hebrewNumber(target.paragraph || 1)}`;
        const para = toc.find((e, i) => i > ruleIndex && i < ruleEnd && e.title === paraTitle);
        return { book, line: para?.index ?? toc[ruleIndex].index, label: target.label };
      }
    }

    const sectionTitle: Record<string, string> = { Hakdamah: 'הקדמה', Psichah: 'פתיחה להלכות לשון הרע ורכילות', Lavin: 'לאוין', Asin: 'עשיין', Arurin: 'ארורין' };
    const title = sectionTitle[target.section || ''];
    const entry = title && toc.find((e) => e.title === title);
    if (!entry) return null;

    // Every paragraph of the introduction / לאוין / עשיין is its own line, and the server tags it
    // with a reference like "חפץ חיים, פתיחה להלכות לשון הרע ורכילות, לאוין, ג".
    // Match on that reference – the "(א)", "(ב)" markers inside the text are באר מים חיים footnotes,
    // not paragraph numbers, which is why searching the text landed in the wrong place.
    let line = entry.index;
    if (target.section === 'Arurin') {
      try {
        const entryPos = toc.indexOf(entry);
        const next = toc.find((e, i) => i > entryPos && (e.level ?? 1) <= (entry.level ?? 1));
        const content = await api.content(book.id, entry.index, next ? next.index - 1 : entry.index + 30);
        const first = content.lines.find((row) => row.heRef && normalize(row.heRef).includes('ארורין'));
        if (first) line = first.lineIndex;
      } catch { /* keep the section heading */ }
    }
    if (target.paragraph && target.section !== 'Arurin') {
      try {
        const entryPos = toc.indexOf(entry);
        const entryLevel = entry.level ?? 1;
        const next = toc.find((e, i) => i > entryPos && (e.level ?? 1) <= entryLevel);
        const end = next ? next.index - 1 : entry.index + 200;
        const content = await api.content(book.id, entry.index, end);
        const letter = hebrewNumber(target.paragraph);
        const sectionWord: Record<string, string> = { Hakdamah: 'הקדמה', Psichah: 'הקדמה', Lavin: 'לאוין', Asin: 'עשיין' };
        const word = sectionWord[target.section || ''];
        const exact = content.lines.find((row) => {
          if (!row.heRef) return false;
          const parts = normalize(row.heRef).split(',').map((s) => s.trim());
          const last = parts[parts.length - 1];
          const inSection = !word || parts.includes(word);
          const inPsichah = target.section !== 'Psichah' || parts.some((p) => p.startsWith('פתיחה'));
          const notPsichah = target.section !== 'Hakdamah' || !parts.some((p) => p.startsWith('פתיחה'));
          return last === letter && inSection && inPsichah && notPsichah;
        });
        if (exact) line = exact.lineIndex;
      } catch { /* fall back to the section heading */ }
    }
    return { book, line, label: target.label };
  }

  const line = findTocLine(toc, target.tocTitles || []);
  if (!line) return null;

  if (target.kind === 'parasha' && target.verse && target.verse > 1) {
    const next = toc.find((e) => e.index > line && e.title.startsWith('פרק '));
    const chapter = hebrewNumber(target.chapter || 1);
    const verse = hebrewNumber(target.verse);
    try {
      const content = await api.content(book.id, line, next ? Math.min(next.index - 1, line + 150) : line + 150);
      const exact = content.lines.find((row) => row.heRef && row.heRef.includes(`, ${chapter}, ${verse}`));
      if (exact) return { book, line: exact.lineIndex, label: target.label };
    } catch { /* fallback to chapter start */ }
  }

  return { book, line, label: target.label };
}
