import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLibraryBookContextMenuAction,
  reconcileLibraryBookSelection,
  shouldOfferTextOpenContextAction,
  selectLibraryBookRange,
  toggleLibraryBookSelection,
} from '../../src/utils/libraryContextMenu';

test('context menu switches between add and remove selection labels', () => {
  assert.equal(getLibraryBookContextMenuAction(false).label, 'הוסף לבחירה');
  assert.equal(getLibraryBookContextMenuAction(true).label, 'הסר מהבחירה');
  assert.equal(getLibraryBookContextMenuAction(false, 'en').label, 'Add to selection');
});

test('selection toggle adds and removes an ID without changing the order of other books', () => {
  assert.deepEqual(toggleLibraryBookSelection(['10', '20'], 30), ['10', '20', '30']);
  assert.deepEqual(toggleLibraryBookSelection(['10', '20', '30'], '20'), ['10', '30']);
});

test('shift range adds all visible books between anchor and target', () => {
  assert.deepEqual(
    selectLibraryBookRange(['90'], ['10', '20', '30', '40'], '20', '40'),
    ['90', '20', '30', '40'],
  );
  assert.deepEqual(
    selectLibraryBookRange([], ['10', '20', '30'], '30', '10'),
    ['10', '20', '30'],
  );
});

test('missing range anchor selects only the target and does not discard prior selections', () => {
  assert.deepEqual(
    selectLibraryBookRange(['90'], ['10', '20'], 'outside', '20'),
    ['90', '20'],
  );
});

test('selection reconciliation drops books that disappeared from the library', () => {
  assert.deepEqual(reconcileLibraryBookSelection(['10', '20', '30'], ['10', '30', '40']), ['10', '30']);
});

test('text-open context action is limited to text books in Bavli seder categories', () => {
  assert.equal(
    shouldOfferTextOpenContextAction({ categoryPath: 'תלמוד בבלי/סדר זרעים', fileType: 'text' }),
    true,
  );
  assert.equal(
    shouldOfferTextOpenContextAction({ categoryPath: 'תלמוד בבלי, סדר מועד/מסכת ברכות' }),
    true,
  );
  assert.equal(
    shouldOfferTextOpenContextAction({ categoryPath: 'תלמוד בבלי/ראשונים/רש"י' }),
    false,
  );
  assert.equal(
    shouldOfferTextOpenContextAction({ categoryPath: 'תורה/סדר זרעים' }),
    false,
  );
  assert.equal(
    shouldOfferTextOpenContextAction({ categoryPath: 'תלמוד בבלי/סדר זרעים', fileType: 'pdf' }),
    false,
  );
});
