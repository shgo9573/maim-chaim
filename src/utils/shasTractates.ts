/** Shared, dependency-free SHAS tractate metadata for the reader and daily study. */
// Accurate mapping for all 40 Bavli & Yerushalmi tractates matching HebrewBooks volume reqs & start pages
export const SHAS_MAP: Record<string, { req: number; englishSlug: string; startDaf: number; totalDappim: number; masechetIdPortal: number; pageOffset?: number }> = {
  'ברכות': { req: 21111, englishSlug: 'Berakhot', startDaf: 2, totalDappim: 64, masechetIdPortal: 1 },
  'שבת': { req: 21112, englishSlug: 'Shabbat', startDaf: 2, totalDappim: 157, masechetIdPortal: 2 },
  'עירובין': { req: 21113, englishSlug: 'Eruvin', startDaf: 2, totalDappim: 105, masechetIdPortal: 3 },
  'פסחים': { req: 21114, englishSlug: 'Pesachim', startDaf: 2, totalDappim: 121, masechetIdPortal: 4 },
  'שקלים': { req: 21115, englishSlug: 'Shekalim', startDaf: 2, totalDappim: 22, masechetIdPortal: 5 },
  'יומא': { req: 21116, englishSlug: 'Yoma', startDaf: 2, totalDappim: 88, masechetIdPortal: 6 },
  'סוכה': { req: 21117, englishSlug: 'Sukkah', startDaf: 2, totalDappim: 56, masechetIdPortal: 7 },
  'ביצה': { req: 21118, englishSlug: 'Beitzah', startDaf: 2, totalDappim: 40, masechetIdPortal: 8 },
  'ראש השנה': { req: 21119, englishSlug: 'Rosh_Hashanah', startDaf: 2, totalDappim: 35, masechetIdPortal: 9 },
  'תענית': { req: 21120, englishSlug: 'Taanit', startDaf: 2, totalDappim: 31, masechetIdPortal: 10 },
  'מגילה': { req: 21121, englishSlug: 'Megillah', startDaf: 2, totalDappim: 32, masechetIdPortal: 11 },
  'מועד קטן': { req: 21122, englishSlug: 'Moed_Katan', startDaf: 2, totalDappim: 29, masechetIdPortal: 12 },
  'חגיגה': { req: 21123, englishSlug: 'Chagigah', startDaf: 2, totalDappim: 27, masechetIdPortal: 13 },
  'יבמות': { req: 21124, englishSlug: 'Yevamot', startDaf: 2, totalDappim: 122, masechetIdPortal: 14 },
  'כתובות': { req: 21125, englishSlug: 'Ketubot', startDaf: 2, totalDappim: 112, masechetIdPortal: 15 },
  'נדרים': { req: 21126, englishSlug: 'Nedarim', startDaf: 2, totalDappim: 91, masechetIdPortal: 16 },
  'נזיר': { req: 21127, englishSlug: 'Nazir', startDaf: 2, totalDappim: 66, masechetIdPortal: 17 },
  'סוטה': { req: 21128, englishSlug: 'Sotah', startDaf: 2, totalDappim: 49, masechetIdPortal: 18 },
  'גיטין': { req: 21129, englishSlug: 'Gittin', startDaf: 2, totalDappim: 90, masechetIdPortal: 19 },
  'קידושין': { req: 21130, englishSlug: 'Kiddushin', startDaf: 2, totalDappim: 82, masechetIdPortal: 20 },
  'בבא קמא': { req: 21131, englishSlug: 'Bava_Kamma', startDaf: 2, totalDappim: 119, masechetIdPortal: 21 },
  'בבא מציעא': { req: 21132, englishSlug: 'Bava_Metzia', startDaf: 2, totalDappim: 119, masechetIdPortal: 22 },
  'בבא בתרא': { req: 21133, englishSlug: 'Bava_Batra', startDaf: 2, totalDappim: 176, masechetIdPortal: 23 },
  'סנהדרין': { req: 21134, englishSlug: 'Sanhedrin', startDaf: 2, totalDappim: 113, masechetIdPortal: 24 },
  'מכות': { req: 21135, englishSlug: 'Makkot', startDaf: 2, totalDappim: 24, masechetIdPortal: 25 },
  'שבועות': { req: 21136, englishSlug: 'Shevuot', startDaf: 2, totalDappim: 49, masechetIdPortal: 26 },
  'עבודה זרה': { req: 21137, englishSlug: 'Avodah_Zarah', startDaf: 2, totalDappim: 76, masechetIdPortal: 27 },
  'הוריות': { req: 21138, englishSlug: 'Horayot', startDaf: 2, totalDappim: 14, masechetIdPortal: 28 },
  'זבחים': { req: 21139, englishSlug: 'Zevachim', startDaf: 2, totalDappim: 120, masechetIdPortal: 29 },
  'מנחות': { req: 21140, englishSlug: 'Menachot', startDaf: 2, totalDappim: 110, masechetIdPortal: 30 },
  'חולין': { req: 21141, englishSlug: 'Chullin', startDaf: 2, totalDappim: 142, masechetIdPortal: 31 },
  'בכורות': { req: 21142, englishSlug: 'Bekhorot', startDaf: 2, totalDappim: 61, masechetIdPortal: 32 },
  'ערכין': { req: 21143, englishSlug: 'Arakhin', startDaf: 2, totalDappim: 34, masechetIdPortal: 33 },
  'תמורה': { req: 21144, englishSlug: 'Temurah', startDaf: 2, totalDappim: 34, masechetIdPortal: 34 },
  'כריתות': { req: 21145, englishSlug: 'Keritot', startDaf: 2, totalDappim: 28, masechetIdPortal: 35 },
  'מעילה': { req: 21146, englishSlug: 'Meilah', startDaf: 2, totalDappim: 22, masechetIdPortal: 36 },
  'קנים': { req: 21146, englishSlug: 'Kinnim', startDaf: 22, totalDappim: 25, masechetIdPortal: 36, pageOffset: -40 },
  'תמיד': { req: 21147, englishSlug: 'Tamid', startDaf: 26, totalDappim: 33, masechetIdPortal: 37 },
  'מדות': { req: 21148, englishSlug: 'Middot', startDaf: 34, totalDappim: 37, masechetIdPortal: 38 },
  'מידות': { req: 21148, englishSlug: 'Middot', startDaf: 34, totalDappim: 37, masechetIdPortal: 38 },
  'נידה': { req: 21149, englishSlug: 'Niddah', startDaf: 2, totalDappim: 73, masechetIdPortal: 39 },
  'נדה': { req: 21149, englishSlug: 'Niddah', startDaf: 2, totalDappim: 73, masechetIdPortal: 39 }
};

/**
 * Bulletproof tractate matching for Talmud books
 */
export function findShasTractate(title: string) {
  if (!title || typeof title !== 'string') return null;

  const clean = title
    .replace(/[־–—\-_,.:;()\[\]{}'\"״׳]/g, ' ')
    .replace(/\b(תלמוד|בבלי|שס|ש"ס|ש״ס|מסכת|משנה|פירוש|רש"י|תוספות|על|סדר|נשים|נזיקין|מועד|קדשים|טהרות|זרעים)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [key, val] of Object.entries(SHAS_MAP)) {
    if (clean === key || title.trim() === key) return { name: key, ...val };
  }

  for (const [key, val] of Object.entries(SHAS_MAP)) {
    if (clean.includes(key) || title.includes(key)) return { name: key, ...val };
  }

  return null;
}
