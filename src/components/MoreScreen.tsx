import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Bookmark, Calculator, CalendarCheck, CalendarDays, DatabaseBackup, History, ScrollText, Trash2, Download, Upload, PenLine, MessageSquare } from 'lucide-react';
import DailyStudy from './DailyStudy';
import CalendarZmanim from './CalendarZmanim';
import TzuratHaDaf from './TzuratHaDaf';
import { api } from '../api';
import { useApp } from '../store';
import { Btn, EmptyState, Select, Spinner } from './ui';
import { gematria, timeAgo } from '../utils/text';
import type { ServerStatus } from '../types';
import { t as translate } from '../i18n';

type Tool = 'daily' | 'calendar' | 'daf' | 'bookmarks' | 'history' | 'notes' | 'gematria' | 'backup' | 'status' | 'feedback';

const TOOLS: { key: Tool; label: string; icon: ReactNode }[] = [
  { key: 'daily', label: 'לימוד יומי', icon: <CalendarCheck size={22} /> },
  { key: 'calendar', label: 'לוח וזמנים', icon: <CalendarDays size={22} /> },
  { key: 'daf', label: 'צורת הדף', icon: <ScrollText size={22} /> },
  { key: 'bookmarks', label: 'סימניות', icon: <Bookmark size={22} /> },
  { key: 'history', label: 'היסטוריה', icon: <History size={22} /> },
  { key: 'notes', label: 'חידושי תורה', icon: <PenLine size={22} /> },
  { key: 'gematria', label: 'מחשבון גימטריה', icon: <Calculator size={22} /> },
  { key: 'backup', label: 'גיבוי ושחזור', icon: <DatabaseBackup size={22} /> },
  { key: 'status', label: 'סטטוס שרת', icon: <Activity size={22} /> },
  { key: 'feedback', label: 'שליחת משוב', icon: <MessageSquare size={22} /> },
];

export default function MoreScreen() {
  const [tool, setTool] = useState<Tool>('daily');
  const { refreshUser, settings } = useApp();
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface md:flex-row">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-outline-variant bg-surface p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-l md:p-3">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            className={`flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-sm transition ${
              tool === t.key ? 'bg-sec-container font-medium text-on-sec-container' : 'text-on-variant hover:bg-surface-3'
            }`}
          >
            {t.icon}
            <span className="whitespace-nowrap">{translate(t.label, settings.interfaceLanguage)}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className={`mx-auto p-4 md:p-6 ${tool === 'daf' ? 'h-full max-w-5xl' : 'max-w-3xl'}`}>
          {tool === 'daily' && <DailyStudy />}
          {tool === 'calendar' && <CalendarZmanim />}
          {tool === 'daf' && <TzuratHaDaf />}
          {tool === 'bookmarks' && <Bookmarks />}
          {tool === 'history' && <HistoryView />}
          {tool === 'notes' && <NotesView />}
          {tool === 'gematria' && <Gematria />}
          {tool === 'backup' && <Backup />}
          {tool === 'status' && <Status />}
          {tool === 'feedback' && <Feedback />}
        </div>
      </div>
    </div>
  );
}

function Bookmarks() {
  const { bookmarks, removeBookmark, openBook } = useApp();
  return (
    <div>
      <h2 className="mb-4 text-xl font-medium">סימניות</h2>
      {bookmarks.length === 0 && (
        <EmptyState icon={<Bookmark size={52} />} title="אין סימניות" hint="לחצו על סמל הסימניה בסרגל הכלים של הספר כדי להוסיף סימניה" />
      )}
      {bookmarks.map((b) => (
        <div key={b.id} className="mb-2 flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface-1 pl-2 transition hover:bg-surface-3">
          <button onClick={() => openBook({ id: b.bookId, title: b.bookTitle, categoryPath: b.category }, b.lineIndex)} className="min-w-0 flex-1 px-4 py-3 text-start">
            <div className="font-bold text-primary">
              {b.bookTitle} {b.heRef && <span className="text-sm font-normal text-on-variant">– {b.heRef}</span>}
            </div>
            {b.textSnippet && <div className="truncate text-sm" style={{ fontFamily: '"Frank Ruhl Libre"' }}>{b.textSnippet}</div>}
            <div className="text-xs text-on-variant">{timeAgo(b.createdAt)}</div>
          </button>
          <button onClick={() => removeBookmark(b.id)} className="rounded-full p-2 text-on-variant hover:bg-surface-3 hover:text-error" title="מחק">
            <Trash2 size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

function NotesView() {
  const { notes, deleteNote, openBook, library } = useApp();
  return (
    <div>
      <h2 className="mb-4 text-xl font-medium">חידושי תורה אישיים</h2>
      {notes.length === 0 && <EmptyState icon={<PenLine size={52} />} title="אין חידושים עדיין" hint="בפאנל המפרשים של כל ספר יש כפתור 'הוסף חידוש'" />}
      {notes.map((n) => {
        const b = library?.byId.get(String(n.bookId));
        return (
          <div key={n.id} className="mb-2 flex items-start gap-2 rounded-2xl border border-outline-variant bg-surface-1 pl-2">
            <button onClick={() => openBook({ id: n.bookId, title: b?.title || 'ספר', categoryPath: b?.categoryPath }, n.line)} className="min-w-0 flex-1 px-4 py-3 text-start">
              <div className="font-bold text-primary">
                {b?.title || 'ספר'} {n.heRef && <span className="text-sm font-normal text-on-variant">– {n.heRef}</span>}
              </div>
              <div className="whitespace-pre-wrap text-[15px]" style={{ fontFamily: '"Frank Ruhl Libre"' }}>{n.text}</div>
              <div className="mt-1 text-xs text-on-variant">{timeAgo(n.updatedAt)}</div>
            </button>
            <button onClick={() => deleteNote(n.id)} className="mt-2 rounded-full p-2 text-on-variant hover:bg-surface-3 hover:text-error" title="מחק">
              <Trash2 size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function HistoryView() {
  const { history, clearHistory, openBook, removeHistoryItem } = useApp();
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">היסטוריית קריאה</h2>
        {history.length > 0 && (
          <Btn variant="outlined" onClick={clearHistory}>
            <Trash2 size={15} /> נקה היסטוריה
          </Btn>
        )}
      </div>
      {history.length === 0 && <EmptyState icon={<History size={52} />} title="ההיסטוריה ריקה" />}
      {history.map((h) => (
        <div key={h.id} className="mb-2 flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface-1 pl-2 transition hover:bg-surface-3">
          <button onClick={() => openBook({ id: h.bookId, title: h.bookTitle, categoryPath: h.category }, h.lastPosition)} className="min-w-0 flex-1 px-4 py-3 text-start">
            <div className="font-bold text-primary">{h.bookTitle}</div>
            <div className="text-sm text-on-variant">
              {h.lastSection || `שורה ${h.lastPosition ?? 1}`} · {timeAgo(h.lastReadAt)}
            </div>
          </button>
          <button onClick={() => removeHistoryItem(h)} className="rounded-full p-2 text-on-variant hover:bg-surface-3 hover:text-error" title="הסר">
            <Trash2 size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Gematria() {
  const { settings, updateSettings } = useApp();
  const [text, setText] = useState('');
  const value = gematria(text, settings.gematriaMethod, settings.gematriaIncludeSofiyot);
  return (
    <div>
      <h2 className="mb-4 text-xl font-medium">מחשבון גימטריה</h2>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={settings.gematriaMethod}
          onChange={(v) => updateSettings({ gematriaMethod: v })}
          options={[
            { value: 'standard', label: 'גימטריה רגילה' },
            { value: 'small', label: 'מספר קטן' },
            { value: 'atbash', label: 'אתב"ש' },
            { value: 'albam', label: 'אלב"ם' },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.gematriaIncludeSofiyot} onChange={(e) => updateSettings({ gematriaIncludeSofiyot: e.target.checked })} />
          אותיות סופיות (500–900)
        </label>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="הקלידו מילה או משפט..."
        rows={4}
        className="w-full rounded-2xl border border-outline bg-surface-1 p-4 text-xl outline-none focus:border-primary"
        style={{ fontFamily: '"Frank Ruhl Libre"' }}
      />
      <div className="mt-4 rounded-3xl bg-primary-container p-6 text-center text-on-primary-container">
        <div className="text-sm opacity-80">ערך גימטרי</div>
        <div className="text-5xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function Backup() {
  const { toast, setBookmarks, setHistory, refreshUser, updateSettings } = useApp();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const file = useRef<HTMLInputElement>(null);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await api.backup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `otzaria_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (f: File) => {
    setBusy(true);
    try {
      const data = JSON.parse(await f.text());
      const r = await api.restore(data, mode);
      if (r.bookmarks) setBookmarks(r.bookmarks);
      if (r.history) setHistory(r.history);
      if (r.settings && Object.keys(r.settings).length) updateSettings(r.settings);
      refreshUser();
      toast('הנתונים שוחזרו בהצלחה');
    } catch (e) {
      toast((e as Error).message || 'קובץ הגיבוי אינו תקין');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-medium">גיבוי ושחזור</h2>
      <div className="mb-4 rounded-3xl border border-outline-variant bg-surface-1 p-5">
        <div className="mb-1 font-medium">יצירת גיבוי</div>
        <p className="mb-3 text-sm text-on-variant">הורדת קובץ JSON הכולל סימניות, היסטוריה והגדרות.</p>
        <Btn variant="filled" onClick={download} disabled={busy}>
          <Download size={16} /> הורד גיבוי
        </Btn>
      </div>
      <div className="rounded-3xl border border-outline-variant bg-surface-1 p-5">
        <div className="mb-1 font-medium">שחזור מגיבוי</div>
        <p className="mb-3 text-sm text-on-variant">בחרו קובץ גיבוי ואופן שחזור.</p>
        <div className="mb-3 flex items-center gap-3">
          <Select
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'מיזוג עם הנתונים הקיימים' },
              { value: 'replace', label: 'החלפת הנתונים הקיימים' },
            ]}
          />
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        <Btn variant="tonal" onClick={() => file.current?.click()} disabled={busy}>
          <Upload size={16} /> בחר קובץ לשחזור
        </Btn>
      </div>
    </div>
  );
}

export function Feedback() {
  const { toast } = useApp();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = message.trim();
    if (!text) {
      toast('נא לכתוב את תוכן המשוב.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.submitFeedback(text);
      toast(result.message || 'המשוב נשלח. תודה רבה!');
      setMessage('');
    } catch (e) {
      toast((e as Error).message || 'לא הצלחנו לשלוח את המשוב.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-xl font-medium">שליחת משוב</h2>
      <p className="mb-4 text-sm text-on-variant">אפשר לדווח כאן על תקלה, להציע שיפור או לשלוח הערה. המשוב יגיע למערכת הניהול.</p>
      <div className="rounded-3xl border border-outline-variant bg-surface-1 p-5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
          placeholder="כתבו כאן את המשוב..."
          rows={8}
          maxLength={5000}
          className="w-full resize-y rounded-2xl border border-outline bg-surface p-4 text-base leading-relaxed outline-none focus:border-primary"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-on-variant">{message.length.toLocaleString('he-IL')} / 5,000 תווים</span>
          <Btn variant="filled" onClick={submit} disabled={busy || !message.trim()}>
            <MessageSquare size={16} /> {busy ? 'שולח…' : 'שלח משוב'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Status() {
  const [st, setSt] = useState<ServerStatus | null>(null);
  const [health, setHealth] = useState<string>('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setErr('');
    api
      .status()
      .then(setSt)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    api
      .searchHealth()
      .then((h) => setHealth(`${h.status} · ${h.engine ?? ''} · ${h.indexedBooks ?? '?'} ספרים באינדקס`))
      .catch(() => setHealth('מנוע החיפוש המהיר אינו זמין (חיפוש בגיבוי SQLite)'));
  };
  useEffect(load, []);

  const rows: [string, string][] = st
    ? [
        ['מצב', st.status === 'ready' ? 'פעיל' : st.status],
        ['הודעה', st.message || ''],
        ['מספר ספרים', String(st.totalBooks)],
        ['גודל מסד נתונים', st.databaseSize || `${st.storageUsageMB} MB`],
        ['מנוע', st.databaseEngine || ''],
        ['מנוע חיפוש', health],
      ]
    : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium">סטטוס שרת</h2>
        <Btn variant="outlined" onClick={load}>
          רענן
        </Btn>
      </div>
      {loading && <Spinner />}
      {err && <div className="rounded-2xl bg-surface-2 p-4 text-error">{err}</div>}
      {st && (
        <div className="divide-y divide-outline-variant/60 overflow-hidden rounded-3xl border border-outline-variant bg-surface-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-5 py-3 text-sm">
              <span className="text-on-variant">{k}</span>
              <span className="text-start font-medium">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
