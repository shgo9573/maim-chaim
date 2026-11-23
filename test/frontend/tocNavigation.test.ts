import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTocTree,
  filterTocTree,
  flattenVisibleToc,
  getDefaultTocExpansion,
  getTocActiveIndex,
  getTocExpansionForLevel,
  getTocPath,
  getTocTreeDepth,
  getVisibleActiveTocIndex,
} from '../../src/utils/tocNavigation';
import { normalizeHe } from '../../src/utils/text';
import type { TocEntry } from '../../src/types';

const sampleToc: TocEntry[] = [
  { title: 'ספר בדיקה', index: 0, level: 1 },
  { title: 'פרק א', index: 1, level: 2 },
  { title: 'סעיף א', index: 2, level: 3 },
  { title: 'תת סעיף', index: 3, level: 4 },
  { title: 'סעיף ב', index: 4, level: 3 },
  { title: 'פרק ב', index: 10, level: 2 },
  { title: 'סעיף ג', index: 11, level: 3 },
];

const tree = () => buildTocTree(sampleToc, 'ספר בדיקה');

test('TOC tree omits a single book-title root and rebases the section depth', () => {
  const result = tree();
  assert.equal(result.length, 2);
  assert.equal(result[0].entry.title, 'פרק א');
  assert.equal(result[0].depth, 0);
  assert.equal(result[0].children[0].depth, 1);
});

test('default expansion opens top-level sections and the first-child path', () => {
  const expanded = getDefaultTocExpansion(tree());
  assert.deepEqual([...expanded].sort((a, b) => a - b), [1, 2, 10]);
  const rows = flattenVisibleToc(tree(), expanded);
  assert.deepEqual(rows.map((row) => row.node.entry.index), [1, 2, 3, 4, 10, 11]);
});

test('collapse all and expand-to-depth follow the source menu levels', () => {
  const nodes = tree();
  assert.deepEqual([...getTocExpansionForLevel(nodes, 1)], []);
  assert.deepEqual([...getTocExpansionForLevel(nodes, 2)].sort((a, b) => a - b), [1, 10]);
  assert.deepEqual([...getTocExpansionForLevel(nodes, 0)].sort((a, b) => a - b), [1, 2, 10]);
  assert.equal(getTocTreeDepth(nodes), 3);
});

test('TOC search retains ancestors but removes unrelated branches', () => {
  const filtered = filterTocTree(tree(), normalizeHe('תת'), normalizeHe);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].entry.title, 'פרק א');
  assert.equal(filtered[0].children[0].entry.title, 'סעיף א');
  assert.equal(filtered[0].children[0].children[0].entry.title, 'תת סעיף');
  assert.equal(filtered[0].matchesFilter, false);
  assert.equal(filtered[0].children[0].children[0].matchesFilter, true);
});

test('current location resolves to the latest TOC entry and its full ancestor path', () => {
  const nodes = tree();
  assert.equal(getTocActiveIndex(nodes, 3), 3);
  assert.equal(getTocActiveIndex(nodes, 9), 4);
  assert.deepEqual(getTocPath(nodes, 3).map((node) => node.entry.index), [1, 2, 3]);
});

test('when the active entry is hidden, the nearest visible ancestor is selected', () => {
  const nodes = tree();
  const collapsedRows = flattenVisibleToc(nodes, getTocExpansionForLevel(nodes, 1));
  assert.equal(getVisibleActiveTocIndex(collapsedRows, getTocPath(nodes, 3), 3), 1);
  const expandedRows = flattenVisibleToc(nodes, getTocExpansionForLevel(nodes, 0));
  assert.equal(getVisibleActiveTocIndex(expandedRows, getTocPath(nodes, 3), 3), 3);
});

test('a matching branch remains navigable without loading unrelated siblings', () => {
  const filtered = filterTocTree(tree(), normalizeHe('סעיף ג'), normalizeHe);
  const rows = flattenVisibleToc(filtered, getTocExpansionForLevel(filtered, 0));
  assert.deepEqual(rows.map((row) => row.node.entry.index), [10, 11]);
});


test('a single wrapper chain is excluded from the depth menu', () => {
  const singleRoot = buildTocTree([
    { title: 'שורש', index: 0, level: 1 },
    { title: 'פרק', index: 1, level: 2 },
    { title: 'סעיף', index: 2, level: 3 },
  ]);
  assert.equal(getTocTreeDepth(singleRoot), 1);
  assert.deepEqual([...getTocExpansionForLevel(singleRoot, 1)], [0, 1]);
});

test('TOC depth search applies the same normalized 220ms filter target', () => {
  const filtered = filterTocTree(tree(), normalizeHe('תת סעיף'), normalizeHe);
  const rows = flattenVisibleToc(filtered, getTocExpansionForLevel(filtered, 0));
  assert.deepEqual(rows.map((row) => row.node.entry.index), [1, 2, 3]);
});
