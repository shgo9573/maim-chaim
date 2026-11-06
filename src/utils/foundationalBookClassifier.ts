import { CANONICAL_TANACH_ORDER, CANONICAL_SHAS_ORDER, getCommentatorPriority } from './generationOrder.js';

// Pre-compiled RegExp patterns and static data structures for zero-allocation performance
const TANACH_PREFIX_REGEX = /^(ספר\s+|חמשה\s+חומשי\s+|חומש\s+|תורה\s+-\s+|תנ"ך\s+-\s+)/;
const SHAS_ENTRIES = Object.entries(CANONICAL_SHAS_ORDER);
const GERESH_GERSHAYIM_REGEX = /[\u05F4״]/g;
const SINGLE_GERESH_REGEX = /[\u05F3׳]/g;
const PRIMARY_ZOHAR_TITLES = new Set(['ספר הזהר', 'זוהר חדש', 'תקוני הזהר', 'ספר הזוהר', 'תיקוני הזוהר']);

/**
 * Foundational Book Classifier matching Otzaria Flutter:
 * lib/search/utils/foundational_book_classifier.dart
 * 
 * Classifies the core canonical foundation books:
 * 1: תנ"ך (תורה, נביאים, כתובים)
 * 2: משנה (ששה סדרי משנה)
 * 3: תלמוד בבלי (ש"ס)
 * 4: תלמוד ירושלמי
 * 5: מדרשי הלכה (מכילתא, ספרא, ספרי)
 * 6: מדרשי אגדה (מדרש רבה, תנחומא, ילקוט שמעוני)
 * 7: ספר הזהר
 * 8: רמב"ם משנה תורה
 * 9: ארבעה טורים
 * 10: שולחן ערוך
 * null: שאר ספרים ומפרשים
 */
export class FoundationalBookClassifier {
  private static scoreCache = new Map<string, number>();

  private static readonly commentaryMarkers = new Set([
    'ראשונים',
    'אחרונים',
    'מחברי זמננו',
    'מפרשים',
    'מפרשי תנ"ך',
    'מפרשי התנ"ך',
    'מפרשי התורה',
    'מפרשי תורה',
    'מפרשי משנה',
    'מפרשי ש"ס',
    'מפרשי בבלי',
    'נושאי כלים',
    'תרגומים',
    'דרשות ודרושים',
    'ספרות עזר',
    'מסכתות קטנות',
    'מערכות ועניינים',
    'מפרשים על המסכתות הקטנות',
  ]);

  public static isCanonicalTanachTitle(title: string): string | null {
    if (!title) return null;
    const t = title.trim();
    if (this.titleSuggestsCommentary(t)) return null;

    let clean = t
      .replace(/^תנ"ך\s*/, '')
      .replace(/^תנך\s*/, '')
      .replace(/^תורה\s*/, '')
      .replace(/^נביאים\s*/, '')
      .replace(/^כתובים\s*/, '')
      .replace(/^חמשה\s+חומשי\s+תורה\s*/, '')
      .replace(/^חומש\s*/, '')
      .replace(/^ספר\s*/, '')
      .replace(/^-\s*/, '')
      .trim();

    while (clean.startsWith('-')) {
      clean = clean.substring(1).trim();
    }

    if (CANONICAL_TANACH_ORDER[clean] !== undefined) {
      return clean;
    }
    if (CANONICAL_TANACH_ORDER[t] !== undefined) {
      return t;
    }
    return null;
  }

  public static classify(categoryPath?: string, title?: string): number | null {
    if (!categoryPath && !title) return null;
    const pathStr = categoryPath || '';
    const titleStr = title || '';

    // If title suggests commentary, it's NOT a foundational base text
    if (this.titleSuggestsCommentary(titleStr)) {
      return null;
    }

    // 1. Direct title check for base biblical books
    if (this.isCanonicalTanachTitle(titleStr)) {
      return 1;
    }

    // 8. Rambam / Mishneh Torah (Check before Mishnah so it won't trigger startsWith('משנה '))
    if (
      titleStr.includes('משנה תורה') ||
      titleStr.includes('היד החזקה') ||
      pathStr.includes('משנה תורה')
    ) {
      if (titleStr.includes('על הרמב"ם') || titleStr.includes('על משנה תורה')) return null;
      return 8;
    }

    // Mishnah Berurah (Not Mishnah)
    if (titleStr.includes('משנה ברורה') || titleStr.includes('ביאור הלכה')) {
      return null;
    }

    const parts = this.splitCategoryPath(pathStr);
    for (const part of parts) {
      if (this.commentaryMarkers.has(part)) return null;
    }

    const root = parts[0] || '';
    const second = parts.length >= 2 ? parts[1] : null;

    // 1. תנ"ך
    if (root === 'תנ"ך' || root === 'תנך') {
      if (parts.length <= 2 || second === 'תורה' || second === 'נביאים' || second === 'כתובים' || second === 'נביאים ראשונים' || second === 'נביאים אחרונים' || second === 'חמש מגילות') {
        return 1;
      }
    }

    // 2. משנה
    if (
      (root === 'משנה' && (parts.length <= 2 || (second?.startsWith('סדר ') ?? false))) ||
      titleStr.startsWith('משנה ')
    ) {
      return 2;
    }

    // 3. תלמוד בבלי (מסכתות הש"ס המקוריות בלבד, ללא מפרשים)
    if (root === 'תלמוד בבלי' || root === 'בבלי' || (root === 'גמרא' && !pathStr.includes('ירושלמי'))) {
      if (this.isCanonicalShasTitle(titleStr)) {
        return 3;
      }
      return null;
    }

    // 4. תלמוד ירושלמי
    if (root === 'תלמוד ירושלמי' || root === 'ירושלמי' || pathStr.includes('ירושלמי')) {
      return 4;
    }

    // 5. מדרש הלכה
    if (root === 'מדרש' && (second === 'הלכה' || second === 'מדרשי הלכה')) {
      return 5;
    }

    // 6. מדרש אגדה
    if (root === 'מדרש' && (second === 'אגדה' || second === 'מדרשי אגדה' || parts.length === 1)) {
      return 6;
    }

    // 7. קבלה / זהר
    if (root === 'קבלה' && (second === 'זהר' || second === 'זוהר') && this.isPrimaryZoharTitle(titleStr)) {
      return 7;
    }

    // 8. הלכה / רמב"ם
    if ((root === 'הלכה' || root === 'רמב"ם' || root === 'רמבם') && (second === 'משנה תורה' || second === 'רמב"ם' || second === 'רמבם')) {
      return 8;
    }

    // 9. הלכה / טור
    if ((root === 'הלכה' || root === 'טור') && (second === 'טור' || titleStr.startsWith('טור '))) {
      return 9;
    }

    // 10. הלכה / שולחן ערוך
    if ((root === 'הלכה' || root === 'שולחן ערוך') && (second === 'שולחן ערוך' || titleStr.startsWith('שולחן ערוך') || titleStr.startsWith('שלחן ערוך'))) {
      return 10;
    }

    return null;
  }

  private static splitCategoryPath(categoryPath: string): string[] {
    const normalized = categoryPath.trim();
    const parts = normalized.includes(', ')
      ? normalized.split(', ')
      : normalized.split('/');
    return parts
      .map(p => this.normalizeQuotes(p.trim()))
      .filter(p => p.length > 0);
  }

  private static normalizeQuotes(s: string): string {
    if (!s.includes('״') && !s.includes('׳') && !s.includes('\u05F4') && !s.includes('\u05F3')) {
      return s;
    }
    return s.replace(GERESH_GERSHAYIM_REGEX, '"').replace(SINGLE_GERESH_REGEX, "'");
  }

  public static isCanonicalShasTitle(title: string): boolean {
    if (!title) return false;
    const t = title.trim();
    if (this.titleSuggestsCommentary(t)) return false;

    // Strip prefixes iteratively
    let clean = t
      .replace(/^תלמוד\s+בבלי\s*/, '')
      .replace(/^בבלי\s*/, '')
      .replace(/^-\s*/, '')
      .replace(/^מסכת\s*/, '')
      .trim();

    for (let i = 0; i < SHAS_ENTRIES.length; i++) {
      const [mName] = SHAS_ENTRIES[i];
      if (
        clean === mName ||
        t === mName ||
        t.endsWith(` ${mName}`) ||
        t.endsWith(`-${mName}`)
      ) {
        return true;
      }
    }
    return false;
  }

  public static titleSuggestsCommentary(title: string): boolean {
    if (!title) return false;
    const t = title.trim();
    return (
      t.includes(' על ') ||
      t.startsWith('פירוש ') ||
      t.startsWith('ביאור ') ||
      t.startsWith('חידושי ') ||
      t.startsWith('הגהות ') ||
      t.startsWith('הערות ') ||
      t.startsWith('קונטרס ') ||
      t.startsWith('תוספות ') ||
      t.startsWith('רש"י ') ||
      t.startsWith('רמב"ן ') ||
      t.startsWith('אבן עזרא ') ||
      t.startsWith('ספורנו ') ||
      t.startsWith('אור החיים ') ||
      t.startsWith('כלי יקר ') ||
      t.startsWith('מלבי"ם ') ||
      t.startsWith('אבן האזל') ||
      t.startsWith('ברטנורא')
    );
  }

  private static isPrimaryZoharTitle(title: string): boolean {
    return PRIMARY_ZOHAR_TITLES.has(title.trim());
  }

  /**
   * Calculates the global canonical score where:
   * 100-199: תנ"ך (בראשית, שמות, ויקרא, במדבר, דברים... תהילים)
   * 200-299: משנה ותוספתא (ששה סדרי משנה)
   * 300-399: תלמוד בבלי (מסכתות הש"ס)
   * 400-499: תלמוד ירושלמי
   * 500-599: מדרשי חז"ל
   * 600-699: ספר הזוהר
   * 700-799: משנה תורה להרמב"ם
   * 800-899: ארבעה טורים
   * 900-999: שולחן ערוך
   * 2000+: כל המפרשים, האחרונים ושאר הספרים
   */
  public static getGlobalBookOrderScore(book: { categoryPath?: string; title: string; order?: number }): number {
    const key = `${book.title}|${book.categoryPath || ''}`;
    const cached = this.scoreCache.get(key);
    if (cached !== undefined) return cached;

    const score = this.computeGlobalBookOrderScore(book);
    this.scoreCache.set(key, score);
    return score;
  }

  private static computeGlobalBookOrderScore(book: { categoryPath?: string; title: string; order?: number }): number {
    const title = (book.title || '').trim();
    const cat = (book.categoryPath || '').trim();
    const fRank = this.classify(cat, title);

    if (fRank !== null) {
      if (fRank === 1) {
        const tanachKey = this.isCanonicalTanachTitle(title) || title;
        const tanachOrder = CANONICAL_TANACH_ORDER[tanachKey] ?? CANONICAL_TANACH_ORDER[title] ?? 50;
        return 100 + tanachOrder;
      }
      if (fRank === 2) {
        for (let i = 0; i < SHAS_ENTRIES.length; i++) {
          const [mName, mOrder] = SHAS_ENTRIES[i];
          if (title.includes(mName)) return 200 + mOrder;
        }
        return 250;
      }
      if (fRank === 3) {
        for (let i = 0; i < SHAS_ENTRIES.length; i++) {
          const [mName, mOrder] = SHAS_ENTRIES[i];
          if (title === mName || title === `מסכת ${mName}` || title.startsWith(`תלמוד בבלי ${mName}`) || title.startsWith(`${mName} `)) {
            return 300 + mOrder;
          }
        }
        return 350;
      }
      if (fRank === 4) {
        for (let i = 0; i < SHAS_ENTRIES.length; i++) {
          const [mName, mOrder] = SHAS_ENTRIES[i];
          if (title.includes(mName)) return 400 + mOrder;
        }
        return 450;
      }
      return fRank * 100;
    }

    // 2000+: מפרשים ושאר ספרים (ממוינים לפי סדר הדורות של המפרשים: תרגום -> רש"י -> רמב"ן -> ראשונים -> אחרונים)
    const prio = getCommentatorPriority(title);
    if (cat.includes('תנ"ך') || cat.includes('תנך') || cat.includes('תורה') || title.includes('על התורה') || title.includes('על בראשית')) return 2100 + prio;
    if (cat.includes('משנה') || title.includes('על המשנה')) return 2200 + prio;
    if (cat.includes('בבלי') || cat.includes('ש"ס') || cat.includes('גמרא') || title.includes('על הש"ס') || title.includes('על בבא')) return 2300 + prio;
    if (cat.includes('מדרש')) return 2400 + prio;
    if (cat.includes('רמב"ם') || cat.includes('משנה תורה') || title.includes('על הרמב"ם')) return 2500 + prio;
    if (cat.includes('טור') || cat.includes('שולחן ערוך') || cat.includes('הלכה')) return 2600 + prio;
    if (cat.includes('שו"ת')) return 2700 + prio;
    if (cat.includes('מוסר') || cat.includes('חסידות') || cat.includes('מחשבה')) return 2800 + prio;
    return 3000 + prio;
  }
}
