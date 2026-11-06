import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, Check, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { BookItem, CustomStudy, TocEntry } from '../types';
import { chofetzChaimFor, dafYomiFor, halachaYomitFor, hebrewDate, mishnaYomiFor, parashaFor, rambamFor } from '../utils/dailyStudy';
import { resolveTarget, targetForTrack, type ResolvedTarget } from '../utils/studyLinks';
import { Btn, Select, Spinner } from './ui';
import { t as translate } from '../i18n';
import { findShasTractate } from '../utils/shasTractates';

export const TRACKS: { key: string; label: string }[] = [
  { key: 'dafYomi', label: 'דף יומי' },
  { key: 'chofetzChaim', label: 'חפץ חיים' },
  { key: 'mishnaYomi', label: 'משנה יומית' },
  { key: 'rambam', label: 'רמב"ם יומי' },
  { key: 'halachaYomit', label: 'הלכה יומית' },
  { key: 'parasha', label: 'פרשת השבוע' },
];

export function orderedTracks(order?: string[]) {
  if (!order?.length) return TRACKS;
  return [...TRACKS].sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    return (ai < 0 ? 99 + TRACKS.indexOf(a) : ai) - (bi < 0 ? 99 + TRACKS.indexOf(b) : bi);
  });
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Computes the display text + resolved book link for every enabled track. */
export function useDailyTracks(date: Date) {
  const { settings, library } = useApp();
  const schedule = String(settings.halachaYomitScheduleType || 'dirshu_mishna_berura');
  const chofetzSchedule = String(settings.chofetzChaimScheduleType || 'world_three_times');
  const [links, setLinks] = useState<Record<string, ResolvedTarget | null>>({});

  const values = useMemo<Record<string, string>>(() => {
    const daf = dafYomiFor(date);
    return {
      dafYomi: daf ? daf.label : '—',
      mishnaYomi: mishnaYomiFor(date) ?? '—',
      rambam: rambamFor(date),
      halachaYomit: halachaYomitFor(date, schedule),
      parasha: parashaFor(date) ?? '—',
      chofetzChaim: chofetzChaimFor(date, chofetzSchedule),
    };
  }, [date, schedule, chofetzSchedule]);

  const stamp = dayKey(date);
  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    setLinks({});
    (async () => {
      const entries = await Promise.all(TRACKS.map(async (track) => {
        const target = targetForTrack(track.key, date, schedule, chofetzSchedule);
        return [track.key, target ? await resolveTarget(target, library.books) : null] as const;
      }));
      const out = Object.fromEntries(entries) as Record<string, ResolvedTarget | null>;
      if (!cancelled) setLinks(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, stamp, schedule, chofetzSchedule]);

  return { values, links };
}

/** Small strip of today's learning, shown at the top of the library. */
export function DailyStudyStrip() {
  const { settings, openBook, openTzuratHaDaf, setScreen } = useApp();
  const date = useMemo(() => new Date(), []);
  const { values, links } = useDailyTracks(date);
  const enabled: Record<string, boolean> = settings.dailyStudyTracks ?? {};
  const shown = orderedTracks(settings.dailyStudyOrder).filter((track) => enabled[track.key] !== false);
  const lang = settings.interfaceLanguage;
  if (!shown.length) return null;

  return (
    <div className="mb-4 px-2 pt-1">
      <div className="mb-2 flex items-center justify-between px-1 text-sm text-on-variant">
        <span>{translate('לימוד יומי', lang)} · {hebrewDate(date)}</span>
        <button onClick={() => setScreen('more')} className="text-xs text-primary hover:underline">
          {translate('כל המסלולים', lang)}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shown.map((t) => {
          const link = links[t.key];
          return (
            <button
              key={t.key}
              disabled={!link}
              onClick={() => {
                if (!link) return;
                const ref = { id: link.book.id, title: link.book.title, categoryPath: link.book.categoryPath };
                if (t.key === 'dafYomi') {
                  const daf = dafYomiFor(date);
                  if (daf && findShasTractate(ref.title)) {
                    openTzuratHaDaf(ref, daf.blatt, 'a', 'replace');
                    return;
                  }
                }
                openBook(ref, link.line);
              }}
              title={link ? `${link.book.title} · ${link.label}` : 'הספר לא נמצא בספרייה'}
              className="min-w-[165px] max-w-[230px] shrink-0 rounded-2xl bg-primary-container px-4 py-2.5 text-start text-on-primary-container transition hover:brightness-95 disabled:opacity-50"
            >
              <div className="truncate text-xs opacity-75">{translate(t.label, lang)}</div>
              <div className="truncate text-sm font-medium" dir="auto">{values[t.key]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyStudy() {
  const { settings, updateSettings, openBook, openTzuratHaDaf, library, toast } = useApp();
  const [iso, setIso] = useState(() => dayKey(new Date()));
  const date = useMemo(() => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? new Date() : dt;
  }, [iso]);
  const [adding, setAdding] = useState(false);
  const { values, links } = useDailyTracks(date);

  const enabled: Record<string, boolean> = settings.dailyStudyTracks ?? {};
  const custom: CustomStudy[] = settings.customStudies ?? [];
  const progress = settings.studyProgress ?? {};
  const sortedTracks = orderedTracks(settings.dailyStudyOrder);
  const lang = settings.interfaceLanguage;
  const isToday = iso === dayKey(new Date());

  const toggleTrack = (key: string) => updateSettings({ dailyStudyTracks: { ...enabled, [key]: enabled[key] === false } });

  const moveTrack = (key: string, direction: -1 | 1) => {
    const order = sortedTracks.map((item) => item.key);
    const index = order.indexOf(key);
    const next = index + direction;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    updateSettings({ dailyStudyOrder: order });
  };

  const enableReminder = async () => {
    if (!('Notification' in window)) {
      toast('הדפדפן אינו תומך בהתראות');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') updateSettings({ dailyNotificationsEnabled: true });
      else toast('יש לאפשר התראות עבור האתר בהגדרות הדפדפן');
    } catch {
      toast('לא ניתן להפעיל התראות בדפדפן זה');
    }
  };

  const markDone = (key: string) => {
    const cur = progress[key] ?? { done: [], unit: 0, updatedAt: '' };
    const done = cur.done.includes(iso) ? cur.done.filter((d) => d !== iso) : [...cur.done, iso];
    updateSettings({ studyProgress: { ...progress, [key]: { ...cur, done: done.slice(-400), updatedAt: new Date().toISOString() } } });
  };

  const openTrack = (key: string) => {
    const link = links[key];
    if (!link) {
      toast('לא נמצא ספר מתאים בספרייה למסלול זה');
      return;
    }
    const ref = { id: link.book.id, title: link.book.title, categoryPath: link.book.categoryPath };
    if (key === 'dafYomi') {
      const daf = dafYomiFor(date);
      if (daf && findShasTractate(ref.title)) {
        openTzuratHaDaf(ref, daf.blatt, 'a', 'replace');
        return;
      }
    }
    openBook(ref, link.line);
  };

  const advanceCustom = (study: CustomStudy) => {
    const next = Math.min(study.units.length, study.current + study.unitsPerDay);
    updateSettings({ customStudies: custom.map((c) => (c.id === study.id ? { ...c, current: next } : c)) });
  };
  const resetCustom = (study: CustomStudy) => updateSettings({ customStudies: custom.map((c) => (c.id === study.id ? { ...c, current: 0 } : c)) });
  const removeCustom = (id: string) => updateSettings({ customStudies: custom.filter((c) => c.id !== id) });

  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setIso(dayKey(d));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium">{translate('לימוד יומי', lang)}</h2>
        <div className="text-sm text-on-variant">{hebrewDate(date)}</div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-outline-variant bg-surface-1 px-4 py-3">
        <Bell size={18} className="text-primary" />
        <span className="text-sm font-medium">{translate('תזכורת יומית', lang)}</span>
        <input
          type="time"
          value={settings.dailyNotificationTime || '08:00'}
          onChange={(event) => updateSettings({ dailyNotificationTime: event.target.value })}
          className="rounded-lg border border-outline-variant bg-surface px-2 py-1 text-sm"
          aria-label={translate('שעת התזכורת', lang)}
        />
        {settings.dailyNotificationsEnabled ? (
          <button onClick={() => updateSettings({ dailyNotificationsEnabled: false })} className="rounded-full bg-sec-container px-3 py-1.5 text-xs text-on-sec-container">
            {translate('התראות מופעלות', lang)} · {translate('ביטול', lang)}
          </button>
        ) : (
          <button onClick={enableReminder} className="rounded-full bg-primary px-3 py-1.5 text-xs text-on-primary">
            {translate('אפשר התראות', lang)}
          </button>
        )}
        <span className="w-full text-[11px] text-on-variant">התראה בדפדפן פועלת רק כשהאתר פתוח; התראות כשהוא סגור דורשות Push בשרת.</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={iso}
          onChange={(e) => e.target.value && setIso(e.target.value)}
          className="h-9 rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        <button onClick={() => shift(-1)} className="rounded-full px-3 py-1.5 text-sm hover:bg-surface-3">{translate('אתמול', lang)}</button>
        <button onClick={() => setIso(dayKey(new Date()))} className={`rounded-full px-3 py-1.5 text-sm ${isToday ? 'bg-sec-container text-on-sec-container' : 'hover:bg-surface-3'}`}>{translate('היום', lang)}</button>
        <button onClick={() => shift(1)} className="rounded-full px-3 py-1.5 text-sm hover:bg-surface-3">{translate('מחר', lang)}</button>
        <label className="mr-auto text-xs text-on-variant">
          {translate('מסלול הלכה יומית', lang)}
          <Select
            className="mt-1 block"
            value={String(settings.halachaYomitScheduleType || 'dirshu_mishna_berura')}
            onChange={(v) => updateSettings({ halachaYomitScheduleType: v as never })}
            options={[
              { value: 'dirshu_mishna_berura', label: 'שולחן ערוך (דרשו)' },
              { value: 'shulchan_aruch', label: 'ערוך השולחן היומי' },
              { value: 'kitzur_shulchan_aruch', label: 'קיצור שולחן ערוך' },
              { value: 'rambam_halacha', label: 'רמב"ם – הלכה יומית' },
            ]}
          />
        </label>
        <label className="text-xs text-on-variant">
          מסלול חפץ חיים
          <Select
            className="mt-1 block"
            value={String(settings.chofetzChaimScheduleType || 'world_three_times')}
            onChange={(v) => updateSettings({ chofetzChaimScheduleType: v as never })}
            options={[
              { value: 'world_biannual', label: 'מחזור פעמיים בשנה' },
              { value: 'world_three_times', label: 'מחזור 3 פעמים בשנה' },
            ]}
          />
        </label>
      </div>

      <div className="mb-5 space-y-2">
        {sortedTracks.map((track, trackIndex) => {
          const t = track;
          const on = enabled[t.key] !== false;
          const doneToday = (progress[t.key]?.done ?? []).includes(iso);
          const link = links[t.key];
          return (
            <div key={t.key} className={`flex items-center gap-2 rounded-2xl border px-4 py-3 ${on ? 'border-outline-variant bg-surface-1' : 'border-dashed border-outline-variant opacity-60'}`}>
              <button onClick={() => toggleTrack(t.key)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? 'border-primary bg-primary' : 'border-outline'}`} title={on ? 'הסתר מסלול' : 'הצג מסלול'}>
                {on && <Check size={13} className="text-on-primary" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{translate(t.label, lang)}</div>
                <div className="truncate text-sm text-on-variant" dir="auto">{values[t.key]}</div>
                {on && (
                  <div className="truncate text-xs text-on-variant opacity-75">
                    {link ? `${link.book.title} · שורה ${link.line}` : library ? 'לא נמצא ספר מתאים בספרייה' : 'טוען ספרייה…'}
                  </div>
                )}
              </div>
              {on && (
                <>
                  <button onClick={() => markDone(t.key)} className={`shrink-0 rounded-full px-3 py-1 text-xs ${doneToday ? 'bg-primary text-on-primary' : 'bg-surface-3 text-on-variant'}`}>
                    {translate(doneToday ? 'נלמד' : 'סמן כנלמד', lang)}
                  </button>
                  <button onClick={() => openTrack(t.key)} disabled={!link} className="shrink-0 rounded-full p-2 text-on-variant hover:bg-surface-3 disabled:opacity-40" title="פתח במקום המדויק">
                    <BookOpen size={17} />
                  </button>
                </>
              )}
              <div className="flex shrink-0 flex-col">
                <button disabled={trackIndex === 0} onClick={() => moveTrack(t.key, -1)} title={translate('הזז למעלה', lang)} className="rounded-full p-0.5 text-on-variant hover:bg-surface-3 disabled:opacity-25"><ChevronUp size={15} /></button>
                <button disabled={trackIndex === sortedTracks.length - 1} onClick={() => moveTrack(t.key, 1)} title={translate('הזז למטה', lang)} className="rounded-full p-0.5 text-on-variant hover:bg-surface-3 disabled:opacity-25"><ChevronDown size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{translate('מסלולים אישיים', lang)}</h3>
        <Btn variant="tonal" onClick={() => setAdding((a) => !a)}>
          {adding ? <X size={15} /> : <Plus size={15} />} {translate(adding ? 'ביטול' : 'מסלול חדש', lang)}
        </Btn>
      </div>

      {adding && <CustomStudyForm onDone={() => setAdding(false)} />}

      {custom.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-variant">
          אפשר להוסיף כל ספר כמסלול לימוד ולקבוע כמה פרקים או סעיפים ללמוד בכל יום.
        </div>
      )}

      {custom.map((study) => {
        const pct = study.units.length ? Math.round((study.current / study.units.length) * 100) : 0;
        const next = study.units.slice(study.current, study.current + study.unitsPerDay);
        const book = library?.byId.get(String(study.bookId));
        return (
          <div key={study.id} className="mb-2 rounded-2xl border border-outline-variant bg-surface-1 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-primary">{study.title}</div>
                <div className="text-xs text-on-variant">
                  {study.bookTitle} · {study.unitsPerDay} {study.levelLabel} ליום · {study.current}/{study.units.length} ({pct}%)
                </div>
              </div>
              <button onClick={() => removeCustom(study.id)} className="rounded-full p-1.5 text-on-variant hover:bg-surface-3 hover:text-error" title="מחק מסלול">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            {next.length > 0 ? (
              <div className="text-sm">
                להיום: <b>{next.map((u) => u.title).join(', ')}</b>
              </div>
            ) : (
              <div className="text-sm text-on-variant">סיימתם את המסלול. כל הכבוד!</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {next[0] && (
                <Btn variant="filled" onClick={() => openBook({ id: study.bookId, title: study.bookTitle, categoryPath: book?.categoryPath }, next[0].index)}>
                  <BookOpen size={15} /> פתח
                </Btn>
              )}
              {next.length > 0 && (
                <Btn variant="tonal" onClick={() => advanceCustom(study)}>
                  <Check size={15} /> סיימתי להיום
                </Btn>
              )}
              <Btn variant="outlined" onClick={() => resetCustom(study)}>
                התחל מחדש
              </Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface LevelOption {
  level: number;
  label: string;
  units: { title: string; index: number }[];
}

function CustomStudyForm({ onDone }: { onDone: () => void }) {
  const { library, settings, updateSettings, toast } = useApp();
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState<string>('');
  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState(0);
  const [perDay, setPerDay] = useState(1);

  const matches = useMemo<BookItem[]>(() => {
    const q = query.trim();
    if (!q || !library) return [];
    return library.books.filter((b) => b.title.includes(q)).slice(0, 8);
  }, [query, library]);

  const book = library?.byId.get(bookId);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    setToc(null);
    api
      .toc(bookId)
      .then(setToc)
      .catch(() => setToc([]))
      .finally(() => setLoading(false));
  }, [bookId]);

  const levelOptions: LevelOption[] = useMemo(() => {
    if (!toc?.length) return [];
    const byLevel = new Map<number, { title: string; index: number }[]>();
    for (const e of toc) {
      const l = e.level ?? 1;
      if (!byLevel.has(l)) byLevel.set(l, []);
      byLevel.get(l)!.push({ title: e.title, index: e.index });
    }
    return Array.from(byLevel.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, units], i) => ({ level: i, label: guessLabel(units[0]?.title || '') + ` (${units.length})`, units }))
      .filter((x) => x.units.length > 1);
  }, [toc]);

  const chosen = levelOptions[level];

  const create = () => {
    if (!book || !chosen) return;
    const study: CustomStudy = {
      id: 'cs_' + Date.now().toString(36),
      title: `${book.title} – ${chosen.label.replace(/\s*\(\d+\)$/, '')}`,
      bookId: book.id,
      bookTitle: book.title,
      level,
      levelLabel: chosen.label.replace(/\s*\(\d+\)$/, ''),
      unitsPerDay: perDay,
      units: chosen.units,
      current: 0,
      startDate: new Date().toISOString(),
      active: true,
    };
    updateSettings({ customStudies: [...(settings.customStudies ?? []), study] });
    toast('המסלול נוסף');
    onDone();
  };

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-outline-variant bg-surface-1 p-4">
      <div>
        <div className="mb-1 text-xs text-on-variant">בחרו ספר</div>
        <input
          value={book ? book.title : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setBookId('');
          }}
          placeholder="שם הספר"
          className="h-10 w-full rounded-xl border border-outline bg-surface px-3 text-sm outline-none focus:border-primary"
        />
        {!bookId &&
          matches.map((b) => (
            <button key={String(b.id)} onClick={() => setBookId(String(b.id))} className="block w-full truncate rounded-lg px-3 py-1.5 text-start text-sm hover:bg-surface-3">
              {b.title} <span className="text-xs text-on-variant">{b.categoryPath}</span>
            </button>
          ))}
      </div>

      {loading && <Spinner label="טוען תוכן עניינים..." />}
      {toc && toc.length === 0 && <div className="text-sm text-error">לספר זה אין תוכן עניינים, ולכן לא ניתן לחלק אותו ליחידות לימוד.</div>}

      {levelOptions.length > 0 && (
        <>
          <div>
            <div className="mb-1 text-xs text-on-variant">יחידת לימוד</div>
            <Select className="w-full" value={level} onChange={setLevel} options={levelOptions.map((o) => ({ value: o.level, label: o.label }))} />
          </div>
          <div>
            <div className="mb-1 text-xs text-on-variant">כמה ללמוד בכל יום</div>
            <Select className="w-full" value={perDay} onChange={setPerDay} options={[1, 2, 3, 4, 5, 7, 10].map((n) => ({ value: n, label: `${n}` }))} />
          </div>
          <Btn variant="filled" className="w-full" onClick={create}>
            צור מסלול
          </Btn>
        </>
      )}
    </div>
  );
}

function guessLabel(title: string): string {
  const m = title.match(/^(פרק|סימן|דף|הלכה|משנה|פסוק|סעיף|מזמור|שער|מאמר|חלק|פרשת)/u);
  const map: Record<string, string> = { פרק: 'פרקים', סימן: 'סימנים', דף: 'דפים', הלכה: 'הלכות', משנה: 'משניות', פסוק: 'פסוקים', סעיף: 'סעיפים', מזמור: 'מזמורים', שער: 'שערים', מאמר: 'מאמרים', חלק: 'חלקים', פרשת: 'פרשות' };
  return m ? map[m[1]] || 'יחידות' : 'יחידות';
}
