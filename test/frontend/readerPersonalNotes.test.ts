import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReaderPersonalNoteHref,
  decorateReaderLineWithPersonalNotes,
  groupReaderPersonalNotes,
  parseReaderPersonalNoteHref,
  selectReaderPersonalNotesForPreview,
} from '../../src/utils/readerPersonalNotes';

const note = (id: string, bookId: string | number, line: number, text = 'הערה') => ({
  id,
  bookId,
  line,
  text,
  updatedAt: '2026-11-25T10:00:00.000Z',
});

test('groups only notes for the selected book and zero-based line', () => {
  const grouped = groupReaderPersonalNotes([
    note('a', 7, 0),
    note('b', '7', 0),
    note('c', 8, 0),
    note('d', 7, -1),
    note('', 7, 1),
    note('e', 7, 1, ' '),
  ], '7');
  assert.deepEqual(grouped.get(0)?.map((item) => item.id), ['a', 'b']);
  assert.equal(grouped.has(1), false);
});

test('builds and parses a safe deep note URL with repeated IDs', () => {
  const href = buildReaderPersonalNoteHref(12, ['note one', 'x&y', 'note one']);
  assert.equal(href, 'otzaria://note?line=12&id=note%20one&id=x%26y');
  assert.deepEqual(parseReaderPersonalNoteHref(href!), { line: 12, ids: ['note one', 'x&y'] });
});

test('rejects unsupported, malformed and negative note URLs', () => {
  assert.equal(parseReaderPersonalNoteHref('https://example.com/?line=1'), null);
  assert.equal(parseReaderPersonalNoteHref('otzaria://book-note?line=1'), null);
  assert.equal(parseReaderPersonalNoteHref('otzaria://note?line=-1'), null);
  assert.equal(parseReaderPersonalNoteHref('otzaria://note?line=1.5'), null);
  assert.equal(parseReaderPersonalNoteHref('otzaria://note?id=x'), null);
});

test('selects only the notes referenced by the clicked line and IDs', () => {
  const notes = [note('a', 7, 2), note('b', 7, 2), note('c', 7, 3)];
  assert.deepEqual(selectReaderPersonalNotesForPreview(notes, { line: 2, ids: ['b'] }).map((item) => item.id), ['b']);
  assert.deepEqual(selectReaderPersonalNotesForPreview(notes, { line: 2, ids: [] }).map((item) => item.id), ['a', 'b']);
});

test('wraps text nodes with note links without nesting existing anchors', () => {
  const html = '<p>פתיחה <a href="book://target">קישור קיים</a> <b>סיום</b></p>';
  const result = decorateReaderLineWithPersonalNotes(html, 4, [note('a&b', 7, 4)]);
  assert.match(result, /<a class="reader-personal-note-link" href="otzaria:\/\/note\?line=4&amp;id=a%26b"/);
  assert.match(result, /<a href="book:\/\/target">קישור קיים<\/a>/);
  assert.equal((result.match(/class="reader-personal-note-link"/g) || []).length, 2);
  assert.equal((result.match(/<a /g) || []).length, 3);
});

test('preserves HTML when no notes or no text outside existing links', () => {
  const html = '<p><a href="book://target">יעד</a></p>';
  assert.equal(decorateReaderLineWithPersonalNotes(html, 0, []), html);
  assert.equal(decorateReaderLineWithPersonalNotes(html, 0, [note('a', 7, 0)]), html);
});
