import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeUserBackupCollections } from '../../src/services/userStore';

function emptyUser() {
  return {
    bookmarks: [] as Array<{
      id: string;
      bookId: number | string;
      bookTitle: string;
      lineIndex: number;
      textSnippet: string;
      createdAt: string;
    }>,
    history: [] as Array<{
      id: string;
      bookId: number | string;
      bookTitle: string;
      lastReadAt: string;
    }>,
    searches: [] as Array<{
      id: string;
      query: string;
      category?: string;
      searchedAt: string;
    }>,
    notes: [] as Array<{
      id: string;
      bookId: number | string;
      noteContent: string;
      updatedAt: string;
    }>,
    settings: {} as Record<string, any>,
  };
}

test('backup merge keeps local preferences and imports missing settings', () => {
  const local = emptyUser();
  local.settings = { theme: 'dark', fontSize: 22 };

  const merged = mergeUserBackupCollections(local, {
    settings: { theme: 'sepia', fontSize: 18, lineHeight: 1.8 },
  });

  assert.deepEqual(merged.settings, {
    theme: 'dark',
    fontSize: 22,
    lineHeight: 1.8,
  });
});

test('backup merge adds personal notes and preserves the newer local copy', () => {
  const local = emptyUser();
  local.settings.personalNotes = [
    { id: 'same', bookId: 1, line: 10, text: 'עריכה מקומית', updatedAt: '2026-05-01T10:00:00.000Z' },
    { id: 'local-only', bookId: 2, line: 4, text: 'מקומית בלבד', updatedAt: '2026-05-02T10:00:00.000Z' },
  ];

  const merged = mergeUserBackupCollections(local, {
    settings: {
      personalNotes: [
        { id: 'same', bookId: 1, line: 10, text: 'עותק ישן', updatedAt: '2026-04-01T10:00:00.000Z' },
        { id: 'backup-only', bookId: 3, line: 7, text: 'הערה מהגיבוי', updatedAt: '2026-04-03T10:00:00.000Z' },
      ],
    },
  });

  assert.equal(merged.settings?.personalNotes.length, 3);
  assert.equal(merged.settings?.personalNotes.find((note: any) => note.id === 'same')?.text, 'עריכה מקומית');
  assert.ok(merged.settings?.personalNotes.some((note: any) => note.id === 'backup-only'));
});

test('a newer backed-up personal note can recover an edit made on another device', () => {
  const local = emptyUser();
  local.settings.personalNotes = [
    { id: 'same', bookId: 1, line: 10, text: 'עותק מקומי ישן', updatedAt: '2026-04-01T10:00:00.000Z' },
  ];

  const merged = mergeUserBackupCollections(local, {
    settings: {
      personalNotes: [
        { id: 'same', bookId: 1, line: 10, text: 'עותק גיבוי חדש', updatedAt: '2026-06-01T10:00:00.000Z' },
      ],
    },
  });

  assert.equal(merged.settings?.personalNotes.length, 1);
  assert.equal(merged.settings?.personalNotes[0].text, 'עותק גיבוי חדש');
});

test('legacy notes and recent searches are merged without losing local records', () => {
  const local = emptyUser();
  local.notes = [
    { id: 'note-1', bookId: 1, noteContent: 'הערה מקומית עדכנית', updatedAt: '2026-06-01T10:00:00.000Z' },
  ];
  local.searches = [
    { id: 'search-1', query: 'שמע', category: 'תנ״ך', searchedAt: '2026-06-01T10:00:00.000Z' },
  ];

  const merged = mergeUserBackupCollections(local, {
    notes: [
      { id: 'note-1', bookId: 1, noteContent: 'הערה ישנה', updatedAt: '2026-05-01T10:00:00.000Z' },
      { id: 'note-2', bookId: 2, noteContent: 'הערה חדשה', updatedAt: '2026-05-02T10:00:00.000Z' },
    ],
    searches: [
      { id: 'search-2', query: 'שמע', category: 'תנ״ך', searchedAt: '2026-05-01T10:00:00.000Z' },
      { id: 'search-3', query: 'אמת', searchedAt: '2026-05-03T10:00:00.000Z' },
    ],
  });

  assert.equal(merged.notes?.length, 2);
  assert.equal(merged.notes?.find((note) => note.id === 'note-1')?.noteContent, 'הערה מקומית עדכנית');
  assert.equal(merged.searches?.length, 2);
  assert.equal(merged.searches?.find((item) => item.query === 'שמע')?.id, 'search-1');
});

test('bookmarks and history are deduplicated by their actual content identity', () => {
  const local = emptyUser();
  local.bookmarks = [
    { id: 'local-bm', bookId: '12', bookTitle: 'ספר', lineIndex: 8, textSnippet: 'מקומי', createdAt: '2026-01-01' },
  ];
  local.history = [
    { id: 'local-history', bookId: '12', bookTitle: 'ספר', lastReadAt: '2026-06-01' },
  ];

  const merged = mergeUserBackupCollections(local, {
    bookmarks: [
      { id: 'backup-same', bookId: 12, bookTitle: 'ספר', lineIndex: 8, textSnippet: 'כפול', createdAt: '2026-02-01' },
      { id: 'backup-new', bookId: 12, bookTitle: 'ספר', lineIndex: 9, textSnippet: 'חדש', createdAt: '2026-02-02' },
      { id: 'backup-duplicate', bookId: '12', bookTitle: 'ספר', lineIndex: 9, textSnippet: 'כפול בייבוא', createdAt: '2026-02-03' },
    ],
    history: [
      { id: 'backup-same-book', bookId: 12, bookTitle: 'ספר', lastReadAt: '2026-05-01' },
      { id: 'backup-other-book', bookId: 13, bookTitle: 'ספר אחר', lastReadAt: '2026-05-02' },
    ],
  });

  assert.deepEqual(merged.bookmarks.map((item) => item.id), ['local-bm', 'backup-new']);
  assert.deepEqual(merged.history.map((item) => item.id), ['local-history', 'backup-other-book']);
});

test('hidden history IDs are unioned so an import does not unhide removed entries', () => {
  const local = emptyUser();
  local.settings.hiddenHistoryIds = ['hidden-local', 'shared'];

  const merged = mergeUserBackupCollections(local, {
    settings: { hiddenHistoryIds: ['hidden-backup', 'shared'] },
  });

  assert.deepEqual(merged.settings?.hiddenHistoryIds, ['hidden-local', 'shared', 'hidden-backup']);
});

test('re-importing the same backup is idempotent', () => {
  const local = emptyUser();
  const backup = {
    bookmarks: [{ id: 'bm', bookId: 1, bookTitle: 'ספר', lineIndex: 4, textSnippet: 'טקסט', createdAt: '2026-01-01' }],
    history: [{ id: 'h', bookId: 1, bookTitle: 'ספר', lastReadAt: '2026-01-01' }],
    searches: [{ id: 's', query: 'אמת', searchedAt: '2026-01-01' }],
    notes: [{ id: 'n', bookId: 1, noteContent: 'הערה', updatedAt: '2026-01-01' }],
    settings: {
      personalNotes: [{ id: 'pn', bookId: 1, line: 4, text: 'חידוש', updatedAt: '2026-01-01' }],
      hiddenHistoryIds: ['hidden'],
    },
  };

  const first = mergeUserBackupCollections(local, backup);
  const second = mergeUserBackupCollections(first, backup);

  assert.deepEqual(second, first);
});
