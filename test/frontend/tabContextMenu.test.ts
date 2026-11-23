import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tab } from '../../src/types';
import { listRecentlyClosedTabs, rememberRecentlyClosedTab } from '../../src/utils/recentlyClosedTabs';
import {
  duplicateTabWithId,
  getTabContextMenuActions,
  moveTabInOrder,
  planTabClose,
  tabsAfter,
  tabsAfterClosable,
  tabsOtherThan,
  tabsOtherThanClosable,
  tabsToCloseAll,
} from '../../src/utils/tabContextMenu';

const bookTab: Tab = {
  id: 'book-1',
  kind: 'book',
  bookId: 7,
  title: 'ספר א',
  line: 12,
};
const searchTab: Tab = {
  id: 'search-1',
  kind: 'search',
  title: 'חיפוש',
  query: 'מילה',
};
const dafTab: Tab = {
  id: 'daf-1',
  kind: 'tzurat-hadaf',
  title: 'צורת הדף',
  bookId: 9,
  tractate: 'ברכות',
  daf: 4,
  amud: 'b',
};
const tabs: Tab[] = [bookTab, searchTab, dafTab];

test('close plan records the requested tabs and selects the next visible tab', () => {
  const plan = planTabClose(tabs, 'search-1', ['book-1', 'search-1']);
  assert.deepEqual(plan.closing.map((entry) => [entry.tab.id, entry.originalIndex]), [
    ['book-1', 0],
    ['search-1', 1],
  ]);
  assert.deepEqual(plan.remaining.map((tab) => tab.id), ['daf-1']);
  assert.equal(plan.nextActiveTabId, 'daf-1');
});

test('batch close keeps recently closed tabs in their original visible order', () => {
  const plan = planTabClose(tabs, 'search-1', ['book-1', 'search-1']);
  let entries: ReturnType<typeof rememberRecentlyClosedTab> = [];
  for (const entry of [...plan.closing].reverse()) {
    entries = rememberRecentlyClosedTab(entries, entry.tab, entry.originalIndex);
  }
  assert.deepEqual(listRecentlyClosedTabs(entries).map((tab) => tab.id), ['book-1', 'search-1']);
});

test('closing every tab leaves no active tab', () => {
  const plan = planTabClose(tabs, 'daf-1', tabs.map((tab) => tab.id));
  assert.deepEqual(plan.remaining, []);
  assert.equal(plan.nextActiveTabId, null);
});

test('close plan preserves the active tab when it is not being closed', () => {
  const plan = planTabClose(tabs, 'daf-1', ['book-1']);
  assert.equal(plan.nextActiveTabId, 'daf-1');
  assert.deepEqual(plan.remaining.map((tab) => tab.id), ['search-1', 'daf-1']);
});

test('unknown close ids leave tabs and active tab unchanged', () => {
  const plan = planTabClose(tabs, 'book-1', ['missing']);
  assert.deepEqual(plan.remaining, tabs);
  assert.deepEqual(plan.closing, []);
  assert.equal(plan.nextActiveTabId, 'book-1');
});

test('duplicate preserves the tab kind and data while assigning a new id', () => {
  for (const tab of tabs) {
    const duplicate = duplicateTabWithId(tab, tab.id + '-copy');
    assert.equal(duplicate.id, tab.id + '-copy');
    assert.equal(duplicate.kind, tab.kind);
    assert.notEqual(duplicate, tab);
    assert.equal(duplicate.title, tab.title);
  }
  assert.equal(duplicateTabWithId(bookTab, 'copy').line, 12);
  assert.equal(duplicateTabWithId(searchTab, 'copy').query, 'מילה');
  assert.equal(duplicateTabWithId(dafTab, 'copy').amud, 'b');
  assert.equal(duplicateTabWithId({ ...bookTab, isPinned: true }, 'copy').isPinned, false);
});

test('tabs after the current tab follow the stored tab order', () => {
  assert.deepEqual(tabsAfter(tabs, 'search-1').map((tab) => tab.id), ['daf-1']);
  assert.deepEqual(tabsAfter(tabs, 'daf-1'), []);
  assert.deepEqual(tabsAfter(tabs, 'missing'), []);
});

test('other tabs exclude only the selected tab', () => {
  assert.deepEqual(tabsOtherThan(tabs, 'search-1').map((tab) => tab.id), ['book-1', 'daf-1']);
});

test('close other tabs preserves every pinned tab', () => {
  const pinnedSearch: Tab = { ...searchTab, isPinned: true };
  const pinnedDaf: Tab = { ...dafTab, isPinned: true };
  const mixedTabs = [bookTab, pinnedSearch, pinnedDaf];
  assert.deepEqual(tabsOtherThanClosable(mixedTabs, 'book-1').map((tab) => tab.id), []);
  assert.deepEqual(tabsOtherThanClosable([bookTab, pinnedSearch, dafTab], 'book-1').map((tab) => tab.id), ['daf-1']);
});

test('context menu closes the whole selected group when the clicked tab is selected', () => {
  const selectedRtl = getTabContextMenuActions(tabs, 'search-1', 'he', ['book-1', 'search-1']);
  const selectedLtr = getTabContextMenuActions(tabs, 'search-1', 'en', ['book-1', 'search-1']);
  const unselected = getTabContextMenuActions(tabs, 'search-1', 'he', ['book-1', 'daf-1']);
  assert.equal(selectedRtl.find((action) => action.id === 'close')?.label, 'סגור 2 כרטיסיות');
  assert.equal(selectedLtr.find((action) => action.id === 'close')?.label, 'Close 2 tabs');
  assert.equal(unselected.find((action) => action.id === 'close')?.label, 'סגור לשונית');
});

test('context menu uses RTL/LTR direction for the close-after label', () => {
  const rtl = getTabContextMenuActions(tabs, 'book-1', 'he');
  const ltr = getTabContextMenuActions(tabs, 'book-1', 'en');
  assert.equal(rtl.find((action) => action.id === 'close-after')?.label, 'סגור כרטיסיות משמאל');
  assert.equal(ltr.find((action) => action.id === 'close-after')?.label, 'Close tabs to the right');
  assert.equal(getTabContextMenuActions(tabs, 'daf-1', 'he').some((action) => action.id === 'close-after'), false);
  assert.deepEqual(getTabContextMenuActions(tabs, 'missing', 'he'), []);
});


test('pin action reflects the current tab state and is the first menu action', () => {
  const unpinned = getTabContextMenuActions(tabs, 'book-1', 'he');
  assert.equal(unpinned[0]?.id, 'toggle-pin');
  assert.equal(unpinned[0]?.label, 'הצמד כרטיסיה');

  const pinnedTabs: Tab[] = [{ ...bookTab, isPinned: true }, searchTab];
  const pinned = getTabContextMenuActions(pinnedTabs, 'book-1', 'en');
  assert.equal(pinned[0]?.id, 'toggle-pin');
  assert.equal(pinned[0]?.label, 'Unpin tab');
});

test('close all and close-after skip pinned tabs, and close all disables when every tab is pinned', () => {
  const pinnedSearch: Tab = { ...searchTab, isPinned: true };
  const mixedTabs = [bookTab, pinnedSearch, dafTab];

  assert.deepEqual(tabsToCloseAll(mixedTabs).map((tab) => tab.id), ['book-1', 'daf-1']);
  assert.deepEqual(tabsAfterClosable(mixedTabs, 'book-1').map((tab) => tab.id), ['daf-1']);

  const onlyPinned = [pinnedSearch];
  assert.deepEqual(tabsToCloseAll(onlyPinned), []);
  assert.equal(
    getTabContextMenuActions(onlyPinned, 'search-1', 'he').find((action) => action.id === 'close-all')?.disabled,
    true,
  );
});


test('drag reorder moves tabs before and after a target in stored order', () => {
  assert.deepEqual(moveTabInOrder(tabs, 'book-1', 'daf-1', 'before').map((tab) => tab.id), [
    'search-1', 'book-1', 'daf-1',
  ]);
  assert.deepEqual(moveTabInOrder(tabs, 'daf-1', 'book-1', 'after').map((tab) => tab.id), [
    'book-1', 'daf-1', 'search-1',
  ]);
  assert.deepEqual(moveTabInOrder(tabs, 'daf-1', 'book-1', 'before').map((tab) => tab.id), [
    'daf-1', 'book-1', 'search-1',
  ]);
});

test('drag reorder preserves tab data and leaves the order unchanged for invalid targets', () => {
  const moved = moveTabInOrder(tabs, 'search-1', 'daf-1', 'after');
  assert.equal(moved[2], searchTab);
  assert.equal(moved[2].id, 'search-1');
  assert.equal((moved[2] as typeof searchTab).query, 'מילה');
  assert.deepEqual(moveTabInOrder(tabs, 'missing', 'daf-1', 'before').map((tab) => tab.id), [
    'book-1', 'search-1', 'daf-1',
  ]);
  assert.deepEqual(moveTabInOrder(tabs, 'book-1', 'book-1', 'after').map((tab) => tab.id), [
    'book-1', 'search-1', 'daf-1',
  ]);
});
