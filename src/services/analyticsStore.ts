import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ActiveLearner {
  uid: string;
  lastSeen: number;
  activeBookId?: string | number;
  activeBookTitle?: string;
  activeCategory?: string;
  tabType?: string;
  ipHash: string;
}

export interface AnalyticsStatsResponse {
  onlineNow: number;
  dau: number;
  mau: number;
  totalUniqueUsers: number;
  totalStudyMinutes: number;
  topBooks: Array<{ title: string; category?: string; count: number; minutes: number }>;
  categoryBreakdown: Array<{ name: string; count: number; percentage: number }>;
  hourlyDistribution: number[]; // 24 hours (0-23)
  lastUpdated: string;
}

interface PersistentAnalyticsData {
  dauMap: Record<string, string[]>; // dateStr -> array of uids
  mauMap: Record<string, string[]>; // monthStr -> array of uids
  allTimeUids: string[];
  totalStudySeconds: number;
  bookStats: Record<string, { title: string; category?: string; sessions: number; seconds: number }>;
  categoryStats: Record<string, number>;
  hourlyCounts: number[]; // length 24
}

const DATA_DIR = fs.existsSync('/var/data/otzaria')
  ? '/var/data/otzaria/analytics'
  : path.resolve(process.cwd(), 'data/analytics');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// In-memory active learners (heartbeats in last 150s)
const activeLearners = new Map<string, ActiveLearner>();

function loadPersistentData(): PersistentAnalyticsData {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          dauMap: parsed.dauMap || {},
          mauMap: parsed.mauMap || {},
          allTimeUids: Array.isArray(parsed.allTimeUids) ? parsed.allTimeUids : [],
          totalStudySeconds: parsed.totalStudySeconds || 0,
          bookStats: parsed.bookStats || {},
          categoryStats: parsed.categoryStats || {},
          hourlyCounts: Array.isArray(parsed.hourlyCounts) && parsed.hourlyCounts.length === 24
            ? parsed.hourlyCounts
            : new Array(24).fill(0)
        };
      }
    }
  } catch (err: any) {
    console.warn('[AnalyticsStore] Failed to load stats file:', err.message);
  }

  return {
    dauMap: {},
    mauMap: {},
    allTimeUids: [],
    totalStudySeconds: 0,
    bookStats: {},
    categoryStats: {},
    hourlyCounts: new Array(24).fill(0)
  };
}

let storeData: PersistentAnalyticsData = loadPersistentData();
let saveTimeout: NodeJS.Timeout | null = null;

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      const tmp = `${STATS_FILE}.tmp_${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(storeData, null, 2), 'utf-8');
      fs.renameSync(tmp, STATS_FILE);
    } catch (err: any) {
      console.warn('[AnalyticsStore] Failed to save stats file:', err.message);
    }
  }, 5000);
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getMonthString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function hashIp(ip?: string): string {
  if (!ip) return 'anon';
  return crypto.createHash('sha256').update(ip + '_otzaria_salt').digest('hex').substring(0, 16);
}

/**
 * Record a heartbeat from a client
 */
export function recordHeartbeat(params: {
  uid: string;
  ip?: string;
  activeBookId?: string | number;
  activeBookTitle?: string;
  activeCategory?: string;
  tabType?: string;
  intervalSec?: number;
}): void {
  const now = Date.now();
  const interval = Math.min(Math.max(params.intervalSec || 45, 10), 180);
  const ipHash = hashIp(params.ip);

  // Update active online map
  activeLearners.set(params.uid, {
    uid: params.uid,
    lastSeen: now,
    activeBookId: params.activeBookId,
    activeBookTitle: params.activeBookTitle,
    activeCategory: params.activeCategory,
    tabType: params.tabType,
    ipHash
  });

  const today = getTodayString();
  const month = getMonthString();
  const hour = new Date().getUTCHours();

  // 1. DAU Tracking
  if (!storeData.dauMap[today]) {
    storeData.dauMap[today] = [];
    // Clean old DAU records older than 60 days
    const keys = Object.keys(storeData.dauMap);
    if (keys.length > 60) {
      keys.sort().slice(0, keys.length - 60).forEach(k => delete storeData.dauMap[k]);
    }
  }
  if (!storeData.dauMap[today].includes(params.uid)) {
    storeData.dauMap[today].push(params.uid);
  }

  // 2. MAU Tracking
  if (!storeData.mauMap[month]) {
    storeData.mauMap[month] = [];
    const mKeys = Object.keys(storeData.mauMap);
    if (mKeys.length > 24) {
      mKeys.sort().slice(0, mKeys.length - 24).forEach(k => delete storeData.mauMap[k]);
    }
  }
  if (!storeData.mauMap[month].includes(params.uid)) {
    storeData.mauMap[month].push(params.uid);
  }

  // 3. All-time unique UIDs
  if (!storeData.allTimeUids.includes(params.uid)) {
    storeData.allTimeUids.push(params.uid);
  }

  // 4. Study Duration
  storeData.totalStudySeconds += interval;

  // 5. Hourly distribution
  if (storeData.hourlyCounts && storeData.hourlyCounts.length === 24) {
    storeData.hourlyCounts[hour] = (storeData.hourlyCounts[hour] || 0) + 1;
  }

  // 6. Book & Category stats
  if (params.activeBookTitle) {
    const bKey = params.activeBookTitle.trim();
    if (!storeData.bookStats[bKey]) {
      storeData.bookStats[bKey] = {
        title: bKey,
        category: params.activeCategory,
        sessions: 0,
        seconds: 0
      };
    }
    storeData.bookStats[bKey].seconds += interval;
    storeData.bookStats[bKey].sessions += 1;
  }

  if (params.activeCategory) {
    const cKey = params.activeCategory.trim();
    storeData.categoryStats[cKey] = (storeData.categoryStats[cKey] || 0) + interval;
  }

  scheduleSave();
}

/**
 * Get comprehensive analytics statistics
 */
export function getAnalyticsStats(): AnalyticsStatsResponse {
  const now = Date.now();
  const threshold = now - 150000; // 2.5 minutes

  // Clean inactive learners
  for (const [uid, learner] of activeLearners.entries()) {
    if (learner.lastSeen < threshold) {
      activeLearners.delete(uid);
    }
  }

  const today = getTodayString();
  const month = getMonthString();

  const onlineNow = Math.max(activeLearners.size, 1); // at least current viewer
  const dau = Math.max((storeData.dauMap[today] || []).length, onlineNow);
  const mau = Math.max((storeData.mauMap[month] || []).length, dau);
  const totalUniqueUsers = Math.max(storeData.allTimeUids.length, mau);
  const totalStudyMinutes = Math.round(storeData.totalStudySeconds / 60);

  // Top books
  const topBooks = Object.values(storeData.bookStats)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)
    .map(b => ({
      title: b.title,
      category: b.category,
      count: b.sessions,
      minutes: Math.round(b.seconds / 60)
    }));

  // Category breakdown
  const catEntries = Object.entries(storeData.categoryStats);
  const totalCatSeconds = catEntries.reduce((acc, [, sec]) => acc + sec, 0);

  const categoryBreakdown = catEntries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, sec]) => ({
      name,
      count: Math.round(sec / 60),
      percentage: totalCatSeconds > 0 ? Math.round((sec / totalCatSeconds) * 100) : 0
    }));

  return {
    onlineNow,
    dau,
    mau,
    totalUniqueUsers,
    totalStudyMinutes,
    topBooks,
    categoryBreakdown,
    hourlyDistribution: storeData.hourlyCounts,
    lastUpdated: new Date().toISOString()
  };
}
