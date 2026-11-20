import type { Tab } from '../types';

export type TabContextMenuActionId =
  | 'toggle-pin'
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
  return { ...tab, id, isPinned: false } as Tab;
}

export function tabsAfter(tabs: readonly Tab[], tabId: string): Tab[] {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  return index < 0 ? [] : tabs.slice(index + 1);
}

export function tabsAfterClosable(tabs: readonly Tab[], tabId: string): Tab[] {
  return tabsAfter(tabs, tabId).filter((tab) => !tab.isPinned);
}

export function tabsToCloseAll(tabs: readonly Tab[]): Tab[] {
  return tabs.filter((tab) => !tab.isPinned);
}

export function tabsOtherThan(tabs: readonly Tab[], tabId: string): Tab[] {
  return tabs.filter((tab) => tab.id !== tabId);
}

/** Returns the other tabs that Otzaria's close-others action is allowed to close. */
export function tabsOtherThanClosable(tabs: readonly Tab[], tabId: string): Tab[] {
  return tabs.filter((tab) => tab.id !== tabId && !tab.isPinned);
}

export function getTabContextMenuActions(
  tabs: readonly Tab[],
  tabId: string,
  language: 'he' | 'en',
  selectedTabIds: readonly string[] = [],
): TabContextMenuAction[] {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return [];

  const english = language === 'en';
  const selectedCount = selectedTabIds.filter((id) => tabs.some((item) => item.id === id)).length;
  const closesSelection = selectedCount > 1 && selectedTabIds.includes(tabId);
  const after = tabsAfterClosable(tabs, tabId);
  return [
    {
      id: 'toggle-pin',
      label: tab.isPinned
        ? (english ? 'Unpin tab' : 'בטל הצמדת כרטיסיה')
        : (english ? 'Pin tab' : 'הצמד כרטיסיה'),
    },
    {
      id: 'close',
      label: closesSelection
        ? (english ? `Close ${selectedCount} tabs` : `סגור ${selectedCount} כרטיסיות`)
        : (english ? 'Close tab' : 'סגור לשונית'),
    },
    {
      id: 'close-all',
      label: english ? 'Close all tabs' : 'סגור את כל הלשוניות',
      disabled: tabsToCloseAll(tabs).length === 0,
    },
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
