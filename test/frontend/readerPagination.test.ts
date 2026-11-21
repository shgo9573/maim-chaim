import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getInitialReaderRange,
  INITIAL_READER_LINES_BEFORE_TARGET,
  INITIAL_READER_WINDOW_SIZE,
} from '../../src/utils/readerPagination';

test('initial reader request is capped at 150 lines from the beginning', () => {
  assert.deepEqual(getInitialReaderRange(1), { start: 1, end: 150 });
});

test('initial reader request keeps the target line inside a 150-line window', () => {
  const range = getInitialReaderRange(500);
  assert.deepEqual(range, { start: 440, end: 589 });
  assert.ok(range.start <= 500 && range.end >= 500);
  assert.equal(range.end - range.start + 1, INITIAL_READER_WINDOW_SIZE);
});

test('near-start jumps do not request a negative or zero line', () => {
  assert.deepEqual(getInitialReaderRange(61), { start: 1, end: 150 });
  assert.deepEqual(getInitialReaderRange(62), { start: 2, end: 151 });
});

test('invalid targets safely fall back to the first reader window', () => {
  assert.deepEqual(getInitialReaderRange(Number.NaN), { start: 1, end: 150 });
  assert.deepEqual(getInitialReaderRange(0), { start: 1, end: 150 });
  assert.deepEqual(getInitialReaderRange(-8), { start: 1, end: 150 });
});

test('the initial window never exceeds the configured request limit', () => {
  for (const target of [1, 2, 60, 61, 62, 150, 1000, 100000]) {
    const range = getInitialReaderRange(target);
    assert.ok(range.start >= 1);
    assert.ok(range.start <= target);
    assert.ok(range.end >= target);
    assert.equal(range.end - range.start + 1, 150);
    assert.ok(range.end - range.start + 1 <= INITIAL_READER_WINDOW_SIZE);
    assert.ok(target - range.start <= INITIAL_READER_LINES_BEFORE_TARGET);
  }
});
