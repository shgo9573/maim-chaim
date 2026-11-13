import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tab } from '../../src/types';
import { listRecentlyClosedTabs, rememberRecentlyClosedTab } from '../../src/utils/recentlyClosedTabs';
import {
  duplicateTabWithId,
  getTabContextMenuActions,
  planTabClose,
  tabsAfter,
  tabsOtherThan,
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
  let entries = [];
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
});

test('tabs after the current tab follow the stored tab order', () => {
  assert.deepEqual(tabsAfter(tabs, 'search-1').map((tab) => tab.id), ['daf-1']);
  assert.deepEqual(tabsAfter(tabs, 'daf-1'), []);
  assert.deepEqual(tabsAfter(tabs, 'missing'), []);
});

test('other tabs exclude only the selected tab', () => {
  assert.deepEqual(tabsOtherThan(tabs, 'search-1').map((tab) => tab.id), ['book-1', 'daf-1']);
});

test('context menu uses RTL/LTR direction for the close-after label', () => {
  const rtl = getTabContextMenuActions(tabs, 'book-1', 'he');
  const ltr = getTabContextMenuActions(tabs, 'book-1', 'en');
  assert.equal(rtl.find((action) => action.id === 'close-after')?.label, 'סגור כרטיסיות משמאל');
  assert.equal(ltr.find((action) => action.id === 'close-after')?.label, 'Close tabs to the right');
  assert.equal(getTabContextMenuActions(tabs, 'daf-1', 'he').some((action) => action.id === 'close-after'), false);
  assert.deepEqual(getTabContextMenuActions(tabs, 'missing', 'he'), []);
});
