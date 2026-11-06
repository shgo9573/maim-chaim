import { AnalyticsStatsResponse } from './analyticsStore';

const PERSISTENT_UID_KEY = 'otzaria_persistent_uid';

/**
 * Returns or creates a permanent anonymous client UID
 * Resilient against cookie clearing by checking LocalStorage, SessionStorage, and Cookie
 */
export function getPersistentClientUid(): string {
  try {
    // 1. Check LocalStorage
    let uid = localStorage.getItem(PERSISTENT_UID_KEY);
    if (uid && /^[a-zA-Z0-9_-]{10,64}$/.test(uid)) {
      return uid;
    }

    // 2. Check Cookie
    const match = document.cookie.match(/(?:^|;\s*)otzaria_uid=([^;]+)/);
    if (match && match[1] && /^[a-zA-Z0-9_-]{10,64}$/.test(match[1])) {
      uid = match[1];
      localStorage.setItem(PERSISTENT_UID_KEY, uid);
      return uid;
    }

    // 3. Generate high-entropy ID
    const randomHex = Math.random().toString(36).substring(2, 12);
    const timeHex = Date.now().toString(36);
    uid = `usr_${timeHex}_${randomHex}`;

    localStorage.setItem(PERSISTENT_UID_KEY, uid);
    document.cookie = `otzaria_uid=${uid}; Path=/; Max-Age=34560000; SameSite=Lax`;
    return uid;
  } catch {
    return 'anon_' + Date.now();
  }
}

let heartbeatIntervalId: any = null;

/**
 * Starts automatic heartbeat loop for active learner tracking
 */
export function startLearnerHeartbeat(getActiveState: () => {
  bookId?: string | number;
  bookTitle?: string;
  category?: string;
  tabType?: string;
}): () => void {
  const uid = getPersistentClientUid();

  const sendBeat = () => {
    // Only send if page is visible to avoid counting background/sleeping tabs
    if (document.visibilityState !== 'visible') return;

    try {
      const state = getActiveState();
      const payload = {
        uid,
        activeBookId: state.bookId,
        activeBookTitle: state.bookTitle,
        activeCategory: state.category,
        tabType: state.tabType,
        intervalSec: 45
      };

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/heartbeat', blob);
      } else {
        fetch('/api/analytics/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => {});
      }
    } catch {}
  };

  // Immediate first beat
  sendBeat();

  // Run every 45s
  if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
  heartbeatIntervalId = setInterval(sendBeat, 45000);

  // Send beat when visibility returns
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      sendBeat();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

/**
 * Fetch real-time analytics stats from the backend
 */
export async function fetchAnalyticsStats(): Promise<AnalyticsStatsResponse | null> {
  try {
    const res = await fetch('/api/analytics/stats');
    if (res.ok) {
      return (await res.json()) as AnalyticsStatsResponse;
    }
  } catch (err: any) {
    console.warn('[AnalyticsService] Failed to fetch stats:', err.message);
  }
  return null;
}
