/**
 * Central exclusion rules for books that must not be exposed by the website.
 *
 * This intentionally checks catalog category/source metadata as well as titles:
 * hiding only the library rows is insufficient because search results and direct
 * links can reach a book independently of the library UI.
 */
export const EXCLUDED_BOOK_NOTICE = 'הספר הזה אינו זמין באתר';

const excludedBookIds = new Set<string>();

const SOURCE_MARKERS = [
  'אוצר הספרים היהודי השיתופי',
  'ויקיטקסט',
  'ויקי טקסט',
  'wikisource',
  'wikisource to otzaria',
];

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    // Hebrew abbreviations commonly use several different quote characters.
    .replace(/[״׳"'\u2018\u2019\u201C\u201D\u0060\u00B4]/g, '')
    .toLocaleLowerCase()
    .replace(/[ךםןףץ]/g, (letter) => {
      const finals: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
      return finals[letter] || letter;
    })
    .replace(/[^a-z0-9\u05D0-\u05EA]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const excludedTitles = [
  'שמירת שבת כהלכתה',
  'שות ר שלמה ברוך',
  'שות רי הלוי מקושטא',
  'שות ר י הלוי מקושטא',
  'שות רבי יהודה הלוי מקושטא',
  'שות זרח השלום',
  'עין הבדולח',
  'עטרת זקנים',
  'מקל יעקב',
  'יד דוד',
  'ילקוט דרושים',
  'טופסי גיטין',
  'חידושי ר זרחיה גוטה',
  'חידושי רבי זרחיה גוטה',
  'דרשות תלמיד הראש',
  'גנוזות הרמבם',
  'בית אבות',
  'תפסיר מתורגם לרסג',
  'ילקוט מדרשים',
  'רמבן על כתובות',
  'חידושי הרמבן על כתובות',
  'רמבן כתובות',
  'שות משנה הלכות',
  'יעבץ על אבות',
  'מגן אבות ליעבץ',
  'קוץ פרשיות',
  'קובץ מאמרים ואיגרות',
  'קובץ מאמרים ואגרות',
  'הר שפר',
].map(normalizeText);

const titleFields = ['bookTitle', 'book_title', 'title', 'name', 'heTitle', 'he_title'];
const categoryFields = [
  'categoryPath',
  'category_path',
  'category',
  'heCategories',
  'he_categories',
  'path',
  'categoryName',
  'category_name',
];
const sourceFields = [
  'source',
  'sourceName',
  'source_name',
  'sourceType',
  'source_type',
  'provider',
  'origin',
  'originName',
  'origin_name',
  'importSource',
  'import_source',
  'dataSource',
  'data_source',
  'externalSource',
  'external_source',
  'sourceMetadata',
  'source_metadata',
  'wikisource',
  'wikisourceId',
  'wikisource_id',
  'wikisourceToOtzaria',
];

function containsSourceMarker(value: unknown, depth = 0): boolean {
  if (depth > 4 || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    if (!value.trim()) return false;
    const normalized = normalizeText(value);
    return SOURCE_MARKERS.some((marker) => normalized.includes(normalizeText(marker)));
  }
  if (Array.isArray(value)) return value.some((item) => containsSourceMarker(item, depth + 1));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => containsSourceMarker(item, depth + 1));
  return false;
}

function normalizeId(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/** Records IDs discovered under a blocked source/category so every later path can reject them. */
export function rememberExcludedBookId(id: unknown): void {
  const normalized = normalizeId(id);
  if (normalized) excludedBookIds.add(normalized);
}

export function isExcludedCategory(value: unknown): boolean {
  return containsSourceMarker(value);
}

export function isExcludedBook(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  // Search rows may have their own result "id" as well as a separate bookId.
  // Prefer the book identifier to avoid accidental collisions with a row ID.
  const primaryId = normalizeId(
    record.bookId ?? record.book_id ?? record.otzariaId ?? record.otzaria_id ?? record.id,
  );
  if (primaryId && excludedBookIds.has(primaryId)) return true;

  for (const field of categoryFields) {
    if (containsSourceMarker(record[field])) return true;
  }

  for (const field of sourceFields) {
    const sourceValue = record[field];
    if (containsSourceMarker(sourceValue)) return true;
    // A non-empty wikisource relation/ID is itself evidence that the book is mapped.
    if (/wikisource|ויקיטקסט/i.test(field) && sourceValue !== undefined && sourceValue !== null && sourceValue !== '' && sourceValue !== false && sourceValue !== 0) {
      return true;
    }
  }

  for (const [field, fieldValue] of Object.entries(record)) {
    if (/wikisourceToOtzaria|wikisource_id|wikisourceId|ויקיטקסט/i.test(field) &&
      fieldValue !== undefined && fieldValue !== null && fieldValue !== '' && fieldValue !== false && fieldValue !== 0) {
      return true;
    }
  }

  const title = normalizeText(titleFields.map((field) => record[field]).find((item) => typeof item === 'string' && item.trim()));
  if (!title) return false;

  // Prefix matching also covers edition notes, volume labels and the three
  // "ילקוט מדרשים" volumes, while requiring a word boundary to avoid partial words.
  return excludedTitles.some((blocked) => title === blocked || title.startsWith(blocked + ' '));
}
