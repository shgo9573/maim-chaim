import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookItem, CommentaryLink } from '../../src/types';
import {
  findUniqueReaderCommentaryBook,
  groupReaderCommentaryLinks,
} from '../../src/utils/readerCommentaryContextMenu';

const link = (sourceBook: string, line: number): CommentaryLink => ({
  sourceBook,
  category: 'COMMENTARY',
  line,
  text: 'טקסט מפרש',
});

test('groups duplicate commentator books in first-seen order and preserves the first target line', () => {
  assert.deepEqual(
    groupReaderCommentaryLinks([
      link('רש"י', 18),
      link('רמב"ן', 27),
      link('רש"י', 19),
    ]),
    [
      { title: 'רש"י', line: 18, count: 2 },
      { title: 'רמב"ן', line: 27, count: 1 },
    ],
  );
});

test('ignores empty titles and invalid target lines', () => {
  assert.deepEqual(
    groupReaderCommentaryLinks([
      link(' ', 2),
      link('רש"י', 0),
      link('רמב"ן', Number.NaN),
    ]),
    [],
  );
});

test('resolves only one exact catalogue title', () => {
  const unique = { id: 1, title: 'רש"י', categoryPath: 'מפרשים' } as BookItem;
  const similar = { id: 2, title: 'רש"י על ברכות', categoryPath: 'מפרשים' } as BookItem;
  assert.equal(findUniqueReaderCommentaryBook([unique, similar], 'רש"י'), unique);
  assert.equal(findUniqueReaderCommentaryBook([unique, { ...unique, id: 3 }], 'רש"י'), null);
  assert.equal(findUniqueReaderCommentaryBook([similar], 'רש"י'), null);
  assert.equal(findUniqueReaderCommentaryBook([unique], '  '), null);
});
