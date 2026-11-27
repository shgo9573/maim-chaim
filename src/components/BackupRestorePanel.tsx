import { useRef, useState } from 'react';
import { Check, Download, FileJson, Upload, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import { Btn, Select } from './ui';
import {
  inspectUserBackup,
  MAX_USER_BACKUP_FILE_BYTES,
  validateUserBackup,
  type UserBackupSummary,
} from '../utils/userBackup';

interface PendingBackup {
  fileName: string;
  fileSize: number;
  data: unknown;
  summary: UserBackupSummary;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('he-IL') : 'לא צוין';
}

const SECTION_LABELS: Record<keyof UserBackupSummary['counts'], string> = {
  bookmarks: 'סימניות',
  history: 'רשומות היסטוריה',
  searches: 'חיפושים שמורים',
  notes: 'הערות',
  personalNotes: 'חידושים אישיים',
  customStudies: 'סדרי לימוד אישיים',
  calendarEvents: 'אירועי לוח שנה',
  total: 'סך הכול',
};

const MISSING_SECTION_LABELS: Record<string, string> = {
  bookmarks: 'סימניות',
  history: 'היסטוריה',
  searches: 'חיפושים',
  notes: 'הערות',
  settings: 'הגדרות',
};

export default function BackupRestorePanel() {
  const { toast, setBookmarks, setHistory, refreshUser, replaceSettings } = useApp();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [pending, setPending] = useState<PendingBackup | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await api.backup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `otzaria_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast((error as Error).message || 'יצירת הגיבוי נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const chooseBackup = async (file?: File) => {
    if (!file) return;
    setPending(null);
    setConfirmReplace(false);

    if (file.size > MAX_USER_BACKUP_FILE_BYTES) {
      toast(`קובץ הגיבוי גדול מהמותר (${formatBytes(MAX_USER_BACKUP_FILE_BYTES)}).`);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }

    try {
      const data: unknown = JSON.parse(await file.text());
      const inspection = inspectUserBackup(data);
      if (!inspection.valid) {
        toast(inspection.error);
        return;
      }

      setPending({
        fileName: file.name,
        fileSize: file.size,
        data,
        summary: inspection.summary,
      });
      setMode('merge');
    } catch {
      toast('לא ניתן לקרוא את הקובץ. יש לבחור קובץ JSON תקין.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const restore = async () => {
    if (!pending) return;
    const validation = validateUserBackup(pending.data, mode);
    if (!validation.valid) {
      toast(validation.error);
      return;
    }
    if (mode === 'replace' && !confirmReplace) return;

    setBusy(true);
    try {
      const result = await api.restore(pending.data, mode);
      setBookmarks(result.bookmarks || []);
      setHistory(result.history || []);
      replaceSettings(result.settings || {});
      await refreshUser();
      setPending(null);
      setConfirmReplace(false);
      toast(mode === 'replace' ? 'הנתונים הוחלפו מהגיבוי בהצלחה.' : 'הנתונים מוזגו מהגיבוי בהצלחה.');
    } catch (error) {
      toast((error as Error).message || 'שחזור הגיבוי נכשל. הנתונים הקיימים לא שונו.');
    } finally {
      setBusy(false);
    }
  };

  const isPartial = Boolean(pending?.summary.missingSections.length);
  const canReplace = Boolean(pending && !isPartial);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">גיבוי ושחזור</h2>

      <section className="rounded-3xl border border-outline-variant bg-surface-1 p-5">
        <div className="mb-1 font-medium">יצירת גיבוי</div>
        <p className="mb-3 text-sm text-on-variant">
          הורדת קובץ JSON הכולל סימניות, היסטוריה, חיפושים, הערות והגדרות אישיות.
        </p>
        <Btn variant="filled" onClick={download} disabled={busy}>
          <Download size={16} /> {busy ? 'מכין…' : 'הורד גיבוי'}
        </Btn>
      </section>

      <section className="rounded-3xl border border-outline-variant bg-surface-1 p-5">
        <div className="mb-1 font-medium">שחזור מגיבוי</div>
        <p className="mb-3 text-sm text-on-variant">
          תחילה נבדק מבנה הקובץ ומוצגת תצוגה מקדימה. הנתונים לא משתנים עד לאישור השחזור.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void chooseBackup(event.target.files?.[0])}
        />
        <Btn variant="tonal" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload size={16} /> בחר קובץ גיבוי
        </Btn>

        {pending && (
          <div className="mt-4 rounded-2xl border border-outline-variant bg-surface p-4" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileJson size={20} className="shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="break-all text-sm font-medium">{pending.fileName}</div>
                  <div className="text-xs text-on-variant">
                    {formatBytes(pending.fileSize)} · גרסה {pending.summary.version} · {formatDate(pending.summary.exportedAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setPending(null); setConfirmReplace(false); }}
                className="rounded-full p-1.5 text-on-variant hover:bg-surface-3"
                aria-label="ביטול בחירת הגיבוי"
              >
                <X size={16} />
              </button>
            </div>

            {pending.summary.isLegacy && (
              <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-on-variant">
                זהו גיבוי Web ישן ללא מזהה סוג מפורש. מבנה הנתונים נבדק לפני השחזור.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(SECTION_LABELS) as Array<keyof UserBackupSummary['counts']>).map((key) => (
                <div key={key} className="rounded-xl bg-surface-2 px-3 py-2">
                  <div className="text-xs text-on-variant">{SECTION_LABELS[key]}</div>
                  <div className="text-lg font-semibold tabular-nums">{pending.summary.counts[key].toLocaleString('he-IL')}</div>
                </div>
              ))}
            </div>

            {isPartial && (
              <p className="mt-3 rounded-xl border border-outline-variant p-3 text-sm text-on-variant" role="status">
                הגיבוי חלקי וחסרים בו: {pending.summary.missingSections.map((key) => MISSING_SECTION_LABELS[key] || key).join(', ')}.
                ניתן לבצע מיזוג בלבד; החלפה מלאה חסומה כדי לא למחוק נתונים שלא נכללו בקובץ.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="min-w-[220px] flex-1 text-sm">
                <span className="mb-1 block text-on-variant">אופן השחזור</span>
                <Select
                  value={mode}
                  onChange={(value) => { setMode(value as 'merge' | 'replace'); setConfirmReplace(false); }}
                  options={[
                    { value: 'merge', label: 'מיזוג — שמירת הנתונים הקיימים' },
                    ...(canReplace ? [{ value: 'replace', label: 'החלפה מלאה — דרוש אישור נוסף' }] : []),
                  ]}
                />
              </label>
            </div>

            {mode === 'replace' && canReplace && (
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-outline-variant p-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(event) => setConfirmReplace(event.target.checked)}
                  className="mt-0.5"
                />
                <span>אני מבין שהחלפה מלאה תחליף את הסימניות, ההיסטוריה, החיפושים, ההערות וההגדרות המקומיות.</span>
              </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn
                variant="filled"
                onClick={restore}
                disabled={busy || (mode === 'replace' && !confirmReplace)}
              >
                <Check size={16} /> {busy ? 'משחזר…' : 'אשר שחזור'}
              </Btn>
              <Btn
                variant="outlined"
                onClick={() => { setPending(null); setConfirmReplace(false); }}
                disabled={busy}
              >
                בטל
              </Btn>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-on-variant">
        גיבוי שנוצר בתוכנת אוצריא השולחנית אינו תואם לגיבוי האתר. אין לבחור בו לשחזור באתר.
        גודל הקובץ המרבי: {formatBytes(MAX_USER_BACKUP_FILE_BYTES)}.
      </p>
    </div>
  );
}
