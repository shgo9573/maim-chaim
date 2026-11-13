import type { Tab } from '../types';

export type TabContextMenuActionId =
  | 'close'
  | 'close-all'
  | 'close-others'
  | 'close-after'
  | 'duplicate'
  | 'open-tabs';

export interface TabContextMenuAction {
  id: TabContextMenuActionId;
  label: string;
  disabled?: boolean;
}

export interface TabCloseEntry {
  tab: Tab;
  originalIndex: number;
}

export interface TabClosePlan {
  closing: TabCloseEntry[];
  remaining: Tab[];
  nextActiveTabId: string | null;
}

export function planTabClose(
  tabs: readonly Tab[],
  activeTabId: string | null,
  ids: readonly string[],
): TabClosePlan {
  const requested = new Set(ids);
  const closing: TabCloseEntry[] = [];
  const remaining: Tab[] = [];

  tabs.forEach((tab, originalIndex) => {
    if (requested.has(tab.id)) closing.push({ tab, originalIndex });
    else remaining.push(tab);
  });

  if (closing.length === 0) {
    return {
      closing,
      remaining: [...tabs],
      nextActiveTabId: activeTabId,
    };
  }

  if (activeTabId === null || !requested.has(activeTabId)) {
    return { closing, remaining, nextActiveTabId: activeTabId };
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  return {
    closing,
    remaining,
    nextActiveTabId: remaining[Math.min(activeIndex, remaining.length - 1)]?.id ?? null,
  };
}

export function duplicateTabWithId(tab: Tab, id: string): Tab {
  return { ...tab, id } as Tab;
}

export function tabsAfter(tabs: readonly Tab[], tabId: string): Tab[] {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  return index < 0 ? [] : tabs.slice(index + 1);
}

export function tabsOtherThan(tabs: readonly Tab[], tabId: string): Tab[] {
  return tabs.filter((tab) => tab.id !== tabId);
}

export function getTabContextMenuActions(
  tabs: readonly Tab[],
  tabId: string,
  language: 'he' | 'en',
): TabContextMenuAction[] {
  if (!tabs.some((tab) => tab.id === tabId)) return [];

  const english = language === 'en';
  const after = tabsAfter(tabs, tabId);
  return [
    { id: 'close', label: english ? 'Close tab' : 'סגור לשונית' },
    { id: 'close-all', label: english ? 'Close all tabs' : 'סגור את כל הלשוניות' },
    {
      id: 'close-others',
      label: english ? 'Close other tabs' : 'סגור את שאר הלשוניות',
      disabled: tabs.length < 2,
    },
    ...(after.length > 0
      ? [{
          id: 'close-after' as const,
          label: english ? 'Close tabs to the right' : 'סגור כרטיסיות משמאל',
        }]
      : []),
    { id: 'duplicate', label: english ? 'Duplicate tab' : 'שכפל לשונית' },
    { id: 'open-tabs', label: english ? 'Open tabs' : 'כרטיסיות פתוחות' },
  ];
}
