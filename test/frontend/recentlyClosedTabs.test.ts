import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Tab } from '../../src/types';
import {
  insertRestoredTab,
  listRecentlyClosedTabs,
  rememberRecentlyClosedTab,
  takeRecentlyClosedTab,
  type RecentlyClosedTabEntry,
} from '../../src/utils/recentlyClosedTabs';

const makeTab = (id: string): Tab => ({ id, kind: 'book', bookId: id, title: id, line: 0 });

test('keeps only the ten most recently closed tabs and lists newest first', () => {
  let entries: RecentlyClosedTabEntry[] = [];
  for (let index = 1; index <= 12; index += 1) {
    entries = rememberRecentlyClosedTab(entries, makeTab(String(index)), index - 1);
  }
  assert.equal(entries.length, 10);
  assert.deepEqual(listRecentlyClosedTabs(entries).map((tab) => tab.id), [
    '12', '11', '10', '9', '8', '7', '6', '5', '4', '3',
  ]);
});

test('takes one selected closed tab without changing the remaining order', () => {
  let entries: RecentlyClosedTabEntry[] = [];
  entries = rememberRecentlyClosedTab(entries, makeTab('a'), 0);
  entries = rememberRecentlyClosedTab(entries, makeTab('b'), 1);
  entries = rememberRecentlyClosedTab(entries, makeTab('c'), 2);

  const taken = takeRecentlyClosedTab(entries, 'b');
  assert.equal(taken.entry?.tab.id, 'b');
  assert.deepEqual(listRecentlyClosedTabs(taken.entries).map((tab) => tab.id), ['c', 'a']);
  assert.equal(takeRecentlyClosedTab(entries, 'missing').entry, null);
});

test('restores tabs to their original index, clamped to the current list', () => {
  const entry = { tab: makeTab('b'), originalIndex: 1 };
  const restored = { ...entry.tab, id: 'b-restored' };
  assert.deepEqual(
    insertRestoredTab([makeTab('a'), makeTab('c')], entry, restored).map((tab) => tab.id),
    ['a', 'b-restored', 'c'],
  );
  assert.deepEqual(
    insertRestoredTab([makeTab('x')], { ...entry, originalIndex: 99 }, restored).map((tab) => tab.id),
    ['x', 'b-restored'],
  );
});

test('closing all tabs from right to left and restoring LIFO returns the original order', () => {
  const original = [makeTab('a'), makeTab('b'), makeTab('c')];
  let entries: RecentlyClosedTabEntry[] = [];
  for (let index = original.length - 1; index >= 0; index -= 1) {
    entries = rememberRecentlyClosedTab(entries, original[index], index);
  }
  let restored: Tab[] = [];
  while (entries.length) {
    const last = entries[entries.length - 1];
    const taken = takeRecentlyClosedTab(entries, last.tab.id);
    assert.ok(taken.entry);
    entries = taken.entries;
    restored = insertRestoredTab(restored, taken.entry!, { ...taken.entry!.tab, id: `${taken.entry!.tab.id}-new` });
  }
  assert.deepEqual(restored.map((tab) => tab.title), ['a', 'b', 'c']);
});
