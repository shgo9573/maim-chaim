import { normalizeCalendarEvents } from './calendarEvents';
export type UserBackupMode = 'merge' | 'replace';

export const MAX_USER_BACKUP_FILE_BYTES = 50 * 1024 * 1024;

const BACKUP_TYPE = 'otzaria_web_user_backup';
const BACKUP_SECTIONS = ['bookmarks', 'history', 'searches', 'notes', 'settings'] as const;
type BackupSection = typeof BACKUP_SECTIONS[number];

export interface UserBackupCounts {
  bookmarks: number;
  history: number;
  searches: number;
  notes: number;
  personalNotes: number;
  customStudies: number;
  calendarEvents: number;
  total: number;
}

export interface UserBackupSummary {
  version: string;
  exportedAt: string | null;
  isLegacy: boolean;
  missingSections: BackupSection[];
  counts: UserBackupCounts;
}

export type UserBackupInspection =
  | { valid: true; summary: UserBackupSummary }
  | { valid: false; error: string };

type BackupRecord = Record<string, unknown>;

function isRecord(value: unknown): value is BackupRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasBookId(value: unknown): boolean {
  return (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && Number.isFinite(value));
}

function validateRows(section: Exclude<BackupSection, 'settings'>, value: unknown): string | null {
  if (!Array.isArray(value)) return `המקטע "${section}" חייב להיות רשימה.`;

  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!isRecord(row)) return `הרשומה ${index + 1} במקטע "${section}" אינה תקינה.`;

    if (section === 'bookmarks') {
      if (!hasBookId(row.bookId) || !hasText(row.bookTitle) ||
          !Number.isInteger(row.lineIndex) || Number(row.lineIndex) < 0) {
        return `הסימנייה ${index + 1} חסרה מזהה ספר, כותרת או מספר שורה תקין.`;
      }
    } else if (section === 'history') {
      if (!hasBookId(row.bookId) || !hasText(row.bookTitle)) {
        return `רשומת ההיסטוריה ${index + 1} חסרה מזהה ספר או כותרת.`;
      }
    } else if (section === 'searches') {
      if (!hasText(row.query)) return `החיפוש ${index + 1} אינו מכיל שאילתה.`;
    } else if (section === 'notes') {
      if (!hasBookId(row.bookId) || !hasText(row.noteContent)) {
        return `ההערה ${index + 1} חסרה מזהה ספר או תוכן.`;
      }
    }
  }

  return null;
}

function validateSettings(value: unknown): string | null {
  if (!isRecord(value)) return 'מקטע ההגדרות חייב להיות אובייקט.';

  for (const key of ['personalNotes', 'customStudies'] as const) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key]) || value[key].some((item) => !isRecord(item))) {
      return `רשימת "${key}" בהגדרות אינה תקינה.`;
    }
  }

  if (value.hiddenHistoryIds !== undefined &&
      (!Array.isArray(value.hiddenHistoryIds) ||
       value.hiddenHistoryIds.some((item) => typeof item !== 'string'))) {
    return 'רשימת מזהי ההיסטוריה המוסתרים אינה תקינה.';
  }

  if (value.calendarEvents !== undefined) {
    if (!Array.isArray(value.calendarEvents) ||
        normalizeCalendarEvents(value.calendarEvents).length !== value.calendarEvents.length) {
      return 'רשימת אירועי לוח השנה בהגדרות אינה תקינה.';
    }
  }

  return null;
}

export function inspectUserBackup(input: unknown): UserBackupInspection {
  if (!isRecord(input)) {
    return { valid: false, error: 'קובץ הגיבוי חייב להכיל אובייקט JSON.' };
  }

  if (input.includes !== undefined || input.origin !== undefined ||
      input.plugins !== undefined || input.userBooks !== undefined) {
    return {
      valid: false,
      error: 'זהו גיבוי של תוכנת אוצריא השולחנית. שחזור גיבוי שולחני אינו נתמך באתר כרגע; הנתונים המקומיים לא שונו.',
    };
  }

  if (input.type !== undefined && input.type !== BACKUP_TYPE) {
    return { valid: false, error: 'סוג הקובץ אינו גיבוי של אוצריא Web.' };
  }

  const version = typeof input.version === 'string' ? input.version.trim() : '';
  const versionMatch = /^([12])\.\d+(?:\.\d+)?$/.exec(version);
  if (!versionMatch) {
    return { valid: false, error: 'גרסת הגיבוי חסרה או אינה נתמכת.' };
  }

  const isLegacy = input.type === undefined;
  const hasSection = BACKUP_SECTIONS.some((section) =>
    Object.prototype.hasOwnProperty.call(input, section),
  );
  if (!hasSection) {
    return { valid: false, error: 'לא נמצאו בקובץ נתוני גיבוי מוכרים.' };
  }

  for (const section of BACKUP_SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(input, section)) continue;
    if (section === 'settings') {
      const error = validateSettings(input.settings);
      if (error) return { valid: false, error };
    } else {
      const error = validateRows(section, input[section]);
      if (error) return { valid: false, error };
    }
  }

  const settings = isRecord(input.settings) ? input.settings : {};
  const counts = {
    bookmarks: Array.isArray(input.bookmarks) ? input.bookmarks.length : 0,
    history: Array.isArray(input.history) ? input.history.length : 0,
    searches: Array.isArray(input.searches) ? input.searches.length : 0,
    notes: Array.isArray(input.notes) ? input.notes.length : 0,
    personalNotes: Array.isArray(settings.personalNotes) ? settings.personalNotes.length : 0,
    customStudies: Array.isArray(settings.customStudies) ? settings.customStudies.length : 0,
    calendarEvents: Array.isArray(settings.calendarEvents) ? settings.calendarEvents.length : 0,
    total: 0,
  };
  counts.total = counts.bookmarks + counts.history + counts.searches + counts.notes +
    counts.personalNotes + counts.customStudies + counts.calendarEvents;

  return {
    valid: true,
    summary: {
      version,
      exportedAt: typeof input.exportedAt === 'string' && Number.isFinite(Date.parse(input.exportedAt))
        ? input.exportedAt
        : null,
      isLegacy,
      missingSections: BACKUP_SECTIONS.filter((section) =>
        !Object.prototype.hasOwnProperty.call(input, section),
      ),
      counts,
    },
  };
}

export function validateUserBackup(
  input: unknown,
  mode: UserBackupMode,
): UserBackupInspection {
  if (mode !== 'merge' && mode !== 'replace') {
    return { valid: false, error: 'אופן השחזור אינו תקין.' };
  }

  const inspection = inspectUserBackup(input);
  if (!inspection.valid) return inspection;

  if (mode === 'replace' && inspection.summary.missingSections.length > 0) {
    const missing = inspection.summary.missingSections.join(', ');
    return {
      valid: false,
      error: `הגיבוי חלקי וחסרים בו המקטעים: ${missing}. כדי למנוע מחיקת נתונים, אפשר לשחזר אותו במצב מיזוג בלבד.`,
    };
  }

  return inspection;
}
