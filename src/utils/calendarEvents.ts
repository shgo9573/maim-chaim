import type { CalendarEvent, CalendarEventRecurrence } from '../types';
import { normalizeHe } from './text';

export type CalendarEventsView = 'day' | 'upcoming' | 'all';

export interface CalendarEventEntry {
  event: CalendarEvent;
  date: Date;
}

const RECURRENCES = new Set<CalendarEventRecurrence>([
  'none',
  'weekly',
  'monthlyGregorian',
  'annualGregorian',
]);

const MIN_RECURRENCE_DAYS: Partial<Record<CalendarEventRecurrence, number>> = {
  weekly: 7,
  monthlyGregorian: 28,
  annualGregorian: 365,
};

export function calendarDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseCalendarDate(value: string | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayOrdinal(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
  );
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function daysBetween(start: Date, end: Date): number {
  return dayOrdinal(end) - dayOrdinal(start);
}

function validTime(value: string | undefined): boolean {
  if (value === undefined || value === '') return true;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return Boolean(match);
}

function timeMinutes(value: string): number {
  const parts = value.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

export function validateCalendarEventDraft(
  event: CalendarEvent,
): string | null {
  const title = event.title.trim();
  if (!title) return 'יש להזין כותרת לאירוע';
  if (title.length > 120) return 'כותרת האירוע מוגבלת ל־120 תווים';
  if (event.description.length > 2000) {
    return 'תיאור האירוע מוגבל ל־2,000 תווים';
  }

  const start = parseCalendarDate(event.startDate);
  if (!start) return 'תאריך תחילת האירוע אינו תקין';

  const end = event.endDate ? parseCalendarDate(event.endDate) : start;
  if (!end) return 'תאריך סיום האירוע אינו תקין';
  if (daysBetween(start, end) < 0) {
    return 'תאריך הסיום אינו יכול להיות לפני תאריך ההתחלה';
  }

  if (!validTime(event.startTime)) return 'שעת תחילת האירוע אינה תקינה';
  if (!validTime(event.endTime)) return 'שעת סיום האירוע אינה תקינה';
  if (event.endTime && !event.startTime) {
    return 'יש להגדיר שעת התחלה לפני שעת סיום';
  }
  if (
    event.startTime &&
    event.endTime &&
    daysBetween(start, end) === 0 &&
    timeMinutes(event.endTime) <= timeMinutes(event.startTime)
  ) {
    return 'שעת הסיום חייבת להיות מאוחרת משעת ההתחלה';
  }

  if (!RECURRENCES.has(event.recurrence)) {
    return 'סוג החזרה אינו נתמך';
  }

  if (event.weeklyDays?.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return 'בחירת ימי השבוע אינה תקינה';
  }

  if (event.recurrence !== 'none') {
    const until = event.recurrenceUntil
      ? parseCalendarDate(event.recurrenceUntil)
      : null;
    if (event.recurrenceUntil && !until) {
      return 'תאריך סיום החזרה אינו תקין';
    }
    if (until && daysBetween(start, until) < 0) {
      return 'סיום החזרה אינו יכול להיות לפני תחילת האירוע';
    }
    const minimumPeriod = MIN_RECURRENCE_DAYS[event.recurrence] ?? 0;
    if (daysBetween(start, end) >= minimumPeriod) {
      return 'משך אירוע חוזר חייב להיות קצר ממחזור החזרה';
    }
  }

  return null;
}

export function normalizeCalendarEvents(value: unknown): CalendarEvent[] {
  if (!Array.isArray(value)) return [];
  const normalized: CalendarEvent[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.startDate !== 'string'
    ) {
      continue;
    }

    const recurrence =
      typeof item.recurrence === 'string' &&
      RECURRENCES.has(item.recurrence as CalendarEventRecurrence)
        ? (item.recurrence as CalendarEventRecurrence)
        : 'none';

    const event: CalendarEvent = {
      id: item.id,
      title: item.title.trim().slice(0, 120),
      description:
        typeof item.description === 'string'
          ? item.description.slice(0, 2000)
          : '',
      startDate: item.startDate,
      recurrence,
      createdAt:
        typeof item.createdAt === 'string'
          ? item.createdAt
          : '1970-01-01T00:00:00.000Z',
    };

    if (typeof item.endDate === 'string' && item.endDate) {
      event.endDate = item.endDate;
    }
    if (typeof item.startTime === 'string' && item.startTime) {
      event.startTime = item.startTime;
    }
    if (typeof item.endTime === 'string' && item.endTime) {
      event.endTime = item.endTime;
    }
    if (typeof item.recurrenceUntil === 'string' && item.recurrenceUntil) {
      event.recurrenceUntil = item.recurrenceUntil;
    }
    if (Array.isArray(item.weeklyDays)) {
      event.weeklyDays = Array.from(
        new Set(
          item.weeklyDays.filter(
            (day): day is number =>
              typeof day === 'number' &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6,
          ),
        ),
      ).sort((a, b) => a - b);
    }

    if (!validateCalendarEventDraft(event)) normalized.push(event);
  }

  return normalized;
}

function isOccurrenceStart(event: CalendarEvent, candidate: Date, base: Date): boolean {
  switch (event.recurrence) {
    case 'weekly': {
      const days =
        event.weeklyDays && event.weeklyDays.length > 0
          ? event.weeklyDays
          : [base.getDay()];
      return days.includes(candidate.getDay());
    }
    case 'monthlyGregorian':
      return candidate.getDate() === base.getDate();
    case 'annualGregorian':
      return (
        candidate.getMonth() === base.getMonth() &&
        candidate.getDate() === base.getDate()
      );
    case 'none':
      return false;
  }
}

export function calendarEventOccursOn(
  event: CalendarEvent,
  date: Date,
): boolean {
  const base = parseCalendarDate(event.startDate);
  if (!base) return false;
  const day = dateOnly(date);
  if (daysBetween(base, day) < 0) return false;

  const end = event.endDate ? parseCalendarDate(event.endDate) : base;
  if (!end) return false;
  const duration = daysBetween(base, end);

  if (event.recurrence === 'none') {
    return daysBetween(base, day) <= duration;
  }

  const recurrenceUntil = event.recurrenceUntil
    ? parseCalendarDate(event.recurrenceUntil)
    : null;

  // A multi-day occurrence remains visible through its final day, even when
  // that final day falls after the recurrence's last permitted start date.
  for (let offset = 0; offset <= duration; offset++) {
    const occurrenceStart = addDays(day, -offset);
    if (daysBetween(base, occurrenceStart) < 0) break;
    if (
      recurrenceUntil &&
      daysBetween(recurrenceUntil, occurrenceStart) > 0
    ) {
      continue;
    }
    if (isOccurrenceStart(event, occurrenceStart, base)) return true;
  }

  return false;
}

export function nextCalendarEventOccurrence(
  event: CalendarEvent,
  from: Date,
): Date | null {
  const base = parseCalendarDate(event.startDate);
  if (!base) return null;
  const firstDay = dateOnly(from);

  if (calendarEventOccursOn(event, firstDay)) return firstDay;
  if (event.recurrence === 'none') {
    return daysBetween(firstDay, base) > 0 ? base : null;
  }

  const searchStart = daysBetween(firstDay, base) > 0 ? base : firstDay;
  // Ten years covers leap-day annual events and missing month-days without
  // allowing malformed recurrence data to create an unbounded scan.
  for (let offset = 0; offset <= 3660; offset++) {
    const candidate = addDays(searchStart, offset);
    if (calendarEventOccursOn(event, candidate)) return candidate;
  }
  return null;
}

function compareEntries(a: CalendarEventEntry, b: CalendarEventEntry): number {
  const dateDifference = dayOrdinal(a.date) - dayOrdinal(b.date);
  if (dateDifference !== 0) return dateDifference;

  const aTime = a.event.startTime;
  const bTime = b.event.startTime;
  if (!aTime || !bTime) {
    if (!aTime && !bTime) return a.event.title.localeCompare(b.event.title);
    return aTime ? 1 : -1;
  }

  const timeDifference = timeMinutes(aTime) - timeMinutes(bTime);
  return timeDifference !== 0
    ? timeDifference
    : a.event.title.localeCompare(b.event.title);
}

export function listCalendarEventEntries(
  events: readonly CalendarEvent[],
  view: CalendarEventsView,
  selectedDate: Date,
  today: Date,
  query = '',
): CalendarEventEntry[] {
  const needle = normalizeHe(query.trim());
  const matchesQuery = (event: CalendarEvent) => {
    if (!needle) return true;
    return normalizeHe(event.title + ' ' + event.description).includes(needle);
  };

  const entries: CalendarEventEntry[] = [];
  for (const event of events) {
    if (!matchesQuery(event)) continue;

    if (view === 'day') {
      if (calendarEventOccursOn(event, selectedDate)) {
        entries.push({ event, date: dateOnly(selectedDate) });
      }
      continue;
    }

    if (view === 'upcoming') {
      const date = nextCalendarEventOccurrence(event, today);
      if (date) entries.push({ event, date });
      continue;
    }

    const base = parseCalendarDate(event.startDate);
    if (base) entries.push({ event, date: base });
  }

  return entries.sort(compareEntries);
}
