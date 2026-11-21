import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { updateBookmarkDescriptionInList } from '../utils/bookmarkContextMenu.js';

export function normalizeStoredUserSettings(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export interface UserRecord {
  userId: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  bookmarks: Array<{
    id: string;
    bookId: number | string;
    bookTitle: string;
    lineIndex: number;
    textSnippet: string;
    description?: string;
    category?: string;
    heRef?: string;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    bookId: number | string;
    bookTitle: string;
    category?: string;
    lastPosition?: number;
    lastSection?: string;
    lastReadAt: string;
  }>;
  searches?: Array<{
    id: string;
    query: string;
    category?: string;
    searchedAt: string;
  }>;
  notes?: Array<{
    id: string;
    bookId: number | string;
    bookTitle: string;
    ref?: string;
    selectedText?: string;
    noteContent: string;
    updatedAt: string;
  }>;
  settings?: Record<string, any>;
}

// Candidate directories for persistent disk storage
const CANDIDATE_DIRS = [
  '/var/data/otzaria/user-data',
  path.resolve(process.cwd(), 'data/user-data'),
  path.resolve(process.cwd(), '../data/user-data'),
  '/tmp/otzaria-user-data'
];

let resolvedUserDir: string | null = null;

function getUserDataDir(): string {
  if (resolvedUserDir) return resolvedUserDir;

  for (const dir of CANDIDATE_DIRS) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write permission
      const testFile = path.join(dir, '.test-write');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);

      resolvedUserDir = dir;
      console.log(`[UserStore] Using persistent user storage directory: ${resolvedUserDir}`);
      return resolvedUserDir;
    } catch {
      // try next
    }
  }

  // Fallback to local cwd
  const fallback = path.resolve(process.cwd(), 'data/user-data');
  fs.mkdirSync(fallback, { recursive: true });
  resolvedUserDir = fallback;
  return resolvedUserDir;
}

function getUserFilePath(userId: string): string {
  // sanitize userId to avoid directory traversal
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(getUserDataDir(), `${safeId}.json`);
}

function getEmailIndexPath(): string {
  return path.join(getUserDataDir(), 'email-index.json');
}

/**
 * Loads user record from disk or creates a fresh one
 */
export function getUserRecord(userId: string): UserRecord {
  const filePath = getUserFilePath(userId);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        userId,
        email: data.email || null,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        history: Array.isArray(data.history) ? data.history : [],
        searches: Array.isArray(data.searches) ? data.searches : [],
        notes: Array.isArray(data.notes) ? data.notes : [],
        settings: normalizeStoredUserSettings(data.settings)
      };
    } catch (err: any) {
      console.error(`[UserStore] Error reading file for ${userId}:`, err.message);
    }
  }

  const newRecord: UserRecord = {
    userId,
    email: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bookmarks: [],
    history: [],
    searches: [],
    notes: [],
    settings: {}
  };

  saveUserRecord(newRecord);
  return newRecord;
}

/**
 * Saves user record atomically to disk
 */
export function saveUserRecord(record: UserRecord): void {
  const filePath = getUserFilePath(record.userId);
  record.updatedAt = new Date().toISOString();
  const tmpPath = `${filePath}.tmp_${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err: any) {
    console.error(`[UserStore] Failed to write user data for ${record.userId}:`, err.message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }
}

/**
 * Bookmark Operations
 */
export function addBookmark(
  userId: string,
  bm: Omit<UserRecord['bookmarks'][0], 'id' | 'createdAt'>
): UserRecord['bookmarks'][0] {
  const user = getUserRecord(userId);
  const id = `bm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const newItem = {
    ...bm,
    id,
    createdAt: new Date().toISOString()
  };

  // deduplicate same book and line
  user.bookmarks = [
    newItem,
    ...user.bookmarks.filter(b => !(b.bookId === bm.bookId && b.lineIndex === bm.lineIndex))
  ];

  saveUserRecord(user);
  return newItem;
}

export function updateBookmarkDescription(userId: string, bookmarkId: string, description: string): UserRecord['bookmarks'][0] | null {
  const user = getUserRecord(userId);
  const updated = updateBookmarkDescriptionInList(user.bookmarks, bookmarkId, description);
  if (!updated) return null;
  user.bookmarks = updated;
  saveUserRecord(user);
  return user.bookmarks.find(bookmark => bookmark.id === bookmarkId) || null;
}

export function removeBookmark(userId: string, bookmarkId: string): void {
  const user = getUserRecord(userId);
  user.bookmarks = user.bookmarks.filter(b => b.id !== bookmarkId);
  saveUserRecord(user);
}

/**
 * Reading History Operations
 */
export function recordReadingHistory(
  userId: string,
  item: Omit<UserRecord['history'][0], 'id' | 'lastReadAt'>
): UserRecord['history'][0] {
  const user = getUserRecord(userId);
  const id = `hist_${item.bookId}`;
  const historyItem = {
    ...item,
    id,
    lastReadAt: new Date().toISOString()
  };

  user.history = [
    historyItem,
    ...user.history.filter(h => String(h.bookId) !== String(item.bookId))
  ].slice(0, 100);

  saveUserRecord(user);
  return historyItem;
}

export function clearReadingHistory(userId: string): void {
  const user = getUserRecord(userId);
  user.history = [];
  saveUserRecord(user);
}

/**
 * Future Recovery / Email Linking Architecture
 */
/**
 * Removes one saved reading-history entry without clearing other entries.
 */
export function removeReadingHistoryItem(userId: string, historyId: string): UserRecord['history'] {
  const user = getUserRecord(userId);
  const previousLength = user.history.length;
  user.history = user.history.filter(item => String(item.id) !== historyId);
  if (user.history.length !== previousLength) saveUserRecord(user);
  return user.history;
}

/**
 * Persist anonymous feedback separately from per-user records.
 */
export function recordFeedback(message: string): { id: string; createdAt: string } {
  const record = {
    id: `feedback_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    createdAt: new Date().toISOString(),
    message: message.slice(0, 5000),
  };
  const filePath = path.join(getUserDataDir(), 'feedback.jsonl');
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { id: record.id, createdAt: record.createdAt };
}

export function linkEmailToUser(userId: string, email: string): boolean {
  const normEmail = email.trim().toLowerCase();
  const emailIndexPath = getEmailIndexPath();
  let emailIndex: Record<string, string> = {};

  if (fs.existsSync(emailIndexPath)) {
    try {
      emailIndex = JSON.parse(fs.readFileSync(emailIndexPath, 'utf-8'));
    } catch {}
  }

  // Bind email to userId
  emailIndex[normEmail] = userId;
  try {
    fs.writeFileSync(emailIndexPath, JSON.stringify(emailIndex, null, 2), 'utf-8');
  } catch {}

  const user = getUserRecord(userId);
  user.email = normEmail;
  saveUserRecord(user);
  return true;
}

export function findUserIdByEmail(email: string): string | null {
  const normEmail = email.trim().toLowerCase();
  const emailIndexPath = getEmailIndexPath();
  if (!fs.existsSync(emailIndexPath)) return null;

  try {
    const emailIndex: Record<string, string> = JSON.parse(fs.readFileSync(emailIndexPath, 'utf-8'));
    return emailIndex[normEmail] || null;
  } catch {
    return null;
  }
}

/**
 * User Settings Management
 */
export function getUserSettings(userId: string): Record<string, any> {
  const user = getUserRecord(userId);
  return user.settings || {};
}

export function updateUserSettings(userId: string, newSettings: Record<string, any>): Record<string, any> {
  const user = getUserRecord(userId);
  user.settings = {
    ...(user.settings || {}),
    ...newSettings
  };
  saveUserRecord(user);
  return user.settings;
}

/**
 * Backup merge helpers.
 *
 * The desktop app treats merge as additive: local preferences win, while
 * missing records are imported. Notes are the exception only when the
 * incoming copy has a newer updatedAt timestamp.
 */
type BackupMergeRecord = Record<string, unknown>;

function asBackupRecord(value: unknown): BackupMergeRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as BackupMergeRecord
    : {};
}

function asBackupRecordArray(value: unknown): BackupMergeRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is BackupMergeRecord =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function backupIdKey(item: object): string | null {
  const id = String((item as BackupMergeRecord).id ?? '').trim();
  return id ? `id:${id}` : null;
}

function backupBookmarkKey(item: object): string | null {
  const row = item as BackupMergeRecord;
  const bookId = String(row.bookId ?? '').trim();
  const lineIndex = Number(row.lineIndex);
  if (bookId && Number.isInteger(lineIndex)) {
    return `book:${bookId}:line:${lineIndex}`;
  }
  return backupIdKey(item);
}

function backupHistoryKey(item: object): string | null {
  const row = item as BackupMergeRecord;
  const bookId = String(row.bookId ?? '').trim();
  return bookId ? `book:${bookId}` : backupIdKey(item);
}

function backupSearchKey(item: object): string | null {
  const row = item as BackupMergeRecord;
  const query = String(row.query ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (query) {
    const category = String(row.category ?? '').trim().toLocaleLowerCase();
    return `query:${query}:category:${category}`;
  }
  return backupIdKey(item);
}

function backupNoteKey(item: object): string | null {
  const row = item as BackupMergeRecord;
  const id = String(row.id ?? '').trim();
  if (id) return `id:${id}`;

  const bookId = String(row.bookId ?? '').trim();
  const location = String(row.line ?? row.lineNumber ?? row.ref ?? row.heRef ?? '').trim();
  const content = String(row.text ?? row.noteContent ?? row.content ?? '').trim();
  return bookId && (location || content)
    ? `note:${bookId}:${location}:${content}`
    : null;
}

function incomingBackupItemIsNewer(
  current: object,
  incoming: object,
  timestampKey: string,
): boolean {
  const currentValue = (current as BackupMergeRecord)[timestampKey];
  const incomingValue = (incoming as BackupMergeRecord)[timestampKey];
  if (typeof incomingValue !== 'string' && typeof incomingValue !== 'number') return false;
  const incomingTime = Date.parse(String(incomingValue));
  if (!Number.isFinite(incomingTime)) return false;

  const currentTime = typeof currentValue === 'string' || typeof currentValue === 'number'
    ? Date.parse(String(currentValue))
    : Number.NaN;
  return !Number.isFinite(currentTime) || incomingTime > currentTime;
}

function mergeBackupItems<T extends object>(
  local: readonly T[],
  incomingValue: unknown,
  keyOf: (item: T) => string | null,
  timestampKey?: string,
): T[] {
  const merged = [...local];
  const positions = new Map<string, number>();

  merged.forEach((item, index) => {
    const key = keyOf(item);
    if (key && !positions.has(key)) positions.set(key, index);
  });

  for (const incoming of asBackupRecordArray(incomingValue) as T[]) {
    const key = keyOf(incoming);
    if (!key) {
      merged.push(incoming);
      continue;
    }

    const existingIndex = positions.get(key);
    if (existingIndex === undefined) {
      positions.set(key, merged.length);
      merged.push(incoming);
      continue;
    }

    if (
      timestampKey &&
      incomingBackupItemIsNewer(merged[existingIndex], incoming, timestampKey)
    ) {
      merged[existingIndex] = incoming;
    }
  }

  return merged;
}

function mergeBackupSettings(
  local: Record<string, any>,
  incoming: Record<string, unknown>,
): Record<string, any> {
  // Ordinary preferences stay local in merge mode, matching Otzaria desktop.
  const merged: Record<string, any> = { ...incoming, ...local };

  if (Array.isArray(local.personalNotes) || Array.isArray(incoming.personalNotes)) {
    merged.personalNotes = mergeBackupItems(
      asBackupRecordArray(local.personalNotes),
      incoming.personalNotes,
      backupNoteKey,
      'updatedAt',
    );
  }

  if (Array.isArray(local.hiddenHistoryIds) || Array.isArray(incoming.hiddenHistoryIds)) {
    const localIds = Array.isArray(local.hiddenHistoryIds)
      ? local.hiddenHistoryIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const incomingIds = Array.isArray(incoming.hiddenHistoryIds)
      ? incoming.hiddenHistoryIds.filter((value): value is string => typeof value === 'string')
      : [];
    merged.hiddenHistoryIds = [...new Set([...localIds, ...incomingIds])];
  }

  if (Array.isArray(local.customStudies) || Array.isArray(incoming.customStudies)) {
    merged.customStudies = mergeBackupItems(
      asBackupRecordArray(local.customStudies),
      incoming.customStudies,
      backupIdKey,
      'updatedAt',
    );
  }

  return merged;
}

/**
 * Pure merge operation shared by backup restore and tests.
 * Local bookmarks/history win on identity conflicts; notes use updatedAt so a
 * newer copy can be recovered without overwriting a more recent local edit.
 */
export function mergeUserBackupCollections(
  local: Pick<UserRecord, 'bookmarks' | 'history' | 'searches' | 'notes' | 'settings'>,
  backupData: Record<string, unknown>,
): Pick<UserRecord, 'bookmarks' | 'history' | 'searches' | 'notes' | 'settings'> {
  return {
    bookmarks: mergeBackupItems(local.bookmarks, backupData.bookmarks, backupBookmarkKey),
    history: mergeBackupItems(local.history, backupData.history, backupHistoryKey),
    searches: mergeBackupItems(local.searches || [], backupData.searches, backupSearchKey, 'searchedAt'),
    notes: mergeBackupItems(local.notes || [], backupData.notes, backupNoteKey, 'updatedAt'),
    settings: mergeBackupSettings(local.settings || {}, asBackupRecord(backupData.settings)),
  };
}

/**
 * Backup and Restore Operations
 */
export function exportUserBackup(userId: string): Record<string, any> {
  const user = getUserRecord(userId);
  return {
    version: '2.0.0',
    type: 'otzaria_web_user_backup',
    exportedAt: new Date().toISOString(),
    userId: user.userId,
    note: 'קובץ גיבוי זה נוצר באוצריא Web ואינו מובטח להתאים לתוכנת אוצריא שולחנית',
    bookmarks: user.bookmarks,
    history: user.history,
    searches: user.searches || [],
    notes: user.notes || [],
    settings: user.settings || {}
  };
}

export function importUserBackup(
  userId: string,
  backupData: any,
  mode: 'merge' | 'replace' = 'merge'
): UserRecord {
  const user = getUserRecord(userId);

  if (mode === 'replace') {
    user.bookmarks = Array.isArray(backupData.bookmarks) ? backupData.bookmarks : [];
    user.history = Array.isArray(backupData.history) ? backupData.history : [];
    user.searches = Array.isArray(backupData.searches) ? backupData.searches : [];
    user.notes = Array.isArray(backupData.notes) ? backupData.notes : [];
    user.settings = backupData.settings && typeof backupData.settings === 'object' ? backupData.settings : {};
  } else {
    const merged = mergeUserBackupCollections(user, backupData);
    user.bookmarks = merged.bookmarks;
    user.history = merged.history;
    user.searches = merged.searches || [];
    user.notes = merged.notes || [];
    user.settings = merged.settings || {};
  }

  saveUserRecord(user);
  return user;
}
