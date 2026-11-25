import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isReaderExternalWebHref,
  parseReaderLinkTarget,
  readerLinkCanOpenInBackground,
  sanitizeReaderHref,
} from '../../src/utils/readerLinks';

test('parses a book link with a hierarchical table-of-contents target', () => {
  assert.deepEqual(
    parseReaderLinkTarget('book://ברכות#דף ב#עמוד א'),
    { kind: 'book', title: 'ברכות', headings: ['דף ב', 'עמוד א'] },
  );
});

test('decodes encoded book titles and headings without splitting encoded separators', () => {
  assert.deepEqual(
    parseReaderLinkTarget('book://%D7%91%D7%A8%D7%9B%D7%95%D7%AA#%D7%93%D7%A3%20%D7%91'),
    { kind: 'book', title: 'ברכות', headings: ['דף ב'] },
  );
});

test('parses character-based inline links using their one-based source line', () => {
  assert.deepEqual(
    parseReaderLinkTarget('otzaria://inline-link?path=%2Fbooks%2F%D7%91%D7%A8%D7%9B%D7%95%D7%AA.txt&index=42&ref=%D7%91%D7%A8%D7%9B%D7%95%D7%AA%20%D7%ב'),
    { kind: 'inline-book', title: 'ברכות', line: 42, reference: 'ברכות ב' },
  );
});

test('parses direct book IDs but deliberately rejects direct PDF links', () => {
  assert.deepEqual(
    parseReaderLinkTarget('otzaria://open/book/8154?line=17'),
    { kind: 'book-id', id: '8154', line: 17 },
  );
  assert.equal(parseReaderLinkTarget('otzaria://open/pdf/8154'), null);
});

test('keeps local anchors and classifies them as in-page navigation', () => {
  assert.deepEqual(parseReaderLinkTarget('#footnote-12'), { kind: 'anchor', anchor: 'footnote-12' });
  assert.equal(readerLinkCanOpenInBackground(parseReaderLinkTarget('#footnote-12')), false);
});

test('allows only safe external browser schemes', () => {
  assert.equal(parseReaderLinkTarget('https://example.org/path')?.kind, 'external');
  assert.equal(isReaderExternalWebHref('https://example.org/path'), true);
  assert.equal(parseReaderLinkTarget('mailto:help@example.org')?.kind, 'external');
  assert.equal(parseReaderLinkTarget('tel:+972501234567')?.kind, 'external');
  assert.equal(parseReaderLinkTarget('javascript:alert(1)'), null);
  assert.equal(parseReaderLinkTarget('data:text/html,hello'), null);
  assert.equal(parseReaderLinkTarget('file:///etc/passwd'), null);
  assert.equal(parseReaderLinkTarget('otzaria://open/pdf/8154'), null);
});

test('sanitizer preserves supported links and removes unsupported schemes', () => {
  assert.equal(sanitizeReaderHref('book://ברכות'), 'book://ברכות');
  assert.equal(sanitizeReaderHref('#footnote-1'), '#footnote-1');
  assert.equal(sanitizeReaderHref('https://example.org'), 'https://example.org');
  assert.equal(sanitizeReaderHref('javascript:alert(1)'), null);
  assert.equal(sanitizeReaderHref('otzaria://open/pdf/8154'), null);
});

test('only cross-book targets can be opened in the background', () => {
  assert.equal(readerLinkCanOpenInBackground(parseReaderLinkTarget('book://ברכות')), true);
  assert.equal(readerLinkCanOpenInBackground(parseReaderLinkTarget('otzaria://open/book/8154')), true);
  assert.equal(readerLinkCanOpenInBackground(parseReaderLinkTarget('https://example.org')), false);
  assert.equal(readerLinkCanOpenInBackground(null), false);
});
