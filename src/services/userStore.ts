import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
        notes: Array.isArray(data.notes) ? data.notes : []
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
    notes: []
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
    // Merge bookmarks (dedup by bookId + lineIndex)
    if (Array.isArray(backupData.bookmarks)) {
      const existingKeys = new Set(user.bookmarks.map(b => `${b.bookId}_${b.lineIndex}`));
      for (const bm of backupData.bookmarks) {
        if (!existingKeys.has(`${bm.bookId}_${bm.lineIndex}`)) {
          user.bookmarks.push(bm);
        }
      }
    }

    // Merge history (dedup by bookId)
    if (Array.isArray(backupData.history)) {
      const existingBooks = new Set(user.history.map(h => String(h.bookId)));
      for (const h of backupData.history) {
        if (!existingBooks.has(String(h.bookId))) {
          user.history.push(h);
        }
      }
    }

    // Merge settings
    if (backupData.settings && typeof backupData.settings === 'object') {
      user.settings = {
        ...(user.settings || {}),
        ...backupData.settings
      };
    }
  }

  saveUserRecord(user);
  return user;
}
