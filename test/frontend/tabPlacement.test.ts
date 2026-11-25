import assert from 'node:assert/strict';
import test from 'node:test';
import { insertTabAdjacent } from '../../src/utils/tabPlacement';

test('inserts a new link tab immediately after the active tab', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const result = insertTabAdjacent(tabs, { id: 'new' }, 'b');
  assert.deepEqual(result.map((tab) => tab.id), ['a', 'b', 'new', 'c']);
  assert.deepEqual(tabs.map((tab) => tab.id), ['a', 'b', 'c']);
});

test('appends when there is no active tab in the current workspace', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }];
  const result = insertTabAdjacent(tabs, { id: 'new' }, 'missing');
  assert.deepEqual(result.map((tab) => tab.id), ['a', 'b', 'new']);
});
