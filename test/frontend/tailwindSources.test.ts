import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const stylesheet = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('Tailwind scans the tab-search component so its overlay utilities are emitted', () => {
  assert.match(stylesheet, /@source "\.\/components\/TabSearch\.tsx";/);
});
