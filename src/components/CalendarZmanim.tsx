import { useMemo, useState } from 'react';
import { CalendarPlus, Clock, Pencil, Repeat, Search, Trash2, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import {
  listCalendarEventEntries,
  normalizeCalendarEvents,
  parseCalendarDate,
  validateCalendarEventDraft,
  type CalendarEventsView,
} from '../utils/calendarEvents';
import { useApp } from '../store';
import { hebrewDate, holidaysFor, LOCATIONS, zmanimFor } from '../utils/dailyStudy';
import { Select } from './ui';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarZmanim() {
  const { settings, updateSettings } = useApp();
  const [iso, setIso] = useState(() => dayKey(new Date()));
  const date = useMemo(() => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? new Date() : dt;
  }, [iso]);
  const offset = iso === dayKey(new Date()) ? 0 : 1;
  const setOffset = (fn: number | ((o: number) => number)) => {
    const delta = typeof fn === 'function' ? fn(0) : fn;
    if (delta === 0) {
      setIso(dayKey(new Date()));
      return;
    }
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setIso(dayKey(d));
  };

  const loc = settings.calendarLocation || 'jerusalem';
  const method = settings.zmanimMethod || 'gra';
  const rows = useMemo(() => zmanimFor(date, loc, method), [date, loc, method]);
  const holidays = useMemo(() => holidaysFor(date), [date]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-medium">לוח שנה וזמני היום</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={loc} onChange={(v) => updateSettings({ calendarLocation: v })} options={LOCATIONS.map((l) => ({ value: l.id, label: l.label }))} />
        <Select
          value={method}
          onChange={(v) => updateSettings({ zmanimMethod: v })}
          options={[
            { value: 'gra' as const, label: 'שיטת הגר"א' },
            { value: 'mga' as const, label: 'שיטת המג"א' },
            { value: 'baal_hatanya' as const, label: 'בעל התניא' },
          ]}
        />
        <input
          type="date"
          value={iso}
          onChange={(e) => e.target.value && setIso(e.target.value)}
          className="h-9 rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <div className="mr-auto flex items-center gap-1">
          <button onClick={() => setOffset((o) => o - 1)} className="rounded-full px-3 py-1.5 text-sm hover:bg-surface-3">
            אתמול
          </button>
          <button onClick={() => setOffset(0)} className={`rounded-full px-3 py-1.5 text-sm ${offset === 0 ? 'bg-sec-container text-on-sec-container' : 'hover:bg-surface-3'}`}>
            היום
          </button>
          <button onClick={() => setOffset((o) => o + 1)} className="rounded-full px-3 py-1.5 text-sm hover:bg-surface-3">
            מחר
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-3xl bg-primary-container p-5 text-on-primary-container">
        <div className="text-2xl font-bold">{hebrewDate(date)}</div>
        <div className="text-sm opacity-80">{date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        {holidays.length > 0 && <div className="mt-2 text-sm font-medium">{holidays.join(' · ')}</div>}
      </div>

      <div className="divide-y divide-outline-variant/60 overflow-hidden rounded-3xl border border-outline-variant bg-surface-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
            <span className="text-on-variant">{r.label}</span>
            <span className="font-medium tabular-nums">{r.time}</span>
          </div>
        ))}
      </div>
      {method === 'baal_hatanya' && <div className="mt-2 text-xs text-on-variant">חישוב בעל התניא אינו נתמך עדיין; מוצגים זמני הגר"א.</div>}
      <div className="mt-2 text-xs text-on-variant">הזמנים מחושבים בדפדפן לפי מיקום נבחר. יש לבדוק מול לוח מקומי לפני הסתמכות הלכתית.</div>
      <CalendarEventsPanel selectedDate={date} />
    </div>
  );
}


function createCalendarEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'calendar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function eventRecurrenceLabel(event: CalendarEvent): string {
  switch (event.recurrence) {
    case 'weekly':
      return 'חוזר מדי שבוע';
    case 'monthlyGregorian':
      return 'חוזר מדי חודש (לועזי)';
    case 'annualGregorian':
      return 'חוזר מדי שנה (לועזי)';
    default:
      return 'אירוע חד־פעמי';
  }
}

function CalendarEventsPanel({ selectedDate }: { selectedDate: Date }) {
  const { settings, updateSettings, toast } = useApp();
  const events = useMemo(
    () => normalizeCalendarEvents(settings.calendarEvents),
    [settings.calendarEvents],
  );
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalendarEventsView>('day');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<CalendarEvent | null>(null);

  const entries = useMemo(
    () => listCalendarEventEntries(events, view, selectedDate, today, query),
    [events, view, selectedDate, today, query],
  );
  const counts = useMemo(
    () => ({
      day: listCalendarEventEntries(events, 'day', selectedDate, today).length,
      upcoming: listCalendarEventEntries(events, 'upcoming', today, today).length,
      all: events.length,
    }),
    [events, selectedDate, today],
  );

  const openNewEvent = () => {
    setDraft({
      id: createCalendarEventId(),
      title: '',
      description: '',
      startDate: dayKey(selectedDate),
      recurrence: 'none',
      createdAt: new Date().toISOString(),
    });
  };

  const saveEvent = (event: CalendarEvent) => {
    const error = validateCalendarEventDraft(event);
    if (error) {
      toast(error);
      return;
    }
    const saved: CalendarEvent = {
      ...event,
      title: event.title.trim(),
      description: event.description.trim(),
      endDate: event.endDate || undefined,
      startTime: event.startTime || undefined,
      endTime: event.endTime || undefined,
      recurrenceUntil: event.recurrenceUntil || undefined,
    };
    const exists = events.some((item) => item.id === saved.id);
    const next = exists
      ? events.map((item) => (item.id === saved.id ? saved : item))
      : [...events, saved];
    updateSettings({ calendarEvents: next });
    toast(exists ? 'האירוע עודכן' : 'האירוע נוסף ללוח');
    setDraft(null);
  };

  const deleteEvent = (event: CalendarEvent) => {
    if (!window.confirm('למחוק את האירוע "' + event.title + '"?')) return;
    updateSettings({
      calendarEvents: events.filter((item) => item.id !== event.id),
    });
    toast('האירוע נמחק');
  };

  const toggleWeekday = (event: CalendarEvent, weekday: number) => {
    const startDay = parseCalendarDate(event.startDate)?.getDay() ?? 0;
    const current = new Set(
      event.weeklyDays && event.weeklyDays.length > 0
        ? event.weeklyDays
        : [startDay],
    );
    if (current.has(weekday)) {
      if (current.size === 1) return;
      current.delete(weekday);
    } else {
      current.add(weekday);
    }
    setDraft({ ...event, weeklyDays: Array.from(current).sort((a, b) => a - b) });
  };

  const viewOptions: { value: CalendarEventsView; label: string; count: number }[] = [
    { value: 'day', label: 'יום נבחר', count: counts.day },
    { value: 'upcoming', label: 'קרובים', count: counts.upcoming },
    { value: 'all', label: 'כל האירועים', count: counts.all },
  ];

  const emptyTitle = query.trim()
    ? 'לא נמצאו אירועים מתאימים'
    : view === 'day'
      ? 'אין אירועים ביום הנבחר'
      : view === 'upcoming'
        ? 'אין אירועים קרובים'
        : 'עדיין לא נוספו אירועים';

  return (
    <section className="mt-6 border-t border-outline-variant pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarPlus size={19} className="text-primary" />
          אירועים אישיים
        </h3>
        <button
          type="button"
          onClick={openNewEvent}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <CalendarPlus size={16} />
          הוסף אירוע
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="תצוגת אירועים">
        {viewOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
            className={
              'rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
              (view === option.value
                ? 'border-primary bg-primary-container text-on-primary-container'
                : 'border-outline-variant bg-surface-1 text-on-variant hover:bg-surface-3')
            }
          >
            {option.label} ({option.count})
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חפש בכותרות ובתיאורי האירועים..."
          aria-label="חיפוש אירועים"
          className="h-10 w-full rounded-xl border border-outline-variant bg-surface-1 pr-9 pl-10 text-sm outline-none transition focus:border-primary focus:bg-surface"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-variant hover:bg-surface-3"
            aria-label="נקה חיפוש אירועים"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-1 px-4 py-7 text-center">
          <CalendarPlus size={30} className="mx-auto mb-2 text-on-variant/70" />
          <div className="text-sm font-medium">{emptyTitle}</div>
          <div className="mt-1 text-xs text-on-variant">
            {query.trim()
              ? 'נסה מילות חיפוש אחרות או שנה את תצוגת האירועים.'
              : 'אפשר להוסיף אירוע חד־פעמי או אירוע שחוזר מדי שבוע, חודש או שנה.'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(({ event, date }) => (
            <article
              key={event.id}
              className="flex min-w-0 items-start gap-3 rounded-2xl border border-outline-variant bg-surface-1 p-3"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                {event.startTime ? <Clock size={18} /> : <CalendarPlus size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{event.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-variant">
                  <span>{date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {event.startTime
                      ? event.endTime
                        ? event.startTime + '–' + event.endTime
                        : event.startTime
                      : 'כל היום'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    {event.recurrence !== 'none' && <Repeat size={12} />}
                    {eventRecurrenceLabel(event)}
                  </span>
                </div>
                {event.description && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-on-variant">
                    {event.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDraft({ ...event })}
                  className="rounded-full p-2 text-on-variant hover:bg-surface-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title="ערוך אירוע"
                  aria-label={'ערוך את האירוע ' + event.title}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteEvent(event)}
                  className="rounded-full p-2 text-on-variant hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                  title="מחק אירוע"
                  aria-label={'מחק את האירוע ' + event.title}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-dialog-title"
            dir="rtl"
            onSubmit={(event) => {
              event.preventDefault();
              saveEvent(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
              }
            }}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-outline-variant bg-surface p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="calendar-event-dialog-title" className="text-lg font-semibold">
                {events.some((item) => item.id === draft.id) ? 'עריכת אירוע' : 'אירוע חדש'}
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-full p-2 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="סגור חלונית אירוע"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium">
                כותרת האירוע
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                  placeholder="לדוגמה: שיעור קבוע"
                />
              </label>

              <label className="block text-sm font-medium">
                תיאור
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-outline bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="פרטים והערות לאירוע"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  תאריך התחלה
                  <input
                    required
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-sm font-medium">
                  תאריך סיום (לא חובה)
                  <input
                    type="date"
                    min={draft.startDate}
                    value={draft.endDate ?? ''}
                    onChange={(event) => setDraft({ ...draft, endDate: event.target.value || undefined })}
                    className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  שעת התחלה (לא חובה)
                  <input
                    type="time"
                    value={draft.startTime ?? ''}
                    onChange={(event) => setDraft({ ...draft, startTime: event.target.value || undefined })}
                    className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-sm font-medium">
                  שעת סיום (לא חובה)
                  <input
                    type="time"
                    value={draft.endTime ?? ''}
                    disabled={!draft.startTime}
                    onChange={(event) => setDraft({ ...draft, endTime: event.target.value || undefined })}
                    className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none disabled:opacity-50 focus:border-primary"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium">
                חזרתיות
                <select
                  value={draft.recurrence}
                  onChange={(event) => setDraft({
                    ...draft,
                    recurrence: event.target.value as CalendarEvent['recurrence'],
                  })}
                  className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="none">ללא חזרה</option>
                  <option value="weekly">שבועי</option>
                  <option value="monthlyGregorian">חודשי לפי התאריך הלועזי</option>
                  <option value="annualGregorian">שנתי לפי התאריך הלועזי</option>
                </select>
              </label>

              {draft.recurrence === 'weekly' && (
                <fieldset className="rounded-xl border border-outline-variant p-3">
                  <legend className="px-1 text-sm font-medium">ימי השבוע</legend>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: 'א׳' },
                      { value: 1, label: 'ב׳' },
                      { value: 2, label: 'ג׳' },
                      { value: 3, label: 'ד׳' },
                      { value: 4, label: 'ה׳' },
                      { value: 5, label: 'ו׳' },
                      { value: 6, label: 'ש׳' },
                    ].map((day) => {
                      const baseDay = parseCalendarDate(draft.startDate)?.getDay() ?? 0;
                      const activeDays = draft.weeklyDays && draft.weeklyDays.length > 0
                        ? draft.weeklyDays
                        : [baseDay];
                      const active = activeDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleWeekday(draft, day.value)}
                          className={
                            'min-w-10 rounded-full border px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
                            (active
                              ? 'border-primary bg-primary-container text-on-primary-container'
                              : 'border-outline-variant bg-surface-1 text-on-variant hover:bg-surface-3')
                          }
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {draft.recurrence !== 'none' && (
                <label className="block text-sm font-medium">
                  תאריך אחרון לחזרה (לא חובה)
                  <input
                    type="date"
                    min={draft.startDate}
                    value={draft.recurrenceUntil ?? ''}
                    onChange={(event) => setDraft({ ...draft, recurrenceUntil: event.target.value || undefined })}
                    className="mt-1 h-10 w-full rounded-xl border border-outline bg-surface-1 px-3 text-sm outline-none focus:border-primary"
                  />
                </label>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant pt-4">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-full border border-outline-variant px-4 py-2 text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {events.some((item) => item.id === draft.id) ? 'שמור שינויים' : 'הוסף אירוע'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
