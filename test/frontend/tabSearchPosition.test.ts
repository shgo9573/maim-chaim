import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTabSearchPosition } from '../../src/utils/tabSearchPosition';

test('RTL popup aligns its right edge with the anchor and stays inside the viewport', () => {
  const position = calculateTabSearchPosition(
    { left: 280, right: 312, top: 30, bottom: 62 },
    { width: 320, height: 640 },
    'rtl',
  );
  assert.equal(position.width, 304);
  assert.equal(position.left, 8);
  assert.ok(position.top >= 8);
  assert.ok(position.top + position.maxHeight <= 632);
});

test('LTR popup aligns its left edge with the anchor', () => {
  const position = calculateTabSearchPosition(
    { left: 12, right: 44, top: 40, bottom: 72 },
    { width: 900, height: 700 },
    'ltr',
  );
  assert.equal(position.left, 12);
  assert.equal(position.width, 352);
});

test('popup flips above the anchor without overlapping it when enough space exists', () => {
  const anchor = { left: 280, right: 312, top: 300, bottom: 332 };
  const position = calculateTabSearchPosition(anchor, { width: 320, height: 500 }, 'rtl');
  assert.ok(position.top + position.maxHeight <= anchor.top - 4);
});

test('popup flips above near the bottom edge', () => {
  const anchor = { left: 280, right: 312, top: 520, bottom: 552 };
  const position = calculateTabSearchPosition(anchor, { width: 320, height: 600 }, 'rtl');
  assert.ok(position.top < anchor.top);
  assert.ok(position.top + position.maxHeight <= 592);
});

test('very narrow and short viewports never produce negative or overflowing geometry', () => {
  const position = calculateTabSearchPosition(
    { left: 1, right: 20, top: 1, bottom: 20 },
    { width: 40, height: 100 },
    'rtl',
  );
  assert.ok(position.left >= 0);
  assert.ok(position.top >= 0);
  assert.ok(position.width >= 0);
  assert.ok(position.maxHeight >= 0);
  assert.ok(position.left + position.width <= 40);
  assert.ok(position.top + position.maxHeight <= 100);
});
