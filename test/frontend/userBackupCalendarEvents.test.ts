import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectUserBackup } from '../../src/utils/userBackup';

const validEvent = {
  id: 'calendar-event-1',
  title: 'שיעור',
  description: 'שיעור שבועי',
  startDate: '2026-11-27',
  recurrence: 'weekly',
  weeklyDays: [5],
  createdAt: '2026-11-20T10:00:00.000Z',
};

const makeBackup = (calendarEvents: unknown[] = [validEvent]) => ({
  type: 'otzaria_web_user_backup',
  version: '1.0',
  bookmarks: [],
  history: [],
  searches: [],
  notes: [],
  settings: { calendarEvents },
});

test('backup inspection counts calendar events inside user settings', () => {
  const result = inspectUserBackup(makeBackup([validEvent, { ...validEvent, id: 'second' }]));

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.summary.counts.calendarEvents, 2);
  assert.equal(result.summary.counts.total, 2);
});

test('backup inspection rejects malformed calendar event records', () => {
  const result = inspectUserBackup(makeBackup([
    validEvent,
    { ...validEvent, id: 'broken', startDate: '2026-02-30' },
  ]));

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.match(result.error, /אירועי לוח השנה/);
});

test('older backups without calendar events remain valid and report zero', () => {
  const backup = makeBackup([]);
  delete (backup.settings as { calendarEvents?: unknown[] }).calendarEvents;
  const result = inspectUserBackup(backup);

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.summary.counts.calendarEvents, 0);
});
