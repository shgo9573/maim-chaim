import assert from 'node:assert/strict';
import test from 'node:test';
import { EXCLUDED_BOOK_NOTICE, rememberExcludedBookId } from '../../src/utils/bookFilter';
import { planReaderLinkOpen } from '../../src/utils/readerLinkOpen';
import type { BookItem } from '../../src/types';

function book(id: number | string, title: string, categoryPath = 'תנ"ך/תורה'): BookItem {
  return { id, title, categoryPath } as BookItem;
}

const LIBRARY = [book(1, 'בראשית'), book(2, 'שמות'), book(3, 'ספר החינוך')];

test('book link resolves a unique catalogue title to line 1', () => {
  const plan = planReaderLinkOpen('book://בראשית', LIBRARY);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') {
    assert.equal(plan.book.id, 1);
    assert.equal(plan.line, 1);
    assert.equal(plan.target.kind, 'book');
  }
});

test('book link resolution trims titles on both sides', () => {
  const plan = planReaderLinkOpen('book://%20%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA%20', LIBRARY);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') assert.equal(plan.book.id, 1);
});

test('book link with duplicate titles is reported as ambiguous', () => {
  const plan = planReaderLinkOpen('book://בראשית', [book(1, 'בראשית'), book(9, 'בראשית')]);
  assert.equal(plan.status, 'ambiguous');
  if (plan.status === 'ambiguous') {
    assert.equal(plan.title, 'בראשית');
    assert.equal(plan.message, 'הקישור אינו חד-משמעי: נמצאו כמה ספרים בעלי אותו שם');
  }
});

test('book link without any match reports the missing-title message', () => {
  const plan = planReaderLinkOpen('book://מגילת אסתר', LIBRARY);
  assert.equal(plan.status, 'missing');
  if (plan.status === 'missing') assert.equal(plan.message, 'הספר "מגילת אסתר" לא נמצא בספרייה');
});

test('excluded books do not count as catalogue matches', () => {
  rememberExcludedBookId(4);
  const plan = planReaderLinkOpen('book://ספר חסום', [book(4, 'ספר חסום')]);
  assert.equal(plan.status, 'missing');
});

test('an excluded duplicate still leaves the remaining title resolvable', () => {
  rememberExcludedBookId(5);
  const plan = planReaderLinkOpen('book://בראשית', [book(5, 'בראשית'), book(1, 'בראשית')]);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') assert.equal(plan.book.id, 1);
});

test('inline-book link resolves with its requested line', () => {
  const href = 'otzaria://inline-link?path=%2Flib%2F%D7%A1%D7%A4%D7%A8%20%D7%94%D7%97%D7%99%D7%A0%D7%95%D7%9A.txt&index=7&ref=%D7%A9%D7%A2%D7%A8%201';
  const plan = planReaderLinkOpen(href, LIBRARY);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') {
    assert.equal(plan.book.id, 3);
    assert.equal(plan.line, 7);
  }
});

test('book-id link resolves by catalogue id and carries the line parameter', () => {
  const plan = planReaderLinkOpen('otzaria://open/book/2?line=12', LIBRARY);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') {
    assert.equal(plan.book.id, 2);
    assert.equal(plan.line, 12);
  }
});

test('book-id link without a line parameter defaults to line 1', () => {
  const plan = planReaderLinkOpen('otzaria://open/book/2', LIBRARY);
  assert.equal(plan.status, 'resolved');
  if (plan.status === 'resolved') assert.equal(plan.line, 1);
});

test('unknown book-id reports the target-book-unavailable message', () => {
  const plan = planReaderLinkOpen('otzaria://open/book/999', LIBRARY);
  assert.equal(plan.status, 'missing');
  if (plan.status === 'missing') assert.equal(plan.message, 'ספר היעד של הקישור אינו זמין בספרייה');
});

test('a book-id that points to an excluded book reports the exclusion notice', () => {
  rememberExcludedBookId(4);
  const plan = planReaderLinkOpen('otzaria://open/book/4', [book(4, 'ספר חסום')]);
  assert.equal(plan.status, 'excluded');
  if (plan.status === 'excluded') assert.equal(plan.message, EXCLUDED_BOOK_NOTICE);
});

test('planning without a catalogue defers the decision to the component', () => {
  const plan = planReaderLinkOpen('book://בראשית', null);
  assert.equal(plan.status, 'library-unavailable');
});

test('external links stay external and anchors stay anchors', () => {
  const http = planReaderLinkOpen('https://he.wikisource.org/wiki/Bereshit', LIBRARY);
  assert.equal(http.status, 'external');
  if (http.status === 'external') assert.equal(http.href, 'https://he.wikisource.org/wiki/Bereshit');

  const anchor = planReaderLinkOpen('#%D7%A4%D7%A8%D7%A7%20%D7%90#%D7%90', LIBRARY);
  assert.equal(anchor.status, 'anchor');
  if (anchor.status === 'anchor') assert.deepEqual(anchor.target.headings, ['פרק א', 'א']);
});

test('unsupported and dangerous schemes are rejected with a message', () => {
  const javascript = planReaderLinkOpen('javascript:alert(1)', LIBRARY);
  assert.equal(javascript.status, 'unsupported');
  if (javascript.status === 'unsupported') assert.equal(javascript.message, 'הקישור אינו נתמך');

  const empty = planReaderLinkOpen('', LIBRARY);
  assert.equal(empty.status, 'unsupported');
});
