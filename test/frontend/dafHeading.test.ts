import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDafHeading, parseDafRef } from '../../src/utils/talmud';

// The library stores daf headings in several shapes depending on the edition.
// Every one of them must resolve, otherwise the whole daf silently loses its
// bubbles (no source lines -> no text match -> nothing on the page).
test('reads daf headings written without gershayim', () => {
  assert.deepEqual(parseDafHeading('דף ב.'), { daf: 2, amud: 'a' });
  assert.deepEqual(parseDafHeading('דף ב:'), { daf: 2, amud: 'b' });
  assert.deepEqual(parseDafHeading('דף מז.'), { daf: 47, amud: 'a' });
  assert.deepEqual(parseDafHeading('דף מז:'), { daf: 47, amud: 'b' });
});

test('reads daf headings written with gershayim', () => {
  assert.deepEqual(parseDafHeading('דף מ״ז.'), { daf: 47, amud: 'a' });
  assert.deepEqual(parseDafHeading('דף מ״ז ע״ב'), { daf: 47, amud: 'b' });
  assert.deepEqual(parseDafHeading('מסכת נדרים דף מ״ז ע״א'), { daf: 47, amud: 'a' });
  assert.deepEqual(parseDafHeading('דף קט״ו:'), { daf: 115, amud: 'b' });
});

test('reads daf headings written with Arabic digits', () => {
  assert.deepEqual(parseDafHeading('דף 47.'), { daf: 47, amud: 'a' });
  assert.deepEqual(parseDafHeading('דף 47 ע״ב'), { daf: 47, amud: 'b' });
});

test('ignores headings which are not daf headings', () => {
  assert.equal(parseDafHeading('פרק חמישי – השותפין'), null);
  assert.equal(parseDafHeading(''), null);
});

test('parseDafRef preserves selected amud from Hebrew page labels', () => {
  assert.deepEqual(parseDafRef('דף כג ע״ב'), { daf: 23, amud: 'b' });
  assert.deepEqual(parseDafRef('דף כ״ג ע״ב'), { daf: 23, amud: 'b' });
  assert.deepEqual(parseDafRef('מסכת נדרים דף מ״ז ע״א'), { daf: 47, amud: 'a' });
  assert.deepEqual(parseDafRef('דף כג ע״א'), { daf: 23, amud: 'a' });
  assert.deepEqual(parseDafRef('דף 23 עמוד ב'), { daf: 23, amud: 'b' });
  assert.deepEqual(parseDafRef('דף 23'), { daf: 23, amud: 'a' });
  assert.deepEqual(parseDafRef('דף כג:'), { daf: 23, amud: 'b' });
  assert.equal(parseDafRef('פרק כג'), null);
});
