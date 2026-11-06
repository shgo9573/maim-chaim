/**
 * Commentary Era hierarchy matching Otzaria canonical architecture:
 * 0: תורה שבכתב (תנ"ך, תרגומים)
 * 1: חז"ל (משנה, תוספתא, גמרא, מדרשי הלכה ואגדה)
 * 2: ראשונים (רש"י, תוספות, רמב"ם, רמב"ן, רא"ש, רי"ף, רשב"א, ריטב"א, ר"ן, מאירי, ברטנורא ועוד)
 * 3: אחרונים (מהרש"א, שו"ע, מזרחי, גור אריה, בעל הטורים, אור החיים, כלי יקר, שפתי חכמים, חתם סופר, משנה ברורה ועוד)
 * 4: מחברי זמננו (שטיינזלץ, רשימות שיעורים, דעת מקרא, הרב קוק, אגרות משה ועוד)
 * 5: שאר מפרשים
 */
export enum CommentaryEra {
  torahShebichtav = 0,
  chazal = 1,
  rishonim = 2,
  acharonim = 3,
  modern = 4,
  other = 5
}

export const ERA_HEBREW_NAMES: Record<CommentaryEra, string> = {
  [CommentaryEra.torahShebichtav]: 'תורה שבכתב',
  [CommentaryEra.chazal]: 'חז"ל',
  [CommentaryEra.rishonim]: 'ראשונים',
  [CommentaryEra.acharonim]: 'אחרונים',
  [CommentaryEra.modern]: 'מחברי זמננו',
  [CommentaryEra.other]: 'שאר מפרשים'
};

// Canonical priority within eras (lower number = earlier / higher precedence)
export const CANONICAL_COMMENTATOR_PRIORITY: Record<string, number> = {
  // תרגומים (1-9)
  'תרגום אונקלוס': 1, 'אונקלוס': 1,
  'תרגום יונתן': 2, 'יונתן בן עוזיאל': 2,
  'תרגום ירושלמי': 3, 'תרגום ניאופיטי': 4, 'תפסיר רס"ג': 5,

  // ראשונים (10-39)
  'רש"י': 10,
  'רשב"ם': 11,
  'תוספות': 12, 'תוספות ישנים': 13, 'תוספות הרא"ש': 14, 'פסקי תוספות': 15,
  'רא"ש': 16, 'הרא"ש': 16, 'פירוש הרא"ש': 16,
  'רבינו חננאל': 17, 'ר"ח': 17,
  'רי"ף': 18,
  'רמב"ם': 19,
  'רמב"ן': 20, 'חידושי רמב"ן': 20, 'חידושי הרמב"ן': 20, 'פירוש רמב"ן': 20, 'פירוש הרמב"ן': 20,
  'אבן עזרא': 21, 'ראב"ע': 21,
  'רד"ק': 22,
  'ספורנו': 23,
  'חזקוני': 24,
  'רלב"ג': 25,
  'רשב"א': 26, 'חידושי הרשב"א': 26, 'חידושי רשב"א': 26,
  'ריטב"א': 27, 'חידושי הריטב"א': 27, 'חידושי ריטב"א': 27,
  'ר"ן': 28, 'חידושי הר"ן': 28, 'חידושי ר"ן': 28,
  'שיטה מקובצת': 29,
  'מאירי': 30, 'בית הבחירה למאירי': 30, 'בית הבחירה': 30,
  'רבינו בחיי': 31,
  'ברטנורא': 32, 'רבי עובדיה מברטנורא': 32,
  'מגיד משנה': 33,
  'הגהות מיימוניות': 34,
  'ספר החינוך': 35,
  'נימוקי יוסף': 36,
  'מרדכי': 37, 'ספר המרדכי': 37,
  'הרוקח': 38, 'סמ"ג': 38, 'סמ"ק': 38,

  // אחרונים (40-119)
  'שולחן ערוך': 40, 'בית יוסף': 40,
  'מזרחי': 41, 'רא"ם': 41,
  'גור אריה': 42, 'מהר"ל': 42, 'מהר"ל מפראג': 42,
  'ב"ח': 43,
  'טורי זהב (ט"ז)': 44, 'ט"ז': 44,
  'שפתי כהן (ש"ך)': 45, 'ש"ך': 45,
  'מגן אברהם': 46,
  'בעל הטורים': 47, 'קיצור בעל הטורים': 47,
  'כלי יקר': 48,
  'אור החיים': 49,
  'שפתי חכמים': 50, 'עיקר שפתי חכמים': 50,
  'אלשיך': 51, 'תורת משה - אלשיך': 51, 'תורת משה': 51,
  'סמ"ע': 52,
  'באר היטב': 53,
  'כסף משנה': 54,
  'לחם משנה': 55,
  'רדב"ז': 56,
  'מהרש"א': 57, 'חידושי הלכות מהרש"א': 57, 'חידושי אגדות מהרש"א': 57,
  'מהרש"ל': 58,
  'מהר"ם': 59, 'מהר"ם שיף': 59,
  'פני יהושע': 60,
  'צל"ח': 61,
  'גבורת ארי': 62,
  'תוספות יום טוב': 63, 'תוספות יו"ט': 63,
  'תפארת ישראל': 64,
  'הגר"א': 65, 'ביאור הגר"א': 65, 'באור הגר"א': 65, 'הגהות הגר"א': 65, 'אדרת אליהו': 65,
  'החיד"א': 66, 'חומת אנך': 66, 'דבש לפי': 66, 'ברכי יוסף': 66,
  'יעב"ץ': 67, 'הגהות יעב"ץ': 67,
  'פני משה': 68, 'קרבן העדה': 68, 'מראה הפנים': 68, 'שיירי קרבן': 68,
  'שפת אמת': 70,
  'חתם סופר': 71,
  'ערוך השולחן': 72,
  'קצות החושן': 73, 'נתיבות המשפט': 73,
  'פתחי תשובה': 74, 'פרי מגדים': 74,
  'ערוך לנר': 75, 'מרומי שדה': 75,
  'מלבי"ם': 76,
  'מצודת דוד': 77, 'מצודת ציון': 77, 'מצודות': 77,
  'הכתב והקבלה': 78,
  'העמק דבר': 79,
  'תורה תמימה': 80,
  'רש"ש': 81, 'הגהות רש"ש': 81,
  'משנה ברורה': 82, 'ביאור הלכה': 82, 'שער הציון': 82,
  'כף החיים': 83,
  'בן יהוידע': 84, 'בן איש חי': 84,
  'לקוטי תורה': 85, 'תורה אור': 85,
  'מגלה עמוקות': 86,
  'תולדות יצחק': 87,
  'צרור המור': 88,
  'פענח רזא': 89,
  'דברי דוד': 90,
  'משכיל לדוד': 91,
  'הדר זקנים': 92,
  'יריעות שלמה': 93,
  'נחל קדומים': 94,

  // מחברי זמננו (120+)
  'שטיינזלץ': 120, 'ביאור שטיינזלץ': 120,
  'דעת מקרא': 121,
  'רשימות שיעורים': 122,
  'הרב קוק': 123, 'עולת ראיה': 123,
  'אגרות משה': 124, 'פיינשטיין': 124,
  'ילקוט יוסף': 125, 'חזון עובדיה': 125
};

export function normalizeCommentatorName(name: string): string {
  return (name || '')
    .trim()
    .replace(/^חידושי\s+ה?|^פירוש\s+ה?|^ביאור\s+ה?|^הגהות\s+ה?|^ספר\s+|^קונטרס\s+/i, '')
    .replace(/["'״׳]/g, '')
    .replace(/\s+/g, ' ');
}

export function extractCommentatorName(title: string): string {
  if (!title) return '';
  let clean = title.replace(/\s+על\s+.+$/i, '').trim();
  clean = clean.replace(/^(חידושי\s+ה?|פירוש\s+ה?|ביאור\s+ה?|הגהות\s+ה?|ספר\s+|קונטרס\s+)/i, '').trim();
  return clean || title;
}

/**
 * Checks if a name matches a key using exact match or whole word boundary match to prevent substring false-positives
 */
function isWordMatch(text: string, targetKey: string): boolean {
  const normText = normalizeCommentatorName(text);
  const normKey = normalizeCommentatorName(targetKey);

  if (normText === normKey) return true;

  const words = normText.split(' ');
  const keyWords = normKey.split(' ');

  if (keyWords.length === 1) {
    return words.includes(normKey);
  }

  return normText.includes(normKey);
}

export function getCommentatorPriority(name: string): number {
  if (!name) return 999;

  const clean = normalizeCommentatorName(name);
  const baseName = normalizeCommentatorName(extractCommentatorName(name));

  // 1. Direct or whole word match in CANONICAL_COMMENTATOR_PRIORITY
  for (const [key, prio] of Object.entries(CANONICAL_COMMENTATOR_PRIORITY)) {
    if (isWordMatch(clean, key) || isWordMatch(baseName, key)) {
      return prio;
    }
  }

  return 999;
}

export function getCommentatorEra(commentatorName: string): CommentaryEra {
  if (!commentatorName) return CommentaryEra.other;

  const clean = normalizeCommentatorName(commentatorName);
  const base = normalizeCommentatorName(extractCommentatorName(commentatorName));

  // 1. Check priority first (if priority is mapped, map to era based on priority range)
  const prio = getCommentatorPriority(commentatorName);
  if (prio >= 1 && prio <= 9) return CommentaryEra.torahShebichtav;
  if (prio >= 10 && prio <= 39) return CommentaryEra.rishonim;
  if (prio >= 40 && prio <= 119) return CommentaryEra.acharonim;
  if (prio >= 120 && prio <= 200) return CommentaryEra.modern;

  // 2. תורה שבכתב / תרגומים / חז"ל
  if (
    isWordMatch(clean, 'תרגום') ||
    isWordMatch(clean, 'אונקלוס') ||
    isWordMatch(clean, 'יונתן') ||
    isWordMatch(clean, 'פשיטתא') ||
    isWordMatch(clean, 'תפסיר')
  ) {
    return CommentaryEra.torahShebichtav;
  }

  if (
    isWordMatch(clean, 'משנה') ||
    isWordMatch(clean, 'תוספתא') ||
    isWordMatch(clean, 'גמרא') ||
    isWordMatch(clean, 'בבלי') ||
    isWordMatch(clean, 'ירושלמי') ||
    isWordMatch(clean, 'מדרש') ||
    isWordMatch(clean, 'תנחומא') ||
    isWordMatch(clean, 'מכילתא') ||
    isWordMatch(clean, 'ספרא') ||
    isWordMatch(clean, 'ספרי')
  ) {
    return CommentaryEra.chazal;
  }

  // 3. ראשונים
  if (
    isWordMatch(clean, 'רשי') ||
    isWordMatch(clean, 'רשבם') ||
    isWordMatch(clean, 'תוספות') ||
    isWordMatch(clean, 'רמבם') ||
    isWordMatch(clean, 'רמבן') ||
    isWordMatch(clean, 'אבן עזרא') ||
    isWordMatch(clean, 'ראש') ||
    isWordMatch(clean, 'ריף') ||
    isWordMatch(clean, 'רן') ||
    isWordMatch(clean, 'רשבא') ||
    isWordMatch(clean, 'ריטבא') ||
    isWordMatch(clean, 'רדק') ||
    isWordMatch(clean, 'רלבג') ||
    isWordMatch(clean, 'ספורנו') ||
    isWordMatch(clean, 'חזקוני') ||
    isWordMatch(clean, 'מאירי') ||
    isWordMatch(clean, 'חננאל') ||
    isWordMatch(clean, 'ברטנורא')
  ) {
    return CommentaryEra.rishonim;
  }

  // 4. מחברי זמננו
  if (
    isWordMatch(clean, 'שטיינזלץ') ||
    isWordMatch(clean, 'דעת מקרא') ||
    isWordMatch(clean, 'שיעורים') ||
    isWordMatch(clean, 'קוק') ||
    isWordMatch(clean, 'פיינשטיין') ||
    isWordMatch(clean, 'יוסף')
  ) {
    return CommentaryEra.modern;
  }

  // 5. אחרונים (fallback for common commentary prefixes or general commentary titles)
  if (
    clean.includes('על') ||
    clean.includes('פירוש') ||
    clean.includes('חידושי') ||
    clean.includes('ביאור') ||
    clean.includes('הגהות')
  ) {
    return CommentaryEra.acharonim;
  }

  return CommentaryEra.other;
}

/**
 * Sorts commentary results or commentator titles according to the Otzaria generation and canonical authority hierarchy:
 * 1. Era: תורה שבכתב -> חז"ל -> ראשונים -> אחרונים -> מחברי זמננו -> שאר מפרשים
 * 2. Canonical priority within era (e.g., רש"י -> תוספות -> רא"ש -> רמב"ן -> שאר ראשונים -> אחרונים)
 * 3. Commentary title / category (alphabetical)
 */
export function sortCommentariesByGeneration<T extends { category?: string; sourceBook?: string; orderIndex?: number } | string>(
  commentaries: T[]
): T[] {
  return [...commentaries].sort((a, b) => {
    // 1. Primary Authority: Database canonical orderIndex (Otzaria software native book order)
    const orderA = typeof a === 'object' && a !== null && typeof a.orderIndex === 'number' ? a.orderIndex : undefined;
    const orderB = typeof b === 'object' && b !== null && typeof b.orderIndex === 'number' ? b.orderIndex : undefined;

    if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
      return orderA - orderB;
    }

    // 2. Secondary Authority: Generational Era & Priority mapping
    const rawA = typeof a === 'string' ? a : (a.sourceBook || a.category || '');
    const rawB = typeof b === 'string' ? b : (b.sourceBook || b.category || '');

    const baseA = extractCommentatorName(rawA);
    const baseB = extractCommentatorName(rawB);

    const eraA = getCommentatorEra(baseA || rawA);
    const eraB = getCommentatorEra(baseB || rawB);

    if (eraA !== eraB) {
      return eraA - eraB;
    }

    const prioA = getCommentatorPriority(rawA);
    const prioB = getCommentatorPriority(rawB);

    if (prioA !== prioB) {
      return prioA - prioB;
    }

    return rawA.localeCompare(rawB, 'he');
  });
}

export const CANONICAL_TANACH_ORDER: Record<string, number> = {
  // תורה (1-5)
  'בראשית': 1, 'שמות': 2, 'ויקרא': 3, 'במדבר': 4, 'דברים': 5,
  'תורה': 1, 'חמשה חומשי תורה': 1, 'חומש': 1,

  // נביאים ראשונים (6-11)
  'יהושע': 6, 'שופטים': 7, 'שמואל א': 8, 'שמואל ב': 9, 'שמואל': 8, 'מלכים א': 10, 'מלכים ב': 11, 'מלכים': 10,

  // נביאים אחרונים (12-26)
  'ישעיהו': 12, 'ישעיה': 12, 'ירמיהו': 13, 'ירמיה': 13, 'יחזקאל': 14,
  'תרי עשר': 15, 'הושע': 15, 'יואל': 16, 'עמוס': 17, 'עובדיה': 18, 'יונה': 19, 'מיכה': 20,
  'נחום': 21, 'חבקוק': 22, 'צפניה': 23, 'חגי': 24, 'זכריה': 25, 'מלאכי': 26,

  // כתובים (27-39)
  'תהילים': 27, 'תהלים': 27, 'משלי': 28, 'איוב': 29,
  'שיר השירים': 30, 'רות': 31, 'איכה': 32, 'קהלת': 33, 'אסתר': 34,
  'דניאל': 35, 'עזרא': 36, 'נחמיה': 37, 'דברי הימים א': 38, 'דברי הימים ב': 39, 'דברי הימים': 38
};

export const CANONICAL_SHAS_ORDER: Record<string, number> = {
  // זרעים (1-11)
  'ברכות': 1, 'פאה': 2, 'דמאי': 3, 'כלאים': 4, 'שביעית': 5, 'תרומות': 6, 'מעשרות': 7, 'מעשר שני': 8, 'חלה': 9, 'ערלה': 10, 'ביכורים': 11,
  // מועד (12-23)
  'שבת': 12, 'עירובין': 13, 'פסחים': 14, 'שקלים': 15, 'יומא': 16, 'סוכה': 17, 'ביצה': 18, 'ראש השנה': 19, 'תענית': 20, 'מגילה': 21, 'מועד קטן': 22, 'חגיגה': 23,
  // נשים (24-30)
  'יבמות': 24, 'כתובות': 25, 'נדרים': 26, 'נזיר': 27, 'סוטה': 28, 'גיטין': 29, 'קידושין': 30,
  // נזיקין (31-40)
  'בבא קמא': 31, 'בבא מציעא': 32, 'בבא בתרא': 33, 'סנהדרין': 34, 'מכות': 35, 'שבועות': 36, 'עבודה זרה': 37, 'הוריות': 38, 'אבות': 39, 'פרקי אבות': 39, 'עדויות': 40,
  // קדשים (41-51)
  'זבחים': 41, 'מנחות': 42, 'חולין': 43, 'בכורות': 44, 'ערכין': 45, 'תמורה': 46, 'כריתות': 47, 'מעילה': 48, 'תמיד': 49, 'מידות': 50, 'קינים': 51,
  // טהרות (52-63)
  'כלים': 52, 'אהלות': 53, 'נגעים': 54, 'פרה': 55, 'טהרות': 56, 'מקוואות': 57, 'נדה': 58, 'מכשירין': 59, 'זבים': 60, 'טבול יום': 61, 'ידיים': 62, 'עוקצין': 63
};

export function isCommentaryTitle(title: string): boolean {
  if (!title) return false;
  return (
    title.includes(' על ') ||
    title.startsWith('פירוש ') ||
    title.startsWith('ביאור ') ||
    title.startsWith('חידושי ') ||
    title.startsWith('הגהות ') ||
    title.startsWith('הערות ') ||
    title.startsWith('קונטרס ') ||
    title.startsWith('ספר חידושי ') ||
    title.startsWith('תוספות ') ||
    title.startsWith('חידושים וביאורים')
  );
}

/**
 * Computes a precise canonical score for ANY book in the Otzaria library.
 * Lower score = earlier in the canonical Jewish library hierarchy:
 * 1-99: תנ"ך ותרגומים (Tanach & Targumim)
 * 100-299: משנה ותוספתא (Mishnah & Tosefta)
 * 300-499: תלמוד בבלי וירושלמי (Bavli & Yerushalmi)
 * 500-599: מדרש (Midrash)
 * 600-799: ראשונים - רמב"ם, טור, רא"ש, רי"ף ועוד (Rishonim)
 * 800-999: שולחן ערוך ואחרונים (Shulchan Aruch & Acharonim)
 * 1000-1199: מחשבה, מוסר וחסידות (Musar & Machshava)
 * 1200-1399: שו"ת (Responsa)
 * 1400+: מחברי זמננו ושאר ספרים
 */
export function getBookCanonicalScore(book: { title: string; categoryPath?: string; heEra?: string }): number {
  const title = (book.title || '').trim();
  const cat = (book.categoryPath || '').trim();
  const era = (book.heEra || '').trim();
  const isComm = isCommentaryTitle(title);

  // 1. תנ"ך (Only base books and translations, NOT commentaries on Tanach)
  if (!isComm) {
    const cleanTitle = title.replace(/^(ספר\s+|פירוש\s+|חמשה\s+חומשי\s+|חומש\s+|תורה\s+-\s+|תנ"ך\s+-\s+)/, '').trim();
    if (CANONICAL_TANACH_ORDER[cleanTitle] !== undefined) return CANONICAL_TANACH_ORDER[cleanTitle];
    if (CANONICAL_TANACH_ORDER[title] !== undefined) return CANONICAL_TANACH_ORDER[title];

    if (title.includes('תרגום אונקלוס') || title.includes('אונקלוס')) return 70;
    if (title.includes('תרגום יונתן')) return 71;
    if (title.includes('תרגום ירושלמי') || title.includes('תרגום ניאופיטי')) return 72;

    if (cat.startsWith('תנ"ך') || cat.startsWith('תנך') || era === 'תנ"ך' || era === 'תנך') {
      for (const [tName, tOrder] of Object.entries(CANONICAL_TANACH_ORDER)) {
        if (cleanTitle === tName || cleanTitle.startsWith(`${tName} `)) return tOrder;
      }
      return 50;
    }
  }

  // רמב"ם / משנה תורה (מוגן שלא יתבלבל עם משנה)
  if (cat.includes('רמב"ם') || cat.includes('רמבם') || title.includes('משנה תורה') || title.includes('היד החזקה') || title.includes('מורה נבוכים')) {
    if (title.includes('על הרמב"ם') || title.includes('על משנה תורה')) return 860;
    return 600;
  }

  // משנה ברורה (מוגן שלא יתבלבל עם משנה)
  if (title.includes('משנה ברורה') || title.includes('ביאור הלכה')) return 810;

  // 2. משנה ותוספתא (Base books only)
  if (!isComm) {
    if (cat.startsWith('משנה') || title.startsWith('משנה ') || era === 'משנה') {
      for (const [mName, mOrder] of Object.entries(CANONICAL_SHAS_ORDER)) {
        if (title.includes(mName)) return 100 + mOrder;
      }
      return 150;
    }
    if (cat.startsWith('תוספתא') || title.startsWith('תוספתא ') || era === 'תוספתא') {
      for (const [mName, mOrder] of Object.entries(CANONICAL_SHAS_ORDER)) {
        if (title.includes(mName)) return 200 + mOrder;
      }
      return 250;
    }

    // 3. תלמוד בבלי וירושלמי (Base tractates)
    if (cat.includes('בבלי') || cat.includes('גמרא') || title.startsWith('תלמוד בבלי') || CANONICAL_SHAS_ORDER[title] !== undefined) {
      for (const [mName, mOrder] of Object.entries(CANONICAL_SHAS_ORDER)) {
        if (title === mName || title === `מסכת ${mName}` || title.startsWith(`תלמוד בבלי ${mName}`) || title.startsWith(`${mName} `)) {
          return 300 + mOrder;
        }
      }
      return 350;
    }

    if (cat.includes('ירושלמי') || title.startsWith('תלמוד ירושלמי') || title.startsWith('ירושלמי')) {
      for (const [mName, mOrder] of Object.entries(CANONICAL_SHAS_ORDER)) {
        if (title.includes(mName)) return 400 + mOrder;
      }
      return 450;
    }

    // 4. מדרש
    if (cat.includes('מדרש') || era.includes('מדרש') || title.includes('רבה') || title.includes('תנחומא') || title.includes('ילקוט שמעוני')) {
      if (title.includes('בראשית רבה')) return 501;
      if (title.includes('שמות רבה')) return 502;
      if (title.includes('ויקרא רבה')) return 503;
      if (title.includes('במדבר רבה')) return 504;
      if (title.includes('דברים רבה')) return 505;
      if (title.includes('מדרש תנחומא')) return 510;
      return 550;
    }
  }

  // 5. ראשונים (טור, רי"ף, רא"ש, רש"י, רמב"ן, רשב"א וכו')
  if (cat.includes('טור') || title.startsWith('טור ') || title.includes('ארבעה טורים')) {
    if (title.includes('אורח חיים')) return 610;
    if (title.includes('יורה דעה')) return 611;
    if (title.includes('אבן העזר')) return 612;
    if (title.includes('חושן משפט')) return 613;
    return 615;
  }
  if (
    title.includes('רש"י') || title.includes('רמב"ן') || title.includes('אבן עזרא') ||
    title.includes('רשב"ם') || title.includes('ספורנו') || title.includes('חזקוני') ||
    title.includes('רד"ק') || title.includes('רלב"ג') || title.includes('בעל הטורים') ||
    title.includes('תוספות') || title.includes('מאירי') || title.includes('רא"ש') ||
    title.includes('רי"ף') || title.includes('רשב"א') || title.includes('ריטב"א') ||
    title.includes('ר"ן') || title.includes('שיטה מקובצת') ||
    cat.includes('ראשונים') || era.includes('ראשונים')
  ) {
    const prio = getCommentatorPriority(title);
    return 620 + Math.min(100, prio);
  }

  // 6. שולחן ערוך ואחרונים
  if (title.includes('שולחן ערוך') || title.includes('שלחן ערוך')) {
    if (title.includes('אורח חיים')) return 800;
    if (title.includes('יורה דעה')) return 801;
    if (title.includes('אבן העזר')) return 802;
    if (title.includes('חושן משפט')) return 803;
    return 805;
  }

  if (title.includes('קיצור שולחן ערוך') || title.includes('קיצור שלחן ערוך')) return 820;
  if (title.includes('כף החיים')) return 825;
  if (title.includes('ערוך השולחן')) return 830;
  if (
    title.includes('אור החיים') || title.includes('כלי יקר') || title.includes('שפתי חכמים') ||
    title.includes('אלשיך') || title.includes('תורה תמימה') || title.includes('העמק דבר') ||
    title.includes('הכתב והקבלה') || title.includes('מלבי"ם') || title.includes('מצודת דוד') ||
    title.includes('אבן האזל') ||
    cat.includes('אחרונים') || era.includes('אחרונים') || cat.includes('הלכה')
  ) {
    const prio = getCommentatorPriority(title);
    return 850 + Math.min(100, prio);
  }

  // 7. מוסר ומחשבה
  if (cat.includes('מוסר') || cat.includes('חסידות') || cat.includes('מחשבה') || cat.includes('קבלה')) return 1000;

  // 8. שו"ת
  if (cat.includes('שו"ת') || title.startsWith('שו"ת')) return 1200;

  // 9. מחברי זמננו
  if (cat.includes('זמננו') || era.includes('זמננו')) return 1400;

  return 1500;
}
