import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Tab } from '../../src/types';
import { filterOpenTabs, tabSearchLabel } from '../../src/utils/tabSearch';

const tabs: Tab[] = [
  { id: '1', kind: 'book', bookId: 1, title: 'בראשית', line: 0 },
  { id: '2', kind: 'search', title: 'חיפוש', query: 'חסד ואמת' },
  { id: '3', kind: 'tzurat-hadaf', bookId: 2, title: 'ברכות', tractate: 'ברכות', daf: 2, amud: 'a' },
  { id: '4', kind: 'book', bookId: 3, title: 'Genesis', line: 0 },
];

test('empty search keeps every tab in its existing order', () => {
  assert.deepEqual(filterOpenTabs(tabs, '  ', 'he').map((tab) => tab.id), ['1', '2', '3', '4']);
});

test('search finds book names, queries, and page-layout tabs', () => {
  assert.deepEqual(filterOpenTabs(tabs, 'בר', 'he').map((tab) => tab.id), ['1', '3']);
  assert.deepEqual(filterOpenTabs(tabs, ' אמת ', 'he').map((tab) => tab.id), ['2']);
  assert.deepEqual(filterOpenTabs(tabs, 'GEN', 'en').map((tab) => tab.id), ['4']);
  assert.deepEqual(filterOpenTabs(tabs, 'missing', 'en'), []);
});

test('search tab labels use the selected interface language', () => {
  assert.equal(tabSearchLabel(tabs[1], 'he'), 'חיפוש: חסד ואמת');
  assert.equal(tabSearchLabel(tabs[1], 'en'), 'Search: חסד ואמת');
  assert.deepEqual(filterOpenTabs(tabs, 'search', 'en').map((tab) => tab.id), ['2']);
});
