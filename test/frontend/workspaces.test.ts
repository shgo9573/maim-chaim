import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tab, Workspace } from '../../src/types';
import {
  cloneWorkspaceTabs,
  moveTabsBetweenWorkspaces,
  normalizeWorkspaceList,
  snapshotWorkspace,
  uniqueWorkspaceName,
  validateWorkspaceName,
} from '../../src/utils/workspaces';

const book: Tab = { id: 'book-1', kind: 'book', bookId: 7, title: 'בראשית', line: 12 };
const search: Tab = { id: 'search-1', kind: 'search', title: 'חיפוש', query: 'שמע' };
const daf: Tab = { id: 'daf-1', kind: 'tzurat-hadaf', title: 'צורת הדף', bookId: 9, tractate: 'ברכות', daf: 4, amud: 'b' };
const first: Workspace = { id: 'first', name: 'שולחן עבודה 1', tabs: [book, search, daf], activeTabId: 'search-1', isPinned: false };
const second: Workspace = { id: 'second', name: 'לימוד', tabs: [], activeTabId: null, isPinned: false };

test('unique workspace names choose the first unused default number', () => {
  assert.equal(uniqueWorkspaceName([first]), 'שולחן עבודה 2');
  assert.equal(uniqueWorkspaceName([{ ...first, name: 'שולחן עבודה 1' }, { ...second, name: 'שולחן עבודה 3' }]), 'שולחן עבודה 2');
});

test('workspace names reject empty, long, and duplicate values but allow the current name', () => {
  assert.equal(validateWorkspaceName('   ', [first]), 'empty');
  assert.equal(validateWorkspaceName('א'.repeat(61), [first]), 'too-long');
  assert.equal(validateWorkspaceName('  לימוד  ', [first, second], 'first'), 'duplicate');
  assert.equal(validateWorkspaceName('שולחן עבודה 1', [first], 'first'), null);
});

test('workspace normalization ignores malformed entries and repairs the active tab id', () => {
  const normalized = normalizeWorkspaceList([
    { ...first, activeTabId: 'missing' },
    { id: 'first', name: 'duplicate id', tabs: [], activeTabId: null },
    { id: 'bad', name: 'bad', tabs: [{ id: 'x', kind: 'unknown' }] },
    null,
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].activeTabId, 'book-1');
  assert.deepEqual(normalized[1].tabs, []);
});

test('snapshot clones tab data and keeps a valid active tab', () => {
  const snapshot = snapshotWorkspace(first, [book, daf], 'missing');
  assert.deepEqual(snapshot.tabs.map((tab) => tab.id), ['book-1', 'daf-1']);
  assert.equal(snapshot.activeTabId, 'book-1');
  assert.notEqual(snapshot.tabs, first.tabs);
  assert.notEqual(snapshot.tabs[0], first.tabs[0]);
  assert.deepEqual(cloneWorkspaceTabs([book]), [book]);
});

test('moving a selected group updates the source snapshot and appends tabs to the target', () => {
  const result = moveTabsBetweenWorkspaces([first, second], 'first', [book, search, daf], 'search-1', ['search-1', 'daf-1'], 'second');
  assert.ok(result);
  assert.deepEqual(result.remainingTabs.map((tab) => tab.id), ['book-1']);
  assert.equal(result.nextActiveTabId, 'book-1');
  assert.deepEqual(result.movedTabs.map((tab) => tab.id), ['search-1', 'daf-1']);
  assert.deepEqual(result.workspaces[0].tabs.map((tab) => tab.id), ['book-1']);
  assert.equal(result.workspaces[0].activeTabId, 'book-1');
  assert.deepEqual(result.workspaces[1].tabs.map((tab) => tab.id), ['search-1', 'daf-1']);
});

test('moving from a pinned source leaves its frozen snapshot intact', () => {
  const pinned = { ...first, isPinned: true };
  const result = moveTabsBetweenWorkspaces([pinned, second], 'first', [book, search, daf], 'search-1', ['search-1'], 'second');
  assert.ok(result);
  assert.deepEqual(result.remainingTabs.map((tab) => tab.id), ['book-1', 'daf-1']);
  assert.deepEqual(result.workspaces[0].tabs.map((tab) => tab.id), ['book-1', 'search-1', 'daf-1']);
  assert.deepEqual(result.workspaces[1].tabs.map((tab) => tab.id), ['search-1']);
});

test('moving to an unknown workspace or moving the active workspace to itself is rejected', () => {
  assert.equal(moveTabsBetweenWorkspaces([first], 'first', [book], 'book-1', ['book-1'], 'missing'), null);
  assert.equal(moveTabsBetweenWorkspaces([first], 'first', [book], 'book-1', ['book-1'], 'first'), null);
  assert.equal(moveTabsBetweenWorkspaces([first, second], 'first', [book], 'book-1', ['missing'], 'second'), null);
});
