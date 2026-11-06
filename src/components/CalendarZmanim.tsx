import { useMemo, useState } from 'react';
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
    </div>
  );
}
