import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const stylesheet = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('Tailwind scans the tab-search component so its overlay utilities are emitted', () => {
  assert.match(stylesheet, /@source "\.\/components\/TabSearch\.tsx";/);
});

test('Tailwind scans the measurement converter component so its controls are styled', () => {
  assert.ok(stylesheet.includes('@source "./components/MeasurementConverter.tsx";'));
});


test('Tailwind scans the Shamor Vezachor component so its controls are styled', () => {
  assert.ok(stylesheet.includes('@source "./components/ShamorZachor.tsx";'));
});
