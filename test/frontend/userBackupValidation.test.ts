import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectUserBackup,
  MAX_USER_BACKUP_FILE_BYTES,
  validateUserBackup,
} from '../../src/utils/userBackup';

function validBackup() {
  return {
    version: '2.0.0',
    type: 'otzaria_web_user_backup',
    exportedAt: '2026-11-22T12:00:00.000Z',
    bookmarks: [
      { id: 'bm-1', bookId: 1, bookTitle: 'בראשית', lineIndex: 4, textSnippet: 'בראשית ברא' },
    ],
    history: [
      { id: 'history-1', bookId: 1, bookTitle: 'בראשית', lastReadAt: '2026-11-22T11:00:00.000Z' },
    ],
    searches: [
      { id: 'search-1', query: 'שמע ישראל', searchedAt: '2026-11-22T10:00:00.000Z' },
    ],
    notes: [
      { id: 'note-1', bookId: 1, bookTitle: 'בראשית', noteContent: 'חידוש', updatedAt: '2026-11-22T09:00:00.000Z' },
    ],
    settings: {
      theme: 'dark',
      personalNotes: [{ id: 'personal-1', bookId: 1, line: 4, text: 'הערה' }],
      customStudies: [{ id: 'study-1', name: 'סדר לימוד' }],
      hiddenHistoryIds: ['hidden-1'],
    },
  };
}

test('valid Web backup preview counts every exported collection', () => {
  const result = inspectUserBackup(validBackup());
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(result.summary.counts, {
    bookmarks: 1,
    history: 1,
    searches: 1,
    notes: 1,
    personalNotes: 1,
    customStudies: 1,
    total: 6,
  });
  assert.deepEqual(result.summary.missingSections, []);
  assert.equal(result.summary.exportedAt, '2026-11-22T12:00:00.000Z');
});

test('partial backups can be merged but cannot replace complete user data', () => {
  const partial = {
    version: '2.0.0',
    type: 'otzaria_web_user_backup',
    bookmarks: [],
  };

  assert.equal(validateUserBackup(partial, 'merge').valid, true);
  const replace = validateUserBackup(partial, 'replace');
  assert.equal(replace.valid, false);
  if (!replace.valid) assert.match(replace.error, /הגיבוי חלקי/);
});

test('desktop Otzaria backups are rejected before any data is restored', () => {
  const desktopBackup = {
    version: '2.0',
    origin: 'manual',
    includes: { settings: true, bookmarks: true },
    bookmarks: [],
  };

  const result = inspectUserBackup(desktopBackup);
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /גיבוי של תוכנת אוצריא השולחנית/);
});

test('a different backup type is rejected', () => {
  const result = inspectUserBackup({ ...validBackup(), type: 'unrelated-data' });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /אינו גיבוי של אוצריא Web/);
});

test('unsupported versions and non-object JSON are rejected', () => {
  assert.equal(inspectUserBackup(null).valid, false);
  const result = inspectUserBackup({ ...validBackup(), version: '9.0.0' });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /גרסת הגיבוי/);
});

test('malformed rows and settings cannot enter the restore pipeline', () => {
  const malformedBookmark = inspectUserBackup({
    ...validBackup(),
    bookmarks: [{ bookId: 1, bookTitle: 'בראשית', lineIndex: -1 }],
  });
  assert.equal(malformedBookmark.valid, false);

  const malformedSettings = inspectUserBackup({
    ...validBackup(),
    settings: { hiddenHistoryIds: ['ok', 3] },
  });
  assert.equal(malformedSettings.valid, false);
});

test('legacy Web backup without the explicit type is recognized safely', () => {
  const backup = validBackup();
  delete (backup as Partial<typeof backup>).type;
  const result = inspectUserBackup(backup);
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.summary.isLegacy, true);
});

test('the upload size cap matches the server JSON body limit', () => {
  assert.equal(MAX_USER_BACKUP_FILE_BYTES, 50 * 1024 * 1024);
});
