import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import ReaderContextIconRow from '../../src/components/ReaderContextIconRow';

test('reader quick-action row uses Otzaria source order and exact Fluent regular glyphs', () => {
  const html = renderToStaticMarkup(createElement(ReaderContextIconRow, {
    firstItemRef: null,
    hasSelection: true,
    onSearchAllBooks: () => {},
    onCopySelection: () => {},
    onAddNote: () => {},
    directLinkItems: [],
    onCopyDirectLink: () => {},
  }));

  const icons = [...html.matchAll(/data-icon="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(icons, [
    'fluent-library-24-regular',
    'fluent-copy-24-regular',
    'fluent-note-add-24-regular',
  ]);

  const labels = ['>חיפוש</span>', '>העתקה</span>', '>הערה</span>', '>קישור</span>'];
  const positions = labels.map((label) => html.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.match(html, /fill="currentColor"/);
});