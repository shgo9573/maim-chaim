import test from 'node:test';
import assert from 'node:assert/strict';

// Small regression tests for the most important pure behavior. These do not make network calls.
const BASE_URL = 'https://otzaria.duckdns.org';
function makeDirectLink(bookId, lineIndex) {
  return `${BASE_URL}/?book=${encodeURIComponent(String(bookId))}&line=${encodeURIComponent(String(lineIndex))}`;
}
function addReaderLinks(value) {
  if (Array.isArray(value)) return value.map(addReaderLinks);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = addReaderLinks(child);
  const bookId = out.bookId ?? out.book_id;
  const lineIndex = out.lineIndex ?? out.line_index;
  if (bookId !== undefined && bookId !== null && lineIndex !== undefined && lineIndex !== null) {
    out.otzariaUrl = makeDirectLink(bookId, lineIndex);
  }
  return out;
}

test('adds direct reader link for camelCase API fields', () => {
  const r = addReaderLinks({ bookId: 12, lineIndex: 34, snippet: 'מקור' });
  assert.equal(r.otzariaUrl, `${BASE_URL}/?book=12&line=34`);
});

test('adds direct reader link for snake_case API fields', () => {
  const r = addReaderLinks({ book_id: '12', line_index: 34 });
  assert.equal(r.otzariaUrl, `${BASE_URL}/?book=12&line=34`);
});

test('does not fabricate links if IDs are absent', () => {
  assert.deepEqual(addReaderLinks({ snippet: 'טקסט' }), { snippet: 'טקסט' });
});

test('adds links recursively to results in arrays', () => {
  const r = addReaderLinks({ results: [{ bookId: 2, lineIndex: 8 }, { book_id: 3, line_index: 9 }] });
  assert.equal(r.results[0].otzariaUrl, `${BASE_URL}/?book=2&line=8`);
  assert.equal(r.results[1].otzariaUrl, `${BASE_URL}/?book=3&line=9`);
});
