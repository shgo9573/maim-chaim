import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, Bookmark, BookOpen, Calculator, CalendarCheck, CalendarDays, Check, DatabaseBackup, Download, FolderOpen, History, MessageSquare, PenLine, Search, Trash2, Upload, X } from 'lucide-react';
import DailyStudy from './DailyStudy';
import CalendarZmanim from './CalendarZmanim';
import TzuratHaDaf from './TzuratHaDaf';
import { api } from '../api';
import { useApp } from '../store';
import { Btn, EmptyState, Select, Spinner } from './ui';
import { gematria, timeAgo } from '../utils/text';
import type { PersonalNote, ServerStatus } from '../types';
import { filterAndSortPersonalNotes, type PersonalNotesSortOrder } from '../utils/personalNotes';
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
        <div className={`mx-auto p-4 md:p-6 ${tool === 'daf' ? 'h-full max-w-5xl' : tool === 'notes' ? 'h-full max-w-none' : 'max-w-3xl'}`}>
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

type NotesImportStrategy = 'merge' | 'skip' | 'keepBoth' | 'overwrite';

function downloadNotesFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function NotesView() {
  const { notes, deleteNote, saveNote, openBook, library, toast } = useApp();
  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<PersonalNotesSortOrder>(() => {
    try {
      const saved = localStorage.getItem('otz_personal_notes_sort');
      return saved === 'newest' || saved === 'oldest' ? saved : 'bookLocation';
    } catch {
      return 'bookLocation';
    }
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editing, setEditing] = useState<PersonalNote | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingImport, setPendingImport] = useState<PersonalNote[] | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('otz_personal_notes_sort', sortOrder);
    } catch {
      // Sorting remains available for this session when storage is blocked.
    }
  }, [sortOrder]);

  const booksWithNotes = useMemo(() => {
    const grouped = new Map<string, { id: string; title: string; categoryPath: string; count: number }>();
    for (const note of notes) {
      const id = String(note.bookId);
      const book = library?.byId.get(id);
      const current = grouped.get(id);
      if (current) {
        current.count += 1;
      } else {
        grouped.set(id, {
          id,
          title: book?.title || id,
          categoryPath: book?.categoryPath || '',
          count: 1,
        });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => a.title.localeCompare(b.title, 'he'));
  }, [notes, library]);

  const categoriesWithNotes = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const book of booksWithNotes) {
      if (!book.categoryPath) continue;
      grouped.set(book.categoryPath, (grouped.get(book.categoryPath) || 0) + book.count);
    }
    return Array.from(grouped.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => a.path.localeCompare(b.path, 'he'));
  }, [booksWithNotes]);

  const visibleNotes = useMemo(
    () =>
      filterAndSortPersonalNotes(
        notes,
        (id) => {
          const book = library?.byId.get(String(id));
          return book ? { title: book.title, categoryPath: book.categoryPath } : undefined;
        },
        { query, bookId: bookFilter, categoryPath: categoryFilter, dateFrom, dateTo, sortOrder },
      ),
    [notes, library, query, bookFilter, categoryFilter, dateFrom, dateTo, sortOrder],
  );

  const clearFilters = () => {
    setQuery('');
    setBookFilter('all');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const openNote = (note: PersonalNote) => {
    const book = library?.byId.get(String(note.bookId));
    openBook(
      { id: note.bookId, title: book?.title || String(note.bookId), categoryPath: book?.categoryPath },
      note.line,
    );
  };

  const saveEditedNote = () => {
    if (!editing) return;
    const text = draft.trim();
    if (!text) {
      toast('יש להזין תוכן להערה');
      return;
    }
    saveNote({
      id: editing.id,
      bookId: editing.bookId,
      line: editing.line,
      heRef: editing.heRef,
      text,
    });
    setEditing(null);
    setDraft('');
    toast('החידוש עודכן');
  };

  const removeNote = (note: PersonalNote) => {
    if (!window.confirm('למחוק את החידוש הזה לצמיתות?')) return;
    deleteNote(note.id);
    toast('החידוש נמחק');
  };

  const exportJson = () => {
    if (!visibleNotes.length) return;
    const payload = {
      type: 'otzaria_web_notes_backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: visibleNotes.map(({ note }) => note),
    };
    downloadNotesFile(
      'maim-chaim-notes-backup.json',
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
    toast(`יוצאו ${visibleNotes.length} הערות`);
  };

  const exportText = () => {
    if (!visibleNotes.length) return;
    const content = visibleNotes
      .map(({ note, bookTitle }, index) => {
        const location = note.heRef || `שורה ${note.line + 1}`;
        return `[${index + 1}] ${bookTitle} — ${location}\nעודכן: ${new Date(note.updatedAt).toLocaleString('he-IL')}\n\n${note.text}`;
      })
      .join('\n\n------------------------------------------------------------\n\n');
    downloadNotesFile('maim-chaim-notes.txt', `חידושי תורה אישיים\n\n${content}`, 'text/plain;charset=utf-8');
    toast(`יוצאו ${visibleNotes.length} הערות לקובץ טקסט`);
  };

  const loadImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        type?: unknown;
        notes?: unknown;
      };
      if (
        typeof parsed.type !== 'string' ||
        !parsed.type.startsWith('otzaria_web') ||
        !Array.isArray(parsed.notes)
      ) {
        throw new Error('זה אינו קובץ גיבוי הערות של מיים חיים');
      }

      const imported = parsed.notes.flatMap((value, index) => {
        if (!value || typeof value !== 'object') return [];
        const raw = value as Record<string, unknown>;
        const bookId = raw.bookId;
        const rawText = typeof raw.text === 'string'
          ? raw.text
          : typeof raw.noteContent === 'string'
            ? raw.noteContent
            : '';
        if ((typeof bookId !== 'string' && typeof bookId !== 'number') || !rawText.trim()) return [];
        const parsedLine = Number(raw.line ?? raw.lineIndex ?? 0);
        const updatedAt = typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt))
          ? raw.updatedAt
          : new Date().toISOString();
        return [{
          id: typeof raw.id === 'string' && raw.id ? raw.id : `import_${Date.now().toString(36)}_${index}`,
          bookId,
          line: Number.isInteger(parsedLine) && parsedLine >= 0 ? parsedLine : 0,
          heRef: typeof raw.heRef === 'string' ? raw.heRef : typeof raw.ref === 'string' ? raw.ref : undefined,
          text: rawText.trim(),
          updatedAt,
        } satisfies PersonalNote];
      });

      if (!imported.length) throw new Error('לא נמצאו בקובץ הערות תקינות לייבוא');
      setImportFileName(file.name);
      setPendingImport(imported);
    } catch (error) {
      toast(`ייבוא ההערות נכשל: ${(error as Error).message}`);
    }
  };

  const applyImport = (strategy: NotesImportStrategy) => {
    if (!pendingImport) return;
    const byId = new Map(notes.map((note) => [note.id, note]));
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let duplicated = 0;

    pendingImport.forEach((incoming, index) => {
      const existing = byId.get(incoming.id);
      if (!existing) {
        saveNote({
          id: incoming.id,
          bookId: incoming.bookId,
          line: incoming.line,
          heRef: incoming.heRef,
          text: incoming.text,
        });
        byId.set(incoming.id, incoming);
        inserted += 1;
        return;
      }

      if (strategy === 'skip') {
        skipped += 1;
      } else if (strategy === 'overwrite') {
        saveNote({
          id: existing.id,
          bookId: incoming.bookId,
          line: incoming.line,
          heRef: incoming.heRef,
          text: incoming.text,
        });
        updated += 1;
      } else if (strategy === 'merge') {
        const mergedText = existing.text.trim() === incoming.text.trim()
          ? existing.text
          : [existing.text.trim(), incoming.text.trim()].filter(Boolean).join('\n\n');
        saveNote({
          id: existing.id,
          bookId: existing.bookId,
          line: existing.line,
          heRef: existing.heRef,
          text: mergedText,
        });
        updated += 1;
      } else {
        const id = `${incoming.id}_copy_${Date.now().toString(36)}_${index}`;
        saveNote({
          id,
          bookId: incoming.bookId,
          line: incoming.line,
          heRef: incoming.heRef,
          text: incoming.text,
        });
        inserted += 1;
        duplicated += 1;
      }
    });

    setPendingImport(null);
    setImportFileName('');
    toast(`הייבוא הושלם: ${inserted} נוספו, ${updated} עודכנו, ${skipped} דולגו, ${duplicated} נשמרו כעותק`);
  };

  const conflicts = pendingImport?.filter((note) => notes.some((current) => current.id === note.id)).length || 0;

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">הערות אישיות</h2>
          <p className="mt-1 text-xs text-on-variant">ניהול החידושים שנשמרו במהלך הלימוד</p>
        </div>
        <span className="rounded-full border border-outline-variant bg-surface-1 px-3 py-1 text-xs font-semibold text-on-variant">
          {visibleNotes.length} מתוך {notes.length} הערות
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[190px] flex-1">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חפש בהערות..."
            aria-label="חיפוש בהערות"
            className="h-9 w-full rounded-full border border-outline-variant bg-surface-1 pr-9 pl-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-on-variant hover:bg-surface-3" aria-label="נקה חיפוש">
              <X size={13} />
            </button>
          )}
        </label>

        <label className="flex h-9 items-center gap-2 rounded-full border border-outline-variant bg-surface-1 px-3 text-xs text-on-variant">
          <span>מיון</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as PersonalNotesSortOrder)}
            className="max-w-[150px] bg-transparent text-sm text-on-surface outline-none"
            aria-label="מיון הערות"
          >
            <option value="bookLocation">לפי ספר ומיקום</option>
            <option value="newest">עודכנו לאחרונה</option>
            <option value="oldest">עודכנו מהישן לחדש</option>
          </select>
        </label>

        <button type="button" onClick={exportJson} disabled={!visibleNotes.length} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-outline-variant px-3 text-xs font-medium text-on-variant transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40">
          <Download size={15} /> גיבוי JSON
        </button>
        <button type="button" onClick={exportText} disabled={!visibleNotes.length} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-outline-variant px-3 text-xs font-medium text-on-variant transition hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40">
          <Download size={15} /> ייצוא טקסט
        </button>
        <button type="button" onClick={() => importInput.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-on-primary transition hover:brightness-95">
          <Upload size={15} /> ייבוא גיבוי
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadImportFile(file);
            event.target.value = '';
          }}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="max-h-56 overflow-y-auto rounded-xl border border-outline-variant bg-surface-1 p-2 md:max-h-none">
          <button
            type="button"
            onClick={() => { setBookFilter('all'); setCategoryFilter('all'); }}
            className={`mb-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${bookFilter === 'all' && categoryFilter === 'all' ? 'bg-sec-container font-semibold text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`}
          >
            <span className="flex items-center gap-2"><FolderOpen size={16} /> כל ההערות</span>
            <span className="text-xs">{notes.length}</span>
          </button>

          {categoriesWithNotes.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold tracking-wide text-on-variant">קטגוריות</div>
              {categoriesWithNotes.map((category) => (
                <button
                  key={category.path}
                  type="button"
                  onClick={() => { setCategoryFilter(category.path); setBookFilter('all'); }}
                  className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-xs transition ${categoryFilter === category.path ? 'bg-sec-container font-semibold text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`}
                >
                  <span className="min-w-0 truncate">{category.path}</span>
                  <span className="shrink-0 text-[10px]">{category.count}</span>
                </button>
              ))}
            </>
          )}

          <div className="px-3 pb-1 pt-3 text-[10px] font-bold tracking-wide text-on-variant">ספרים</div>
          {booksWithNotes.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => { setBookFilter(book.id); setCategoryFilter('all'); }}
              className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-xs transition ${bookFilter === book.id ? 'bg-sec-container font-semibold text-on-sec-container' : 'text-on-variant hover:bg-surface-3'}`}
            >
              <span className="min-w-0 truncate">{book.title}</span>
              <span className="shrink-0 text-[10px]">{book.count}</span>
            </button>
          ))}
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-1 px-3 py-2">
            <span className="text-xs font-semibold text-on-variant">סינון לפי תאריך עדכון</span>
            <label className="flex items-center gap-1 text-[11px] text-on-variant">
              <span>מ־</span>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="h-7 rounded-md border border-outline-variant bg-surface px-1.5 text-xs text-on-surface" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-on-variant">
              <span>עד</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="h-7 rounded-md border border-outline-variant bg-surface px-1.5 text-xs text-on-surface" />
            </label>
            {(query || bookFilter !== 'all' || categoryFilter !== 'all' || dateFrom || dateTo) && (
              <button type="button" onClick={clearFilters} className="mr-auto text-xs font-medium text-primary hover:underline">נקה סינון</button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {visibleNotes.length === 0 ? (
              <EmptyState
                icon={<PenLine size={44} />}
                title={notes.length ? 'לא נמצאו הערות מתאימות' : 'אין חידושים עדיין'}
                hint={notes.length ? 'נסה לשנות את החיפוש או את הסינון.' : 'בפאנל המפרשים של כל ספר אפשר להוסיף חידוש לשורה הנלמדת.'}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {visibleNotes.map(({ note, bookTitle, categoryPath }) => (
                  <article key={note.id} className="group flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-1 p-2 transition hover:border-primary/40 hover:bg-surface-2">
                    <button type="button" onClick={() => openNote(note)} className="min-w-0 flex-1 rounded-lg px-2 py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-primary">
                        <BookOpen size={14} className="shrink-0" />
                        <span>{bookTitle}</span>
                        <span className="text-xs font-normal text-on-variant">{note.heRef || `שורה ${note.line + 1}`}</span>
                      </div>
                      {categoryPath && <div className="mt-0.5 text-[10px] text-on-variant">{categoryPath}</div>}
                      <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-on-surface" style={{ fontFamily: '"Frank Ruhl Libre", serif' }}>{note.text}</div>
                      <div className="mt-2 text-[10px] text-on-variant">{timeAgo(note.updatedAt)}</div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-1 pt-1">
                      <button type="button" onClick={() => { setEditing(note); setDraft(note.text); }} className="rounded-full p-2 text-on-variant transition hover:bg-surface-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" title="ערוך חידוש" aria-label="ערוך חידוש">
                        <PenLine size={16} />
                      </button>
                      <button type="button" onClick={() => removeNote(note)} className="rounded-full p-2 text-on-variant transition hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40" title="מחק חידוש" aria-label="מחק חידוש">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-personal-note-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-outline-variant bg-surface text-on-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <div>
                <h3 id="edit-personal-note-title" className="font-semibold">עריכת חידוש תורה</h3>
                <p className="mt-1 text-xs text-on-variant">{library?.byId.get(String(editing.bookId))?.title || String(editing.bookId)} · {editing.heRef || `שורה ${editing.line + 1}`}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full p-2 text-on-variant hover:bg-surface-3" aria-label="סגור"><X size={18} /></button>
            </header>
            <div className="p-5">
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={9}
                className="w-full resize-y rounded-xl border border-outline-variant bg-surface-1 p-3 text-base leading-7 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                style={{ fontFamily: '"Frank Ruhl Libre", serif' }}
                aria-label="תוכן החידוש"
              />
            </div>
            <footer className="flex justify-end gap-2 border-t border-outline-variant bg-surface-1 px-5 py-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full px-4 py-2 text-sm text-on-variant hover:bg-surface-3">ביטול</button>
              <button type="button" onClick={saveEditedNote} disabled={!draft.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40">
                <Check size={15} /> שמור
              </button>
            </footer>
          </section>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingImport(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="import-personal-notes-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-outline-variant bg-surface text-on-surface shadow-2xl">
            <header className="border-b border-outline-variant px-5 py-4">
              <h3 id="import-personal-notes-title" className="font-semibold">ייבוא הערות אישיות</h3>
              <p className="mt-1 text-xs text-on-variant">{importFileName} · {pendingImport.length} הערות תקינות · {conflicts} מזהים שכבר קיימים</p>
            </header>
            <div className="p-5 text-sm leading-6 text-on-variant">
              בחר כיצד לטפל בהערות שהמזהה שלהן כבר קיים. מיזוג שומר את הטקסט הקיים ומוסיף אחריו את הטקסט החדש, אם הוא שונה.
            </div>
            <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2">
              <button type="button" onClick={() => applyImport('merge')} className="rounded-xl border border-outline-variant px-3 py-2.5 text-sm hover:bg-surface-2">מזג הערות</button>
              <button type="button" onClick={() => applyImport('skip')} className="rounded-xl border border-outline-variant px-3 py-2.5 text-sm hover:bg-surface-2">דלג על כפולים</button>
              <button type="button" onClick={() => applyImport('keepBoth')} className="rounded-xl border border-outline-variant px-3 py-2.5 text-sm hover:bg-surface-2">שמור גם וגם</button>
              <button type="button" onClick={() => applyImport('overwrite')} className="rounded-xl bg-error px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95">דרוס קיימות</button>
            </div>
            <div className="border-t border-outline-variant px-5 py-3 text-end">
              <button type="button" onClick={() => setPendingImport(null)} className="text-sm text-on-variant hover:underline">ביטול ייבוא</button>
            </div>
          </section>
        </div>
      )}
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
