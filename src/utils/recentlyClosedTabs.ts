import type { Tab } from '../types';

export interface RecentlyClosedTabEntry {
  tab: Tab;
  originalIndex: number;
}

export const MAX_RECENTLY_CLOSED_TABS = 10;

export function rememberRecentlyClosedTab(
  entries: readonly RecentlyClosedTabEntry[],
  tab: Tab,
  originalIndex: number,
): RecentlyClosedTabEntry[] {
  return [...entries, { tab, originalIndex }].slice(-MAX_RECENTLY_CLOSED_TABS);
}

export function takeRecentlyClosedTab(
  entries: readonly RecentlyClosedTabEntry[],
  tabId: string,
): { entries: RecentlyClosedTabEntry[]; entry: RecentlyClosedTabEntry | null } {
  const index = entries.findIndex((entry) => entry.tab.id === tabId);
  if (index < 0) return { entries: [...entries], entry: null };
  return {
    entries: entries.filter((_, currentIndex) => currentIndex !== index),
    entry: entries[index],
  };
}

export function listRecentlyClosedTabs(entries: readonly RecentlyClosedTabEntry[]): Tab[] {
  return [...entries].reverse().map((entry) => entry.tab);
}

export function insertRestoredTab(
  tabs: readonly Tab[],
  entry: RecentlyClosedTabEntry,
  restoredTab: Tab,
): Tab[] {
  const requestedIndex = Number.isFinite(entry.originalIndex) ? Math.trunc(entry.originalIndex) : tabs.length;
  const index = Math.max(0, Math.min(requestedIndex, tabs.length));
  return [...tabs.slice(0, index), restoredTab, ...tabs.slice(index)];
}
