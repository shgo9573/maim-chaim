import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findAcronymMatches,
  isLikelyAcronym,
  normalizeAcronymLookupKey,
  summarizeAcronymMeaning,
} from '../../src/utils/readerAcronymLookup';
import { ACRONYMS_DICTIONARY } from '../../src/data/acronyms';

test('acronym lookup runs only when an acronym mark is present', () => {
  assert.equal(isLikelyAcronym('רש"י'), true);
  assert.equal(isLikelyAcronym('רש׳י'), true);
  assert.equal(isLikelyAcronym('תלמוד בבלי'), false);
  assert.equal(isLikelyAcronym(''), false);
  assert.equal(isLikelyAcronym(undefined), false);
});

test('normalization collapses quote variants, nikud and decorations', () => {
  assert.equal(normalizeAcronymLookupKey('רש"י'), 'רשי');
  assert.equal(normalizeAcronymLookupKey('רש׳י'), 'רשי');
  assert.equal(normalizeAcronymLookupKey('רש״י'), 'רשי');
  assert.equal(normalizeAcronymLookupKey('רַשָׁ"י'), 'רשי');
  assert.equal(normalizeAcronymLookupKey('"רש"י"'), 'רשי');
  assert.equal(normalizeAcronymLookupKey('  רש"י  '), 'רשי');
  assert.equal(normalizeAcronymLookupKey('משנ"ברורה,'), 'משנברורה');
});

test('exact acronym match returns the original key and meaning', () => {
  const matches = findAcronymMatches('רש"י');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].acronym, 'רש"י');
  assert.equal(matches[0].meaning, ACRONYMS_DICTIONARY['רש"י']);
});

test('a single-quote written acronym matches the double-quote dictionary key', () => {
  const matches = findAcronymMatches("רש'י");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].acronym, 'רש"י');
});

test('nikud inside the selection does not break the match', () => {
  const matches = findAcronymMatches('חֲזַ"ל');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].acronym, 'חז"ל');
});

test('prefix expansion offers shorter acronyms first and skips non-matching keys', () => {
  const testDictionary: Record<string, string> = {
    'רש"י': 'רבי שלמה יצחקי',
    'רש"י השלם': 'פירוש רש"י השלם',
    'רמב"ם': 'רבי משה בן מיימון',
  };
  const matches = findAcronymMatches('רש"י ה', testDictionary);
  assert.deepEqual(matches.map((entry) => entry.acronym), ['רש"י השלם']);
  const partial = findAcronymMatches('ר', testDictionary);
  // A single-letter query is too short for expansion, per the source behavior.
  assert.deepEqual(partial, []);
  const two = findAcronymMatches('רש', testDictionary);
  assert.deepEqual(two.map((entry) => entry.acronym), ['רש"י', 'רש"י השלם']);
});

test('unknown acronyms and plain words yield no matches', () => {
  assert.deepEqual(findAcronymMatches('אבג"ד'), []);
  assert.deepEqual(findAcronymMatches('הארץ'), []);
  assert.deepEqual(findAcronymMatches(''), []);
});

test('meaning summary compacts whitespace and caps length', () => {
  assert.equal(summarizeAcronymMeaning('  רבי   שלמה  יצחקי '), 'רבי שלמה יצחקי');
  const long = 'א'.repeat(120);
  const summarized = summarizeAcronymMeaning(long);
  assert.equal(summarized.length, 90);
  assert.ok(summarized.endsWith('…'));
});
