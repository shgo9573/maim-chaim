import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_READER_NAVIGATION_DEPTH,
  normalizeReaderNavigationHistory,
  recordReaderNavigation,
  travelReaderNavigation,
} from '../../src/utils/readerNavigationHistory';

test('explicit navigation records the previous line and clears forward history', () => {
  const history = recordReaderNavigation({ back: [3], forward: [90] }, 12, 40);
  assert.deepEqual(history, { back: [3, 12], forward: [] });
});

test('same-line and invalid jumps do not add history or clear the forward stack', () => {
  const original = { back: [4], forward: [30] };
  assert.deepEqual(recordReaderNavigation(original, 12, 12), original);
  assert.deepEqual(recordReaderNavigation(original, 0, 50), original);
  assert.deepEqual(recordReaderNavigation(original, 12, Number.NaN), original);
});

test('back and forward restore each other without recording duplicate current lines', () => {
  const afterJump = recordReaderNavigation({ back: [], forward: [] }, 12, 40);
  const back = travelReaderNavigation(afterJump, 40, 'back');
  assert.ok(back);
  assert.equal(back.line, 12);
  assert.deepEqual(back.history, { back: [], forward: [40] });

  const forward = travelReaderNavigation(back.history, 12, 'forward');
  assert.ok(forward);
  assert.equal(forward.line, 40);
  assert.deepEqual(forward.history, { back: [12], forward: [] });
});

test('a new jump after going back removes the abandoned forward path', () => {
  const first = recordReaderNavigation(null, 10, 20);
  const back = travelReaderNavigation(first, 20, 'back');
  assert.ok(back);
  const branched = recordReaderNavigation(back.history, back.line, 35);
  assert.deepEqual(branched, { back: [10, 12], forward: [] });
});

test('history is bounded to the most recent persisted destinations', () => {
  let history = normalizeReaderNavigationHistory(null);
  for (let line = 1; line <= MAX_READER_NAVIGATION_DEPTH + 8; line++) {
    history = recordReaderNavigation(history, line, line + 1);
  }
  assert.equal(history.back.length, MAX_READER_NAVIGATION_DEPTH);
  assert.deepEqual(history.back, Array.from({ length: MAX_READER_NAVIGATION_DEPTH }, (_, i) => i + 9));
});

test('malformed persisted history is sanitized and can be JSON restored', () => {
  const normalized = normalizeReaderNavigationHistory({
    back: [1, 'bad', 2, 2, -1, 3],
    forward: 'not-an-array',
  });
  assert.deepEqual(normalized, { back: [1, 2, 3], forward: [] });
  assert.deepEqual(normalizeReaderNavigationHistory(JSON.parse(JSON.stringify(normalized))), normalized);
});

test('travel with no destination returns null', () => {
  assert.equal(travelReaderNavigation({ back: [], forward: [] }, 12, 'back'), null);
});
