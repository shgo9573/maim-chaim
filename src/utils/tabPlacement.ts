/** Inserts a newly opened tab immediately after the active tab without mutating the input array. */
export function insertTabAdjacent<T extends { id: string }>(
  tabs: T[],
  tab: T,
  activeTabId: string | null,
): T[] {
  const activeIndex = activeTabId ? tabs.findIndex((item) => item.id === activeTabId) : -1;
  const insertAt = activeIndex >= 0 ? activeIndex + 1 : tabs.length;
  return [...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)];
}
