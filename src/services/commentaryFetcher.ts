import { BookItem } from '../data/otzariaLibraryData.js';
import { hebrewToNumber, stripNikud } from '../utils/gematria.js';
import { sortCommentariesByGeneration, CommentaryEra, getCommentatorEra } from '../utils/generationOrder.js';
import { sysLogger } from './logger.js';

export { sortCommentariesByGeneration, CommentaryEra, getCommentatorEra };

export interface CommentaryResult {
  sourceBook: string;
  category: string;
  line: number;
  text: string;
  dibburHamatchil?: string;
  isLineMatch?: boolean;
}

function extractSegmentsFromText(rawTextOrArray: any): Array<{ text: string; dh: string }> {
  const list: string[] = [];

  function flatten(item: any) {
    if (Array.isArray(item)) {
      item.forEach(flatten);
    } else if (typeof item === 'string' && item.trim().length > 3) {
      const parts = item.split(/<br\s*\/?>\s*<br\s*\/?>|\n\n+/);
      parts.forEach(p => {
        if (p.trim().length > 3) list.push(p.trim());
      });
    }
  }

  flatten(rawTextOrArray);

  return list.map(raw => {
    let dh = '';
    const cleanRaw = raw.trim();
    const boldMatch = cleanRaw.match(/<b>(.*?)<\/b>/i);
    if (boldMatch) {
      dh = boldMatch[1].replace(/[.,:;–-]/g, '').trim();
    } else {
      const dashMatch = cleanRaw.match(/^(.*?)(?:–|-|:|\.)/);
      if (dashMatch && dashMatch[1].length < 80) {
        dh = dashMatch[1].trim();
      }
    }
    return { text: cleanRaw, dh };
  });
}

// Complete 37 Tractates of Talmud Bavli with canonical Sefaria slugs
const TALMUD_BAVLI_SLUGS: Record<string, string> = {
  'ברכות': 'Berakhot',
  'שבת': 'Shabbat',
  'עירובין': 'Eruvin',
  'פסחים': 'Pesachim',
  'שקלים': 'Shekalim',
  'יומא': 'Yoma',
  'סוכה': 'Sukkah',
  'ביצה': 'Beitzah',
  'ראש השנה': 'Rosh_Hashanah',
  'תענית': 'Taanit',
  'מגילה': 'Megillah',
  'מועד קטן': 'Moed_Katan',
  'חגיגה': 'Chagigah',
  'יבמות': 'Yevamot',
  'כתובות': 'Ketubot',
  'נדרים': 'Nedarim',
  'נזיר': 'Nazir',
  'סוטה': 'Sotah',
  'גיטין': 'Gittin',
  'קידושין': 'Kiddushin',
  'בבא קמא': 'Bava_Kamma',
  'בבא מציעא': 'Bava_Metzia',
  'בבא בתרא': 'Bava_Batra',
  'סנהדרין': 'Sanhedrin',
  'מכות': 'Makkot',
  'שבועות': 'Shevuot',
  'עבודה זרה': 'Avodah_Zarah',
  'הוריות': 'Horayot',
  'זבחים': 'Zevachim',
  'מנחות': 'Menachot',
  'חולין': 'Chullin',
  'בכורות': 'Bekhorot',
  'ערכין': 'Arakhin',
  'תמורה': 'Temurah',
  'כריתות': 'Keritot',
  'מעילה': 'Meilah',
  'קנים': 'Kinnim',
  'תמיד': 'Tamid',
  'מידות': 'Middot',
  'מדות': 'Middot',
  'נדה': 'Niddah',
  'נידה': 'Niddah'
};

// Complete Tanakh Books with canonical Sefaria slugs
const TANAKH_SLUGS: Record<string, string> = {
  'בראשית': 'Genesis',
  'שמות': 'Exodus',
  'ויקרא': 'Leviticus',
  'במדבר': 'Numbers',
  'דברים': 'Deuteronomy',
  'יהושע': 'Joshua',
  'שופטים': 'Judges',
  'שמואל א': 'I_Samuel',
  'שמואל ב': 'II_Samuel',
  'מלכים א': 'I_Kings',
  'מלכים ב': 'II_Kings',
  'ישעיהו': 'Isaiah',
  'ירמיהו': 'Jeremiah',
  'יחזקאל': 'Ezekiel',
  'הושע': 'Hosea',
  'יואל': 'Joel',
  'עמוס': 'Amos',
  'עובדיה': 'Obadiah',
  'יונה': 'Jonah',
  'מיכה': 'Micah',
  'נחום': 'Nahum',
  'חבקוק': 'Habakkuk',
  'צפניה': 'Zephaniah',
  'חגי': 'Haggai',
  'זכריה': 'Zechariah',
  'מלאכי': 'Malachi',
  'תרי עשר': 'Hosea',
  'תהילים': 'Psalms',
  'משלי': 'Proverbs',
  'איוב': 'Job',
  'שיר השירים': 'Song_of_Songs',
  'רות': 'Ruth',
  'איכה': 'Lamentations',
  'קהלת': 'Ecclesiastes',
  'אסתר': 'Esther',
  'דניאל': 'Daniel',
  'עזרא': 'Ezra',
  'נחמיה': 'Nehemiah',
  'עזרא ונחמיה': 'Ezra',
  'דברי הימים א': 'I_Chronicles',
  'דברי הימים ב': 'II_Chronicles'
};

// Complete Mishnah Tractates
const MISHNAH_SLUGS: Record<string, string> = {
  'ברכות': 'Berakhot',
  'פאה': 'Peah',
  'דמאי': 'Demai',
  'כלאים': 'Kilayim',
  'שביעית': 'Sheviit',
  'תרומות': 'Terumot',
  'מעשרות': 'Maasrot',
  'מעשר שני': 'Maaser_Sheni',
  'חלה': 'Challah',
  'ערלה': 'Orlah',
  'ביכורים': 'Bikkurim',
  'שבת': 'Shabbat',
  'עירובין': 'Eruvin',
  'פסחים': 'Pesachim',
  'שקלים': 'Shekalim',
  'יומא': 'Yoma',
  'סוכה': 'Sukkah',
  'ביצה': 'Beitzah',
  'ראש השנה': 'Rosh_Hashanah',
  'תענית': 'Taanit',
  'מגילה': 'Megillah',
  'מועד קטן': 'Moed_Katan',
  'חגיגה': 'Chagigah',
  'יבמות': 'Yevamot',
  'כתובות': 'Ketubot',
  'נדרים': 'Nedarim',
  'נזיר': 'Nazir',
  'סוטה': 'Sotah',
  'גיטין': 'Gittin',
  'קידושין': 'Kiddushin',
  'בבא קמא': 'Bava_Kamma',
  'בבא מציעא': 'Bava_Metzia',
  'בבא בתרא': 'Bava_Batra',
  'סנהדרין': 'Sanhedrin',
  'מכות': 'Makkot',
  'שבועות': 'Shevuot',
  'עדויות': 'Eduyot',
  'עבודה זרה': 'Avodah_Zarah',
  'אבות': 'Pirkei_Avot',
  'פרקי אבות': 'Pirkei_Avot',
  'הוריות': 'Horayot',
  'זבחים': 'Zevachim',
  'מנחות': 'Menachot',
  'חולין': 'Chullin',
  'בכורות': 'Bekhorot',
  'ערכין': 'Arakhin',
  'תמורה': 'Temurah',
  'כריתות': 'Keritot',
  'מעילה': 'Meilah',
  'תמיד': 'Tamid',
  'מידות': 'Middot',
  'קינים': 'Kinnim',
  'כלים': 'Kelim',
  'אהלות': 'Oholot',
  'נגעים': 'Negaim',
  'פרה': 'Parah',
  'טהרות': 'Toharot',
  'מקוואות': 'Mikvaot',
  'נדה': 'Niddah',
  'מכשירין': 'Makhshirin',
  'זבים': 'Zavim',
  'טבול יום': 'Tevul_Yom',
  'ידיים': 'Yadayim',
  'עוקצין': 'Uktzin'
};

// Complete Tractates of Talmud Yerushalmi with canonical Sefaria slugs
const YERUSHALMI_SLUGS: Record<string, string> = {
  'ברכות': 'Jerusalem_Talmud_Berakhot',
  'פאה': 'Jerusalem_Talmud_Peah',
  'דמאי': 'Jerusalem_Talmud_Demai',
  'כלאים': 'Jerusalem_Talmud_Kilayim',
  'שביעית': 'Jerusalem_Talmud_Sheviit',
  'תרומות': 'Jerusalem_Talmud_Terumot',
  'מעשרות': 'Jerusalem_Talmud_Maasrot',
  'מעשר שני': 'Jerusalem_Talmud_Maaser_Sheni',
  'חלה': 'Jerusalem_Talmud_Challah',
  'ערלה': 'Jerusalem_Talmud_Orlah',
  'ביכורים': 'Jerusalem_Talmud_Bikkurim',
  'שבת': 'Jerusalem_Talmud_Shabbat',
  'עירובין': 'Jerusalem_Talmud_Eruvin',
  'פסחים': 'Jerusalem_Talmud_Pesachim',
  'שקלים': 'Jerusalem_Talmud_Shekalim',
  'יומא': 'Jerusalem_Talmud_Yoma',
  'סוכה': 'Jerusalem_Talmud_Sukkah',
  'ביצה': 'Jerusalem_Talmud_Beitzah',
  'ראש השנה': 'Jerusalem_Talmud_Rosh_Hashanah',
  'תענית': 'Jerusalem_Talmud_Taanit',
  'מגילה': 'Jerusalem_Talmud_Megillah',
  'מועד קטן': 'Jerusalem_Talmud_Moed_Katan',
  'חגיגה': 'Jerusalem_Talmud_Chagigah',
  'יבמות': 'Jerusalem_Talmud_Yevamot',
  'כתובות': 'Jerusalem_Talmud_Ketubot',
  'נדרים': 'Jerusalem_Talmud_Nedarim',
  'נזיר': 'Jerusalem_Talmud_Nazir',
  'סוטה': 'Jerusalem_Talmud_Sotah',
  'גיטין': 'Jerusalem_Talmud_Gittin',
  'קידושין': 'Jerusalem_Talmud_Kiddushin',
  'בבא קמא': 'Jerusalem_Talmud_Bava_Kamma',
  'בבא מציעא': 'Jerusalem_Talmud_Bava_Metzia',
  'בבא בתרא': 'Jerusalem_Talmud_Bava_Batra',
  'סנהדרין': 'Jerusalem_Talmud_Sanhedrin',
  'מכות': 'Jerusalem_Talmud_Makkot',
  'שבועות': 'Jerusalem_Talmud_Shevuot',
  'עבודה זרה': 'Jerusalem_Talmud_Avodah_Zarah',
  'הוריות': 'Jerusalem_Talmud_Horayot',
  'נדה': 'Jerusalem_Talmud_Niddah'
};

export interface FetchCommentariesResponse {
  links: CommentaryResult[];
  allLinks?: CommentaryResult[];
  availableCommentators?: string[];
  chapter: number;
  verse: number;
  dafLabel?: string;
}

// Commentary Cache (key: bookId_lineIndex)
const commentaryCache = new Map<string, FetchCommentariesResponse>();

/**
 * Extracts Daf, Amud, and precise segment index within the Daf for the target line.
 */
export function parseTalmudDafAndAmud(
  content: string,
  targetLineIndex: number
): { dafNum: number; amud: 'a' | 'b'; dafLabel: string; segmentIndex: number; isHeader: boolean } {
  if (!content) return { dafNum: 2, amud: 'a', dafLabel: 'דף ב ע"א', segmentIndex: 1, isHeader: false };

  const lines = content.split('\n');
  let currentDaf = 2;
  let currentAmud: 'a' | 'b' = 'a';
  let segmentInDaf = 0;
  let targetSegment = 0;
  let isTargetHeader = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (!rawLine) continue;
    const lineNum = idx + 1;

    // Pattern 1: <h2>דף ב.</h2> or דף ב:
    const dotColonMatch = rawLine.match(/דף\s+([א-ת]+)([\.:])/i);
    if (dotColonMatch) {
      const num = hebrewToNumber(dotColonMatch[1]);
      if (num > 0) {
        currentDaf = num;
        currentAmud = dotColonMatch[2] === ':' ? 'b' : 'a';
        segmentInDaf = 0;
      }
      if (lineNum === targetLineIndex) {
        isTargetHeader = true;
      }
    } else {
      // Pattern 2: דף ב ע"א / דף ב עמוד ב / דף ב,א
      const amudWordMatch = rawLine.match(/דף\s+([א-ת]+)\s*(?:ע["״']?([אב])|עמוד\s*([אב]|ראשון|שני)|[,/]\s*([אב]))/i);
      if (amudWordMatch) {
        const num = hebrewToNumber(amudWordMatch[1]);
        if (num > 0) {
          currentDaf = num;
          const amudLetter = amudWordMatch[2] || amudWordMatch[3] || amudWordMatch[4] || 'א';
          currentAmud = (amudLetter === 'ב' || amudLetter === 'שני') ? 'b' : 'a';
          segmentInDaf = 0;
        }
        if (lineNum === targetLineIndex) {
          isTargetHeader = true;
        }
      } else if (rawLine.startsWith('<h1>') || rawLine.startsWith('<h2>') || rawLine.startsWith('<h3>')) {
        if (lineNum === targetLineIndex) {
          isTargetHeader = true;
        }
      } else {
        segmentInDaf++;
        if (lineNum === targetLineIndex) {
          targetSegment = segmentInDaf;
        }
      }
    }

    if (lineNum >= targetLineIndex) {
      break;
    }
  }

  const dafHebrew = numberToHebrew(currentDaf);
  const dafLabel = `דף ${dafHebrew} ע"${currentAmud === 'a' ? 'א' : 'ב'}`;
  return { dafNum: currentDaf, amud: currentAmud, dafLabel, segmentIndex: targetSegment, isHeader: isTargetHeader };
}

/**
 * Parses Perek, Halakha and segment within Halakha for Talmud Yerushalmi
 */
export function parseYerushalmiLocation(
  content: string,
  targetLineIndex: number
): { perek: number; halakha: number; segmentIndex: number; locationLabel: string; isHeader: boolean } {
  if (!content) return { perek: 1, halakha: 1, segmentIndex: 1, locationLabel: 'פרק א הלכה א', isHeader: false };

  const lines = content.split('\n');
  let currentPerek = 1;
  let currentHalakha = 1;
  let segmentInHalakha = 0;
  let targetSegment = 0;
  let isTargetHeader = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (!rawLine) continue;
    const lineNum = idx + 1;

    // Perek heading e.g. <h2>פרק א</h2> or @פרק א or פרק א
    const perekMatch = rawLine.match(/(?:פרק)\s+([א-ת]+)/i);
    if (perekMatch && (rawLine.includes('<h') || rawLine.startsWith('@') || rawLine.length < 30)) {
      const num = hebrewToNumber(perekMatch[1]);
      if (num > 0) {
        currentPerek = num;
        currentHalakha = 1;
        segmentInHalakha = 0;
      }
      if (lineNum === targetLineIndex) {
        isTargetHeader = true;
      }
    } else {
      // Halakha heading e.g. <h3>הלכה א</h3> or @הלכה א or הלכה א
      const halakhaMatch = rawLine.match(/(?:הלכה)\s+([א-ת]+)/i);
      if (halakhaMatch && (rawLine.includes('<h') || rawLine.startsWith('@') || rawLine.length < 30)) {
        const num = hebrewToNumber(halakhaMatch[1]);
        if (num > 0) {
          currentHalakha = num;
          segmentInHalakha = 0;
        }
        if (lineNum === targetLineIndex) {
          isTargetHeader = true;
        }
      } else if (rawLine.startsWith('<h1>') || rawLine.startsWith('<h2>') || rawLine.startsWith('<h3>')) {
        if (lineNum === targetLineIndex) {
          isTargetHeader = true;
        }
      } else {
        // Segment within Halakha: check for (א), (ב), (ג) etc.
        const letterMatch = rawLine.match(/^\(([א-ת]+)\)/);
        if (letterMatch) {
          const segNum = hebrewToNumber(letterMatch[1]);
          if (segNum > 0) {
            segmentInHalakha = segNum;
          } else {
            segmentInHalakha++;
          }
        } else {
          segmentInHalakha++;
        }

        if (lineNum === targetLineIndex) {
          targetSegment = Math.max(1, segmentInHalakha);
        }
      }
    }

    if (lineNum >= targetLineIndex) {
      break;
    }
  }

  const perekHeb = numberToHebrew(currentPerek);
  const halakhaHeb = numberToHebrew(currentHalakha);
  const locationLabel = `פרק ${perekHeb} הלכה ${halakhaHeb}`;
  return {
    perek: currentPerek,
    halakha: currentHalakha,
    segmentIndex: targetSegment || 1,
    locationLabel,
    isHeader: isTargetHeader
  };
}

function numberToHebrew(n: number): string {
  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

  if (n === 15) return 'טו';
  if (n === 16) return 'טז';

  let result = '';
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const t = Math.floor(rem / 10);
  const u = rem % 10;

  if (h > 0) result += hundreds[h] || '';
  if (rem === 15) return result + 'טו';
  if (rem === 16) return result + 'טז';
  if (t > 0) result += tens[t] || '';
  if (u > 0) result += units[u] || '';

  return result || String(n);
}

/**
 * Parses chapter and verse for Tanakh / Mishnah / Halakha
 */
export function parseChapterAndVerse(content: string, targetLineIndex: number): { chapter: number; verse: number } {
  if (!content) return { chapter: 1, verse: Math.max(1, targetLineIndex) };

  const lines = content.split('\n');
  let currentChapter = 1;
  let currentVerse = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (!rawLine) continue;
    const lineNum = idx + 1;

    // Chapter heading e.g. <h2>פרק א</h2> or @פרק א or סימן א
    const chapMatch = rawLine.match(/(?:פרק|סימן)\s+([א-ת]+)/i);
    if (chapMatch && (rawLine.includes('<h') || rawLine.startsWith('@') || rawLine.length < 30)) {
      const num = hebrewToNumber(chapMatch[1]);
      if (num > 0) {
        currentChapter = num;
        currentVerse = 0;
      }
    }

    // Verse/Seif e.g. (א), א., סעיף א
    const verseMatch = rawLine.match(/^\(([א-ת]+)\)|^\b([א-ת]+)\.|\bסעיף\s+([א-ת]+)/i);
    if (verseMatch) {
      const letter = verseMatch[1] || verseMatch[2] || verseMatch[3];
      const num = hebrewToNumber(letter);
      if (num > 0) {
        currentVerse = num;
      } else {
        currentVerse++;
      }
    } else if (!rawLine.startsWith('<h') && !rawLine.startsWith('@')) {
      currentVerse++;
    }

    if (lineNum === targetLineIndex) {
      return { chapter: currentChapter, verse: Math.max(1, currentVerse) };
    }
  }

  return { chapter: currentChapter, verse: Math.max(1, currentVerse) };
}

/**
 * Fetch authentic commentators from Sefaria and authentic datasets for any book and line
 */
export async function fetchCommentariesForBookLine(
  book: BookItem,
  lineIndex: number,
  bookContent?: string
): Promise<FetchCommentariesResponse> {
  const cacheKey = `${book.id}_${lineIndex}`;
  if (commentaryCache.has(cacheKey)) {
    return commentaryCache.get(cacheKey)!;
  }

  const cleanBookTitle = book.title
    .replace(/^תלמוד בבלי\s+/, '')
    .replace(/^תלמוד ירושלמי\s+/, '')
    .replace(/^משנה\s+/, '')
    .replace(/^מסכת\s+/, '')
    .replace(/^ספר\s+/, '')
    .trim();

  const isYerushalmi =
    book.categoryPath.includes('תלמוד ירושלמי') ||
    book.title.includes('תלמוד ירושלמי') ||
    book.title.includes('ירושלמי');

  const isTalmud =
    !isYerushalmi &&
    (book.categoryPath.includes('תלמוד בבלי') ||
      book.title.includes('תלמוד בבלי') ||
      TALMUD_BAVLI_SLUGS[cleanBookTitle] !== undefined);
  const isMishnah = !isTalmud && !isYerushalmi && (book.categoryPath.includes('משנה') || book.title.startsWith('משנה '));
  const isTanakh = !isTalmud && !isYerushalmi && !isMishnah && (book.categoryPath.includes('תנ"ך') || TANAKH_SLUGS[cleanBookTitle] !== undefined);
  const isShulchanArukh = !isYerushalmi && (book.title.includes('שולחן ערוך') || book.title.includes('משנה ברורה'));

  const results: CommentaryResult[] = [];
  let detectedChapter = 1;
  let detectedVerse = 1;
  let detectedDafLabel: string | undefined = undefined;

  const targetLineRaw = bookContent ? (bookContent.split('\n')[lineIndex - 1]?.trim() || '') : '';
  const cleanTargetLine = stripNikud(targetLineRaw)
    .replace(/[״"״׳',.:;?!()\-_–]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ================= 1. TALMUD YERUSHALMI (פני משה, קרבן העדה, מראה הפנים, שיירי קרבן) =================
  if (isYerushalmi) {
    const slug = YERUSHALMI_SLUGS[cleanBookTitle] || 'Jerusalem_Talmud_Berakhot';
    const parsed = parseYerushalmiLocation(bookContent || '', lineIndex);
    detectedDafLabel = parsed.locationLabel;
    detectedChapter = parsed.perek;
    detectedVerse = parsed.halakha;

    if (parsed.isHeader) {
      const emptyResp = {
        links: [],
        allLinks: [],
        availableCommentators: getAvailableCommentatorsForBook(book),
        chapter: detectedChapter,
        verse: detectedVerse,
        dafLabel: detectedDafLabel
      };
      commentaryCache.set(cacheKey, emptyResp);
      return emptyResp;
    }

    // 1. Direct segment-level link query (e.g. Jerusalem_Talmud_Berakhot.1.1.1)
    if (parsed.segmentIndex > 0) {
      try {
        const segRef = `${slug}.${parsed.perek}.${parsed.halakha}.${parsed.segmentIndex}`;
        const res = await fetch(`https://www.sefaria.org/api/links/${segRef}?with_text=1`, {
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          const commLinks = data.filter((d: any) => (d.category === 'Commentary' || d.type === 'commentary') && d.he);

          commLinks.forEach((c: any) => {
            const cat = (typeof c.collectiveTitle === 'object' ? c.collectiveTitle?.he : c.collectiveTitle) || c.heTitle || 'מפרש';
            const rawHe = Array.isArray(c.he) ? c.he.join('<br/><br/>') : String(c.he || '');
            if (rawHe.trim().length > 3) {
              let dh = '';
              const boldMatch = rawHe.match(/<b>(.*?)<\/b>/i);
              if (boldMatch) {
                dh = boldMatch[1].replace(/[.,:;–-]/g, '').trim();
              } else {
                const dashMatch = rawHe.match(/^(.*?)(?:–|-|:|\.)/);
                if (dashMatch && dashMatch[1].length < 80) {
                  dh = dashMatch[1].trim();
                }
              }

              results.push({
                sourceBook: `${cat} על ${book.title} (${parsed.locationLabel})`,
                category: cat,
                line: lineIndex,
                text: rawHe,
                dibburHamatchil: dh,
                isLineMatch: true
              });
            }
          });
        }
      } catch {}
    }

    // 2. Fallback if direct fetch had no items
    if (results.length === 0) {
      const yerushalmiComms = [
        { name: 'פני משה', cat: 'פני משה', slug: `Penei_Moshe_on_${slug}.${parsed.perek}.${parsed.halakha}` },
        { name: 'קרבן העדה', cat: 'קרבן העדה', slug: `Korban_HaEda_on_${slug}.${parsed.perek}.${parsed.halakha}` },
        { name: 'מראה הפנים', cat: 'מראה הפנים', slug: `Mareh_HaPanim_on_${slug}.${parsed.perek}.${parsed.halakha}` },
        { name: 'שיירי קרבן', cat: 'שיירי קרבן', slug: `Shirei_Korban_on_${slug}.${parsed.perek}.${parsed.halakha}` }
      ];

      await Promise.all(
        yerushalmiComms.map(async (c) => {
          try {
            const res = await fetch(`https://www.sefaria.org/api/v3/texts/${c.slug}?version=hebrew`, {
              signal: AbortSignal.timeout(3500)
            });
            if (res.ok) {
              const data = await res.json();
              const rawText = data.versions?.[0]?.text;
              if (rawText) {
                const segments = extractSegmentsFromText(rawText);
                segments.forEach(seg => {
                  results.push({
                    sourceBook: `${c.name} על ${book.title} (${parsed.locationLabel})`,
                    category: c.cat,
                    line: lineIndex,
                    text: seg.text,
                    dibburHamatchil: seg.dh,
                    isLineMatch: true
                  });
                });
              }
            }
          } catch {}
        })
      );
    }
  }

  // ================= 2. TALMUD BAVLI (רש"י, תוספות, מהרש"א, רשב"א וכו') =================
  else if (isTalmud) {
    const slug = TALMUD_BAVLI_SLUGS[cleanBookTitle] || 'Berakhot';
    const parsedDaf = parseTalmudDafAndAmud(bookContent || '', lineIndex);
    const dafRef = `${slug}.${parsedDaf.dafNum}${parsedDaf.amud}`;
    detectedDafLabel = parsedDaf.dafLabel;
    detectedChapter = parsedDaf.dafNum;
    detectedVerse = parsedDaf.amud === 'a' ? 1 : 2;

    if (parsedDaf.isHeader) {
      const emptyResp = { links: [], allLinks: [], chapter: detectedChapter, verse: detectedVerse, dafLabel: detectedDafLabel };
      commentaryCache.set(cacheKey, emptyResp);
      return emptyResp;
    }

    // Direct segment-level link query (e.g. Berakhot.2a.1, Berakhot.2a.7)
    if (parsedDaf.segmentIndex > 0) {
      try {
        const segRef = `${dafRef}.${parsedDaf.segmentIndex}`;
        const res = await fetch(`https://www.sefaria.org/api/links/${segRef}?with_text=1`, {
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          const commLinks = data.filter((d: any) => (d.category === 'Commentary' || d.type === 'commentary') && d.he);
          
          commLinks.forEach((c: any) => {
            const cat = (typeof c.collectiveTitle === 'object' ? c.collectiveTitle?.he : c.collectiveTitle) || c.heTitle || 'מפרש';
            const rawHe = Array.isArray(c.he) ? c.he.join('<br/><br/>') : String(c.he || '');
            if (rawHe.trim().length > 3) {
              let dh = '';
              const boldMatch = rawHe.match(/<b>(.*?)<\/b>/i);
              if (boldMatch) {
                dh = boldMatch[1].replace(/[.,:;–-]/g, '').trim();
              } else {
                const dashMatch = rawHe.match(/^(.*?)(?:–|-|:|\.)/);
                if (dashMatch && dashMatch[1].length < 80) {
                  dh = dashMatch[1].trim();
                }
              }

              results.push({
                sourceBook: `${cat} על ${cleanBookTitle} (${parsedDaf.dafLabel})`,
                category: cat,
                line: lineIndex,
                text: rawHe,
                dibburHamatchil: dh,
                isLineMatch: true
              });
            }
          });
        }
      } catch {}
    }

    // Fallback or daf-level background fetch if direct segment fetch was empty
    if (results.length === 0) {
      const talmudCommList = [
        { name: `רש"י`, cat: 'רש"י', slug: `Rashi_on_${dafRef}` },
        { name: `תוספות`, cat: 'תוספות', slug: `Tosafot_on_${dafRef}` },
        { name: `חידושי הלכות מהרש"א`, cat: 'מהרש"א', slug: `Chiddushei_Halachot_on_${dafRef}` },
        { name: `חידושי אגדות מהרש"א`, cat: 'מהרש"א', slug: `Chiddushei_Agadot_on_${dafRef}` },
        { name: `חידושי הרשב"א`, cat: 'רשב"א', slug: `Rashba_on_${dafRef}` },
        { name: `חידושי הריטב"א`, cat: 'ריטב"א', slug: `Ritva_on_${dafRef}` },
        { name: `חידושי הר"ן`, cat: 'ר"ן', slug: `Ran_on_${dafRef}` }
      ];

      await Promise.all(
        talmudCommList.map(async (c) => {
          try {
            const res = await fetch(`https://www.sefaria.org/api/v3/texts/${c.slug}?version=hebrew`, {
              signal: AbortSignal.timeout(3500)
            });
            if (res.ok) {
              const data = await res.json();
              const rawText = data.versions?.[0]?.text;
              if (rawText) {
                const segments = extractSegmentsFromText(rawText);
                segments.forEach(seg => {
                  const cleanDh = stripNikud(seg.dh)
                    .replace(/[״"״׳',.:;?!()\-–]/g, ' ')
                    .replace(/<[^>]+>/g, ' ')
                    .trim();

                  const cleanWord = (w: string) => w.replace(/^[וככלבמשד]+/, '');
                  const lineRoots = cleanTargetLine.split(/\s+/).map(cleanWord).filter(w => w.length > 1);
                  const dhRoots = cleanDh
                    .split(/\s+/)
                    .filter(w => w.length > 1 && !['וכו', 'וכולי', 'פי', 'פירוש', 'שנאמר', 'דאמר', 'גמ'].includes(w))
                    .map(cleanWord)
                    .filter(w => w.length > 1);

                  const directWords = cleanDh
                    .split(/\s+/)
                    .filter(w => w.length > 1 && !['וכו', 'וכולי', 'פי', 'פירוש', 'שנאמר', 'דאמר', 'גמ'].includes(w));

                  const isDirectMatch = Boolean(
                    cleanTargetLine &&
                    directWords.length > 0 &&
                    directWords.every(w => cleanTargetLine.includes(w))
                  );

                  const isRootMatch = Boolean(
                    lineRoots.length > 0 &&
                    dhRoots.length > 0 &&
                    dhRoots.filter(w => lineRoots.includes(w)).length >= Math.min(2, dhRoots.length)
                  );

                  const isMatch = isDirectMatch || isRootMatch;

                  if (isMatch) {
                    results.push({
                      sourceBook: `${c.name} על ${cleanBookTitle} (${parsedDaf.dafLabel})`,
                      category: c.cat,
                      line: lineIndex,
                      text: seg.text,
                      dibburHamatchil: seg.dh,
                      isLineMatch: true
                    });
                  }
                });
              }
            }
          } catch {}
        })
      );
    }
  }

  // ================= 2. TANAKH (רש"י, רמב"ן, אבן עזרא, ספורנו, אור החיים, מצודות, רד"ק, מלבי"ם) =================
  else if (isTanakh) {
    const slug = TANAKH_SLUGS[cleanBookTitle] || 'Genesis';
    const parsed = parseChapterAndVerse(bookContent || '', lineIndex);
    detectedChapter = parsed.chapter;
    detectedVerse = parsed.verse;
    const ref = `${slug}.${detectedChapter}.${detectedVerse}`;

    try {
      const res = await fetch(`https://www.sefaria.org/api/links/${ref}?with_text=1`, {
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        const commLinks = data.filter((d: any) => (d.category === 'Commentary' || d.type === 'commentary') && d.he);

        commLinks.forEach((c: any) => {
          const cat = (typeof c.collectiveTitle === 'object' ? c.collectiveTitle?.he : c.collectiveTitle) || c.heTitle || 'מפרש';
          const rawHe = Array.isArray(c.he) ? c.he.join('<br/><br/>') : String(c.he || '');
          if (rawHe.trim().length > 3) {
            let dh = '';
            const boldMatch = rawHe.match(/<b>(.*?)<\/b>/i);
            if (boldMatch) {
              dh = boldMatch[1].replace(/[.,:;–-]/g, '').trim();
            } else {
              const dashMatch = rawHe.match(/^(.*?)(?:–|-|:|\.)/);
              if (dashMatch && dashMatch[1].length < 80) {
                dh = dashMatch[1].trim();
              }
            }

            results.push({
              sourceBook: `${cat} על ${book.title}`,
              category: cat,
              line: lineIndex,
              text: rawHe,
              dibburHamatchil: dh,
              isLineMatch: true
            });
          }
        });
      }
    } catch {}
  }

  // ================= 3. MISHNAH (ברטנורא, תוספות יום טוב, תפארת ישראל) =================
  else if (isMishnah) {
    const slug = MISHNAH_SLUGS[cleanBookTitle] || 'Berakhot';
    const parsed = parseChapterAndVerse(bookContent || '', lineIndex);
    detectedChapter = parsed.chapter;
    detectedVerse = parsed.verse;
    const ref = `Mishnah_${slug}.${detectedChapter}.${detectedVerse}`;

    const commRequests = [
      { name: 'רבי עובדיה מברטנורא', cat: 'ברטנורא', slug: `Bartenura_on_${ref}` },
      { name: 'תוספות יום טוב', cat: 'תוספות יו"ט', slug: `Tosafot_Yom_Tov_on_${ref}` },
      { name: 'תפארת ישראל', cat: 'תפארת ישראל', slug: `Tiferet_Yisrael_on_${ref}` }
    ];

    await Promise.all(
      commRequests.map(async (c) => {
        try {
          const res = await fetch(`https://www.sefaria.org/api/v3/texts/${c.slug}?version=hebrew`, {
            signal: AbortSignal.timeout(3500)
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.versions?.[0]?.text;
            if (text) {
              const formattedText = Array.isArray(text) ? text.join('<br/><br/>') : String(text);
              if (formattedText.trim().length > 5) {
                results.push({
                  sourceBook: `${c.name} על ${book.title}`,
                  category: c.cat,
                  line: lineIndex,
                  text: formattedText
                });
              }
            }
          }
        } catch {}
      })
    );
  }

  // ================= 4. SHULCHAN ARUKH & HALAKHA =================
  else if (isShulchanArukh) {
    const parsed = parseChapterAndVerse(bookContent || '', lineIndex);
    detectedChapter = parsed.chapter;
    detectedVerse = parsed.verse;
    const siman = detectedChapter;
    const seif = detectedVerse;

    try {
      const mbRes = await fetch(`https://www.sefaria.org/api/v3/texts/Mishnah_Berurah.${siman}.${seif}?version=hebrew`, {
        signal: AbortSignal.timeout(3500)
      });
      if (mbRes.ok) {
        const mbData = await mbRes.json();
        const text = mbData.versions?.[0]?.text;
        if (text) {
          results.push({
            sourceBook: `משנה ברורה על סימן ${siman} סעיף ${seif}`,
            category: 'משנה ברורה',
            line: lineIndex,
            text: Array.isArray(text) ? text.join('<br/><br/>') : String(text)
          });
        }
      }
    } catch {}

    try {
      const bhRes = await fetch(`https://www.sefaria.org/api/v3/texts/Biur_Halacha.${siman}.${seif}?version=hebrew`, {
        signal: AbortSignal.timeout(3500)
      });
      if (bhRes.ok) {
        const bhData = await bhRes.json();
        const text = bhData.versions?.[0]?.text;
        if (text) {
          results.push({
            sourceBook: `ביאור הלכה על סימן ${siman}`,
            category: 'ביאור הלכה',
            line: lineIndex,
            text: Array.isArray(text) ? text.join('<br/><br/>') : String(text)
          });
        }
      }
    } catch {}
  }

  const sortedResults = sortCommentariesByGeneration(results);
  const rawAvailable = getAvailableCommentatorsForBook(book);
  const availableCommentators = sortCommentariesByGeneration(
    rawAvailable.map(name => ({ category: name }))
  ).map(item => item.category);

  const responseObj = {
    links: sortedResults,
    allLinks: sortedResults,
    availableCommentators,
    chapter: detectedChapter,
    verse: detectedVerse,
    dafLabel: detectedDafLabel
  };

  commentaryCache.set(cacheKey, responseObj);
  return responseObj;
}

/**
 * Returns comprehensive list of all canonical commentaries for any book in Otzaria
 */
export function getAvailableCommentatorsForBook(book: BookItem): string[] {
  const cleanBookTitle = book.title
    .replace(/^תלמוד בבלי\s+/, '')
    .replace(/^תלמוד ירושלמי\s+/, '')
    .replace(/^משנה\s+/, '')
    .replace(/^מסכת\s+/, '')
    .replace(/^ספר\s+/, '')
    .trim();

  const isYerushalmi =
    book.categoryPath.includes('תלמוד ירושלמי') ||
    book.title.includes('תלמוד ירושלמי') ||
    book.title.includes('ירושלמי');

  const isTalmud =
    !isYerushalmi &&
    (book.categoryPath.includes('תלמוד בבלי') ||
      book.title.includes('תלמוד בבלי') ||
      TALMUD_BAVLI_SLUGS[cleanBookTitle] !== undefined);

  const isMishnah =
    !isTalmud &&
    !isYerushalmi &&
    (book.categoryPath.includes('משנה') ||
      book.title.startsWith('משנה ') ||
      MISHNAH_SLUGS[cleanBookTitle] !== undefined);

  const isTanakh =
    !isTalmud &&
    !isYerushalmi &&
    !isMishnah &&
    (book.categoryPath.includes('תנ"ך') ||
      book.categoryPath.includes('תורה') ||
      book.categoryPath.includes('נביאים') ||
      book.categoryPath.includes('כתובים') ||
      TANAKH_SLUGS[cleanBookTitle] !== undefined);

  const isShulchanArukh =
    !isYerushalmi &&
    (book.title.includes('שולחן ערוך') ||
      book.title.includes('משנה ברורה') ||
      book.categoryPath.includes('הלכה'));

  const isRambam =
    book.title.includes('רמב"ם') ||
    book.title.includes('משנה תורה') ||
    book.categoryPath.includes('רמב"ם');

  if (isYerushalmi) {
    return [
      'פני משה',
      'קרבן העדה',
      'מראה הפנים',
      'שיירי קרבן',
      'ביאור הגר"א',
      'ספר ניר',
      'נועם ירושלמי',
      'רדב"ז על הירושלמי',
      'מהר"ם פולדא',
      'רידב"ז',
      'תולדות יצחק',
      'שדה יהושע',
      'מסורת הש"ס'
    ];
  }

  if (isTalmud) {
    return [
      'רש"י',
      'תוספות',
      'שטיינזלץ',
      'מהרש"א',
      'רשב"א',
      'ריטב"א',
      'ר"ן',
      'רא"ש',
      'תוספות הרא"ש',
      'תוספות ישנים',
      'רבינו חננאל',
      'פני יהושע',
      'מהר"ם',
      'מהרש"ל',
      'שיטה מקובצת',
      'צל"ח',
      'מי השילוח',
      'עיון יעקב',
      'בן יהוידע',
      'יד רמ"ה',
      'הגהות הב"ח',
      'הגהות הגר"א',
      'ערוך לנר',
      'מרומי שדה',
      'דור רביעי',
      'עין משפט נר מצוה',
      'תורה אור',
      'מסורת הש"ס'
    ];
  }

  if (isTanakh) {
    return [
      'רש"י',
      'רמב"ן',
      'אבן עזרא',
      'ספורנו',
      'אור החיים',
      'כלי יקר',
      'בעל הטורים',
      'מצודות',
      'מצודת דוד',
      'מצודת ציון',
      'רד"ק',
      'רלב"ג',
      'מלבי"ם',
      'תרגום אונקלוס',
      'תרגום יונתן',
      'תרגום ירושלמי',
      'שפתי חכמים',
      'חזקוני',
      'אלשיך',
      'רשב"ם',
      'העמק דבר',
      'דעת מקרא',
      'תולדות אהרן'
    ];
  }

  if (isMishnah) {
    return [
      'ברטנורא',
      'רבי עובדיה מברטנורא',
      'תוספות יו"ט',
      'תוספות יום טוב',
      'תפארת ישראל',
      'תוספות חדשים',
      'עיקר תוספות יום טוב',
      'רמב"ם',
      'מלאכת שלמה',
      'הון עשיר',
      'שושנים לדוד'
    ];
  }

  if (isShulchanArukh) {
    return [
      'משנה ברורה',
      'ביאור הלכה',
      'שער הציון',
      'מגן אברהם',
      'טורי זהב (ט"ז)',
      'באר היטב',
      'ש"ך',
      'ב"ח',
      'סמ"ע',
      'פתחי תשובה',
      'כסף משנה',
      'לחם משנה',
      'באור הגר"א',
      'ערוך השולחן',
      'כף החיים',
      'פרי מגדים',
      'קצות החושן',
      'נתיבות המשפט'
    ];
  }

  if (isRambam) {
    return [
      'כסף משנה',
      'לחם משנה',
      'מגיד משנה',
      'רדב"ז',
      'הגהות מיימוניות',
      'מרכבת המשנה',
      'אור שמח',
      'מנחת חינוך',
      'אבן האזל'
    ];
  }

  return [
    'מפרשים',
    'פירוש',
    'הערות',
    'ביאורים',
    'מראי מקומות'
  ];
}

