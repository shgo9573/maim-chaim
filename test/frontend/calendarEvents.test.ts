import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalendarEvent } from '../../src/types';
import {
  calendarEventOccursOn,
  listCalendarEventEntries,
  nextCalendarEventOccurrence,
  normalizeCalendarEvents,
  parseCalendarDate,
  validateCalendarEventDraft,
} from '../../src/utils/calendarEvents';

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'event-1',
  title: 'שיעור קבוע',
  description: '',
  startDate: '2026-11-27',
  recurrence: 'none',
  createdAt: '2026-11-20T10:00:00.000Z',
  ...overrides,
});

test('parses only real local Gregorian date keys', () => {
  assert.equal(parseCalendarDate('2026-11-27')?.getDate(), 27);
  assert.equal(parseCalendarDate('2026-02-30'), null);
  assert.equal(parseCalendarDate('27-11-2026'), null);
  assert.equal(parseCalendarDate(undefined), null);
});

test('one-time events include every day in their inclusive date range', () => {
  const event = makeEvent({
    endDate: '2026-11-29',
  });

  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 27)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 28)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 29)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 30)), false);
});

test('weekly recurrence supports selected weekdays and multi-day occurrences', () => {
  const event = makeEvent({
    endDate: '2026-11-28',
    recurrence: 'weekly',
    weeklyDays: [0, 3],
  });

  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 27)), false);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 29)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 11, 2)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 11, 3)), false);
});

test('monthly Gregorian recurrence skips months without the original day number', () => {
  const event = makeEvent({
    startDate: '2026-01-31',
    recurrence: 'monthlyGregorian',
  });

  assert.equal(calendarEventOccursOn(event, new Date(2026, 1, 28)), false);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 2, 31)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 3, 30)), false);
});

test('annual Gregorian recurrence handles leap-day events without shifting the date', () => {
  const event = makeEvent({
    startDate: '2024-02-29',
    recurrence: 'annualGregorian',
  });

  assert.equal(calendarEventOccursOn(event, new Date(2025, 1, 28)), false);
  assert.equal(calendarEventOccursOn(event, new Date(2028, 1, 29)), true);
});

test('recurrence end date limits occurrence starts but not the last occurrence duration', () => {
  const event = makeEvent({
    endDate: '2026-11-28',
    recurrence: 'weekly',
    recurrenceUntil: '2026-11-27',
  });

  assert.equal(calendarEventOccursOn(event, new Date(2026, 10, 28)), true);
  assert.equal(calendarEventOccursOn(event, new Date(2026, 11, 4)), false);
});

test('finds the next upcoming occurrence and returns null after a one-time event', () => {
  const weekly = makeEvent({ recurrence: 'weekly' });
  const once = makeEvent({ startDate: '2026-11-20' });

  assert.equal(
    nextCalendarEventOccurrence(weekly, new Date(2026, 10, 28))?.getDate(),
    4,
  );
  assert.equal(
    nextCalendarEventOccurrence(once, new Date(2026, 10, 28)),
    null,
  );
});

test('day, upcoming and all views are sorted and searchable by title or description', () => {
  const events = [
    makeEvent({
      id: 'later',
      title: 'שיעור ערב',
      startDate: '2026-11-27',
      startTime: '19:00',
    }),
    makeEvent({
      id: 'all-day',
      title: 'יום עיון',
      startDate: '2026-11-27',
      description: 'מפגש מנחה',
    }),
    makeEvent({
      id: 'future',
      title: 'שיעור בוקר',
      startDate: '2026-11-30',
      startTime: '08:00',
    }),
  ];
  const today = new Date(2026, 10, 27);

  assert.deepEqual(
    listCalendarEventEntries(events, 'day', today, today).map((entry) => entry.event.id),
    ['all-day', 'later'],
  );
  assert.deepEqual(
    listCalendarEventEntries(events, 'upcoming', today, today).map((entry) => entry.event.id),
    ['all-day', 'later', 'future'],
  );
  assert.deepEqual(
    listCalendarEventEntries(events, 'all', today, today, 'מנחה').map((entry) => entry.event.id),
    ['all-day'],
  );
});

test('validates title, dates, times and recurrence duration', () => {
  assert.match(
    validateCalendarEventDraft(makeEvent({ title: '   ' })) ?? '',
    /כותרת/,
  );
  assert.match(
    validateCalendarEventDraft(makeEvent({ endDate: '2026-11-26' })) ?? '',
    /לפני/,
  );
  assert.match(
    validateCalendarEventDraft(makeEvent({ startTime: '18:00', endTime: '17:00' })) ?? '',
    /מאוחרת/,
  );
  assert.match(
    validateCalendarEventDraft(
      makeEvent({
        recurrence: 'weekly',
        endDate: '2026-12-04',
      }),
    ) ?? '',
    /קצר/,
  );
  assert.equal(validateCalendarEventDraft(makeEvent()), null);
});

test('normalizes persisted settings and drops malformed event records', () => {
  const events = normalizeCalendarEvents([
    makeEvent(),
    { id: 'bad', title: '', startDate: '2026-11-27' },
    { id: 'bad-date', title: 'פגום', startDate: '2026-02-30' },
    null,
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'event-1');
  assert.equal(normalizeCalendarEvents(null).length, 0);
});
