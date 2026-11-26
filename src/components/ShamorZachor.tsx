import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BookMarked, BookOpen, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, Library, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { BookItem, ShamorZachorTrackedBook } from '../types';
import type { LibNode } from '../utils/library';
import { ShamorUnitPicker } from './ShamorUnitPicker';
import {
  addShamorColumn, addTrackedShamorBook, applyShamorRange, buildShamorZachorUnits,
  getShamorAddSearchResults, getShamorProgressSummary, getShamorRangePreview, formatShamorUnitOption, findShamorUnitOptionIndex, MAX_TRACKED_BOOKS,
  normalizeShamorZachorState, removeShamorColumn,
  removeTrackedShamorBook, renameShamorColumn, setShamorColumnAll, toggleShamorUnit,
  updateTrackedShamorBook,
} from '../utils/shamorZachor';

type Filter = 'in_progress' | 'completed' | 'all';
const trackable = (book: BookItem) => !/pdf/i.test(book.fileType || '') && !/\.pdf$/i.test(book.title || '');
const newColumnId = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function ShamorZachor() {
  const { library, libraryLoading, libraryError, reloadLibrary, settings, updateSettings, openBook, toast } = useApp();
  const state = useMemo(() => normalizeShamorZachorState(settings.shamorZachor), [settings.shamorZachor]);
  const [filter, setFilter] = useState<Filter>('in_progress');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addExpanded, setAddExpanded] = useState<Record<string, boolean>>({});
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [addingProgress, setAddingProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [columnLabel, setColumnLabel] = useState('');
  const [rangeColumn, setRangeColumn] = useState('learn');
  const [rangeFrom, setRangeFrom] = useState('0');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeAction, setRangeAction] = useState<'mark' | 'unmark'>('mark');
  const [rangeFromQuery, setRangeFromQuery] = useState('');
  const [rangeToQuery, setRangeToQuery] = useState('');

  const books = Object.values(state.books);
  const selected = selectedId ? state.books[selectedId] : undefined;
  const persist = (next: typeof state) => updateSettings({ shamorZachor: next });
  const updateBook = (bookId: string | number, updater: (book: ShamorZachorTrackedBook) => ShamorZachorTrackedBook) => {
    persist(updateTrackedShamorBook(state, bookId, updater));
  };
  const summary = (book: ShamorZachorTrackedBook) => getShamorProgressSummary(book);
  const completed = books.filter((book) => summary(book).isComplete).length;
  const visible = books.filter((book) => {
    const progress = summary(book);
    if (filter === 'completed' && !progress.isComplete) return false;
    if (filter === 'in_progress' && progress.isComplete) return false;
    return !query.trim() || `${book.title} ${book.categoryPath}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const addSearchResults = useMemo(
    () => getShamorAddSearchResults(library?.books || [], addQuery),
    [library?.books, addQuery],
  );

  const toggleAddBook = (bookId: string, checked: boolean) => {
    setSelectedAddIds((current) => checked
      ? (current.includes(bookId) ? current : [...current, bookId])
      : current.filter((id) => id !== bookId));
  };

  const addSelectedBooks = async () => {
    if (!library || addingProgress) return;
    const selectedBooks = selectedAddIds
      .map((id) => library.byId.get(id))
      .filter((book): book is BookItem => book !== undefined && trackable(book) && !state.books[String(book.id)]);
    if (!selectedBooks.length) {
      setError('בחר ספר אחד לפחות');
      return;
    }

    const availableSlots = Math.max(0, MAX_TRACKED_BOOKS - Object.keys(state.books).length);
    if (!availableSlots) {
      setError(`ניתן לעקוב אחרי עד ${MAX_TRACKED_BOOKS} ספרים`);
      return;
    }
    const booksToAdd = selectedBooks.slice(0, availableSlots);
    let nextState = state;
    let added = 0;
    let failed = 0;
    setError('');
    setAddingProgress({ completed: 0, total: booksToAdd.length });

    try {
      for (let offset = 0; offset < booksToAdd.length; offset += 4) {
        const batch = booksToAdd.slice(offset, offset + 4);
        const results = await Promise.allSettled(batch.map(async (book) => {
          const [tocResult, contentResult] = await Promise.allSettled([
            api.toc(book.id),
            api.content(book.id, 1, 1),
          ]);
          if (tocResult.status === 'rejected' && contentResult.status === 'rejected') {
            throw new Error('לא ניתן לטעון את מבנה הספר');
          }
          const units = buildShamorZachorUnits(
            tocResult.status === 'fulfilled' ? tocResult.value : [],
            contentResult.status === 'fulfilled' ? contentResult.value.totalLines : 0,
          );
          return { book, units };
        }));

        for (const result of results) {
          if (result.status === 'rejected') {
            failed += 1;
            continue;
          }
          const updated = addTrackedShamorBook(nextState, result.value.book, result.value.units);
          if (updated === nextState) {
            failed += 1;
          } else {
            nextState = updated;
            added += 1;
          }
        }
        setAddingProgress({
          completed: Math.min(offset + batch.length, booksToAdd.length),
          total: booksToAdd.length,
        });
      }

      if (added > 0) {
        persist(nextState);
        setAdding(false);
        setSelectedAddIds([]);
        setAddQuery('');
        setAddExpanded({});
        const messages = [`${added} ספרים נוספו למעקב`];
        if (failed) messages.push(`${failed} לא נוספו`);
        if (selectedBooks.length > booksToAdd.length) {
          messages.push(`${selectedBooks.length - booksToAdd.length} חרגו ממגבלת ${MAX_TRACKED_BOOKS}`);
        }
        toast(messages.join(' · '));
      } else {
        setError('לא ניתן להוסיף את הספרים שנבחרו. בדוק את זמינות הספרייה ונסה שוב.');
      }
    } catch (e) {
      setError((e as Error).message || 'הוספת הספרים נכשלה');
    } finally {
      setAddingProgress(null);
    }
  };

  const openAddDialog = () => {
    setAdding(true);
    setError('');
    setAddQuery('');
    setSelectedAddIds([]);
    setAddExpanded({});
  };

  const renderAddBook = (book: BookItem, depth = 0) => {
    const id = String(book.id);
    const tracked = Boolean(state.books[id]);
    const checked = tracked || selectedAddIds.includes(id);
    return (
      <div
        key={id}
        className="border-b border-outline-variant/70"
        style={{ paddingInlineStart: `${8 + depth * 24}px`, paddingInlineEnd: "16px" }}
      >
        <label className={`flex min-h-12 w-full items-center gap-2 py-2 text-right transition-colors hover:bg-surface-2 focus-within:bg-surface-2 ${tracked ? "cursor-default" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={tracked || Boolean(addingProgress)}
            onChange={(event) => toggleAddBook(id, event.target.checked)}
            className="h-[18px] w-[18px] shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={tracked ? `${book.title}, כבר במעקב` : `בחר ${book.title}`}
          />
          <BookOpen size={16} className="shrink-0 text-on-variant" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] text-on-surface">{book.title}</span>
            {tracked && <span className="block truncate text-xs text-on-variant">כבר במעקב</span>}
          </span>
        </label>
      </div>
    );
  };

  const renderCategory: (node: LibNode, depth?: number) => ReactNode = (node, depth = 0) => {
    const visibleBooks = node.books.filter(trackable);
    if (!node.children.length && !visibleBooks.length) return null;
    const expanded = addExpanded[node.path] ?? false;
    return (
      <div key={node.path}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setAddExpanded((current) => ({ ...current, [node.path]: !expanded }))}
          disabled={Boolean(addingProgress)}
          className="flex min-h-[42px] w-full items-center gap-2 border-b border-outline-variant py-[10px] text-right transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60"
          style={{ paddingInlineStart: `${16 + depth * 24}px`, paddingInlineEnd: "16px" }}
        >
          {expanded ? <ChevronDown size={16} className="shrink-0 text-on-variant" /> : <ChevronRight size={16} className="shrink-0 text-on-variant" />}
          {expanded ? <FolderOpen size={20} className="shrink-0 text-primary" /> : <Folder size={20} className="shrink-0 text-primary" />}
          <span className={`min-w-0 flex-1 truncate text-[15px] text-on-surface ${depth === 0 ? "font-bold" : "font-medium"}`}>{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => renderCategory(child, depth + 1))}
            {visibleBooks.map((book) => renderAddBook(book, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const removeBook = (book: ShamorZachorTrackedBook) => {
    if (!window.confirm(`להסיר את "${book.title}" ואת כל סימוני ההתקדמות שלו?`)) return;
    persist(removeTrackedShamorBook(state, book.bookId)); setSelectedId(null); toast('הספר הוסר מהמעקב');
  };
  const openAt = (book: ShamorZachorTrackedBook, line: number) => openBook({ id: book.bookId, title: book.title, categoryPath: book.categoryPath }, line);
  const selectTrackedBook = (bookId: string) => {
    setSelectedId(bookId);
    setRangeFrom('0');
    setRangeTo('');
    setRangeAction('mark');
    setRangeFromQuery('');
    setRangeToQuery('');
  };

  if (selected) {
    const progress = summary(selected);
    const activeRangeColumn = selected.columns.some((column) => column.id === rangeColumn) ? rangeColumn : selected.columns[0].id;
    const rangeToIndex = rangeTo === '' ? selected.units.length - 1 : Number(rangeTo);
    const rangeFromIndex = Number(rangeFrom);
    const rangeFromValue = rangeFromQuery || (selected.units[rangeFromIndex]
      ? formatShamorUnitOption(selected.units[rangeFromIndex], rangeFromIndex)
      : '');
    const rangeToValue = rangeToQuery || (selected.units[rangeToIndex]
      ? formatShamorUnitOption(selected.units[rangeToIndex], rangeToIndex)
      : '');
    const rangeUnitOptions = selected.units.map((unit, index) => {
      const label = formatShamorUnitOption(unit, index);
      return { value: label, label };
    });
    const handleRangeFromChange = (value: string) => {
      setRangeFromQuery(value);
      const index = findShamorUnitOptionIndex(selected.units, value);
      setRangeFrom(index >= 0 ? String(index) : 'invalid');
    };
    const handleRangeToChange = (value: string) => {
      setRangeToQuery(value);
      const index = findShamorUnitOptionIndex(selected.units, value);
      setRangeTo(index >= 0 ? String(index) : 'invalid');
    };
    const rangePreview = getShamorRangePreview(selected, rangeFromIndex, rangeToIndex);
    const applyRange = () => {
      if (!rangePreview.valid) return toast('יש לבחור טווח יחידות תקין');
      updateBook(selected.bookId, (book) => applyShamorRange(
        book,
        activeRangeColumn,
        rangePreview.fromIndex,
        rangePreview.toIndex,
        rangeAction === 'mark',
      ));
    };
    return <section dir="rtl" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-3">
        <div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedId(null)} className="rounded-full p-2 hover:bg-surface-3" aria-label="חזרה"><ArrowLeft size={19}/></button><div><h2 className="font-semibold text-on-surface">{selected.title}</h2><p className="text-xs text-on-variant">{selected.categoryPath} · {selected.units.length} יחידות</p></div></div>
        <button type="button" onClick={() => openAt(selected, selected.units.find((unit) => unit.id === selected.lastTouchedUnitId)?.lineIndex || selected.units[0].lineIndex)} className="rounded-full bg-primary px-4 py-2 text-sm text-on-primary"><BookOpen className="ml-1 inline" size={16}/> פתח במקום האחרון</button>
      </header>
      <div className="rounded-xl border border-outline-variant bg-surface-1 p-4">
        <div className="mb-2 flex justify-between text-sm"><strong>התקדמות בלימוד</strong><span className="tabular-nums">{progress.learningCompleted}/{progress.totalUnits} · {progress.learningPercent}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-primary" style={{width:`${progress.learningPercent}%`}}/></div>
        <p className="mt-2 text-xs text-on-variant">{progress.isComplete ? 'הושלמו כל עמודות הלימוד והחזרה.' : `הושלמו ${progress.fullyCompletedUnits} יחידות בכל העמודות.`}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-outline-variant bg-surface-1 p-3">
        <label className="min-w-40 flex-1 text-xs text-on-variant">עמודת מעקב חדשה<input value={columnLabel} onChange={(e)=>setColumnLabel(e.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface" placeholder="למשל: חזרה נוספת"/></label>
        <button type="button" disabled={!columnLabel.trim() || selected.columns.length >= 8} onClick={()=>{updateBook(selected.bookId,(book)=>addShamorColumn(book,columnLabel,newColumnId()));setColumnLabel('');}} className="rounded-lg bg-sec-container px-3 py-2 text-sm text-on-sec-container disabled:opacity-40"><Plus className="ml-1 inline" size={15}/> הוסף עמודה</button>
        <span className="text-xs text-on-variant">{selected.columns.length}/8</span>
      </div>
      <div className="space-y-3 rounded-xl bg-surface-2 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="min-w-0 text-xs text-on-variant">עמודה
            <select value={activeRangeColumn} onChange={(e)=>setRangeColumn(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm">{selected.columns.map((c)=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </label>
          <div className="min-w-0 text-xs text-on-variant">
            <span className="mb-1 block">מ־</span>
            <ShamorUnitPicker ariaLabel="יחידת התחלה" value={rangeFromValue} options={rangeUnitOptions} onChange={handleRangeFromChange}/>
          </div>
          <div className="min-w-0 text-xs text-on-variant">
            <span className="mb-1 block">עד</span>
            <ShamorUnitPicker ariaLabel="יחידת סיום" value={rangeToValue} options={rangeUnitOptions} onChange={handleRangeToChange}/>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="פעולת סימון טווח" className="inline-flex shrink-0 rounded-lg border border-outline-variant bg-surface p-1">
            <button type="button" aria-pressed={rangeAction === 'mark'} onClick={()=>setRangeAction('mark')} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${rangeAction === 'mark' ? 'bg-sec-container font-semibold text-on-sec-container' : 'text-on-variant hover:bg-surface-2'}`}>סמן</button>
            <button type="button" aria-pressed={rangeAction === 'unmark'} onClick={()=>setRangeAction('unmark')} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${rangeAction === 'unmark' ? 'bg-sec-container font-semibold text-on-sec-container' : 'text-on-variant hover:bg-surface-2'}`}>בטל סימון</button>
          </div>
          <p role="status" className="min-w-0 flex-1 text-xs text-on-variant">
            {rangePreview.valid
              ? `${rangePreview.count} פריטים ${rangeAction === 'mark' ? 'יסומנו' : 'הסימון שלהם יבוטל'} · ${rangePreview.fromLabel} – ${rangePreview.toLabel}`
              : 'יש לבחור טווח יחידות תקין'}
          </p>
          <button type="button" onClick={applyRange} disabled={!rangePreview.valid} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-40">החל טווח</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="w-full min-w-[680px] text-sm"><thead className="bg-surface-2"><tr><th className="sticky right-0 bg-surface-2 p-3 text-right">יחידת לימוד</th>{selected.columns.map((column)=>{const count=(selected.progress[column.id]||[]).length;const all=count===selected.units.length;return <th key={column.id} className="border-r border-outline-variant p-2 text-center"><input key={`${selected.bookId}-${column.id}-${column.label}`} defaultValue={column.label} aria-label={`שם עמודה ${column.label}`} onBlur={(e)=>updateBook(selected.bookId,(book)=>renameShamorColumn(book,column.id,e.target.value))} className="w-full rounded border border-transparent bg-transparent p-1 text-center font-semibold focus:border-primary"/><div className="text-[11px] text-on-variant">{count}/{selected.units.length}</div><div className="flex justify-center gap-1"><button type="button" onClick={()=>updateBook(selected.bookId,(book)=>setShamorColumnAll(book,column.id,!all))} className="text-[11px] text-primary">{all?'בטל הכל':'סמן הכל'}</button><button type="button" disabled={selected.columns.length<=1} onClick={()=>{if(window.confirm('להסיר את העמודה ואת הסימונים שלה?'))updateBook(selected.bookId,(book)=>removeShamorColumn(book,column.id));}} aria-label={`הסר ${column.label}`} className="text-on-variant disabled:opacity-30"><X size={13}/></button></div></th>;})}</tr></thead>
          <tbody>{selected.units.map((unit,index)=><tr key={unit.id} className="border-t border-outline-variant hover:bg-surface-2/70"><td className="sticky right-0 bg-surface-1 p-2"><button type="button" onClick={()=>openAt(selected,unit.lineIndex)} className="text-right hover:text-primary"><span className="block font-medium">{index+1}. {unit.label}</span><span className="text-[11px] text-on-variant">שורה {unit.lineIndex}</span></button></td>{selected.columns.map((column)=><td key={column.id} className="border-r border-outline-variant p-2 text-center"><input type="checkbox" checked={(selected.progress[column.id]||[]).includes(unit.id)} onChange={(e)=>updateBook(selected.bookId,(book)=>toggleShamorUnit(book,column.id,unit.id,e.target.checked))} aria-label={`${column.label}: ${unit.label}`} className="h-4 w-4 accent-primary"/></td>)}</tr>)}</tbody></table>
      </div>
      <div className="flex justify-between text-xs text-on-variant"><span>הסימונים נשמרים בהגדרות המשתמש.</span><button type="button" onClick={()=>removeBook(selected)} className="inline-flex items-center gap-1 text-error"><Trash2 size={14}/> הסר ספר מהמעקב</button></div>
    </section>;
  }

  return <section dir="rtl" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><BookMarked size={22}/></span><div><h2 className="font-semibold text-on-surface">שמור וזכור</h2><p className="text-xs text-on-variant">מעקב לימוד וחזרות לפי יחידות בספר</p></div></div><button type="button" onClick={openAddDialog} disabled={!library||libraryLoading} className="rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"><Plus className="ml-1 inline" size={16}/> הוסף ספרים למעקב</button></header>
    <div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">ספרים</div><strong className="text-xl">{books.length}</strong></div><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">בתהליך</div><strong className="text-xl">{books.length-completed}</strong></div><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">הושלמו</div><strong className="text-xl">{completed}</strong></div></div>
    <div className="flex flex-wrap items-center gap-2">{([['in_progress','בתהליך'],['completed','הושלם'],['all','הכל']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setFilter(value)} className={`rounded-full px-3 py-2 text-sm ${filter===value?'bg-sec-container text-on-sec-container':'text-on-variant hover:bg-surface-3'}`}>{label}</button>)}<label className="relative min-w-44 flex-1"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-variant"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="חיפוש בספרים שבמעקב" className="w-full rounded-full border-outline-variant bg-surface py-2 pr-9 pl-3 text-sm"/></label></div>
    {libraryLoading &&<p className="text-sm text-on-variant">טוען ספרייה…</p>}
    {libraryError &&<p className="text-sm text-error">{libraryError} <button type="button" onClick={reloadLibrary} className="underline">נסה שוב</button></p>}
    {visible.length===0?<div className="rounded-xl border-dashed border-outline-variant p-10 text-center"><BookOpen size={34} className="mx-auto text-on-variant/60"/><h3 className="mt-2 font-semibold">{books.length ? 'אין תוצאות לסינון' : 'עדיין אין ספרים במעקב'}</h3><p className="mt-1 text-sm text-on-variant">הוסף ספר כדי לנהל לימוד וחזרות.</p><button type="button" onClick={openAddDialog} disabled={!library||libraryLoading} className="mt-3 rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50">הוסף ספר</button></div>:<div className="grid gap-3 xl:grid-cols-2">{visible.map((book)=>{const p=summary(book);return <article key={String(book.bookId)} className="rounded-xl border border-outline-variant bg-surface-1 p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={()=>selectTrackedBook(String(book.bookId))} className="min-w-0 flex-1 text-right"><strong className="block truncate hover:text-primary">{book.title}</strong><span className="text-xs text-on-variant">{book.categoryPath} · {book.units.length} יחידות</span></button>{p.isComplete?<CheckCircle2 className="text-primary" size={20}/>:<span className="text-xs text-on-variant">{p.learningPercent}% לימוד</span>}</div><div className="mt-3 h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{width:`${p.learningPercent}%`}}/></div><div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-on-variant">לימוד {p.learningCompleted}/{p.totalUnits} · הושלמו בכל העמודות {p.fullyCompletedUnits}</span><div className="flex items-center gap-2"><button type="button" onClick={()=>openAt(book,book.units.find((unit)=>unit.id===book.lastTouchedUnitId)?.lineIndex||book.units[0].lineIndex)} className="text-primary">פתח ספר</button><button type="button" onClick={()=>selectTrackedBook(String(book.bookId))} aria-label={`נהל ${book.title}`}><ChevronLeft size={17}/></button><button type="button" onClick={()=>removeBook(book)} aria-label={`הסר ${book.title}`} className="text-error"><Trash2 size={15}/></button></div></div></article>;})}</div>}
    {adding && (
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-0 sm:p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !addingProgress) setAdding(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="הוספת ספרים למעקב"
          className="flex h-dvh max-h-dvh w-full max-w-none flex-col overflow-hidden rounded-none bg-surface shadow-2xl sm:h-[85vh] sm:max-h-[85vh] sm:max-w-[720px] sm:rounded-lg sm:border sm:border-outline-variant"
        >
          <header className="flex items-center gap-3 border-b border-outline-variant bg-surface-3 py-2 ps-6 pe-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <Library size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block text-[22px] leading-7 font-semibold text-on-surface">הוספת ספרים למעקב</strong>
              <p className="mt-0.5 text-xs leading-4 text-on-variant">
                בחר ספרים מעץ הספרייה. הספרים שייבחרו יתווספו לרשימת "בתהליך".
              </p>
            </div>
            {selectedAddIds.length > 0 && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-sec-container px-2 py-1 text-xs font-medium text-on-sec-container sm:inline-flex">
                <CheckCircle2 size={16} aria-hidden="true" />
                נבחרו {selectedAddIds.length}
              </span>
            )}
            <button type="button" onClick={() => setAdding(false)} disabled={Boolean(addingProgress)} aria-label="סגור" className="shrink-0 rounded-lg p-2 text-on-variant hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">
              <X size={20} />
            </button>
          </header>
          <div className="border-b border-outline-variant px-6 py-4">
            <label className="relative block">
              <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-variant" aria-hidden="true" />
              <input
                autoFocus
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="חיפוש ספר..."
                className="h-12 w-full rounded-lg border border-outline-variant bg-surface-2 py-2 pr-10 pl-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-variant/80 focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-9 sm:text-[13px]"
              />
            </label>
            {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
            {addingProgress && (
              <p role="status" className="mt-2 text-xs text-on-variant">
                מוסיף ספרים למעקב: {addingProgress.completed}/{addingProgress.total}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 px-6 pb-4">
            <div className="h-full min-h-0 overflow-y-auto rounded-lg border border-outline-variant bg-surface-1">
              {addQuery.trim().length >= 2 ? (
                addSearchResults.length === 0
                  ? <p className="p-6 text-center text-sm text-on-variant">לא נמצאו ספרים מתאימים</p>
                  : addSearchResults.map((book) => renderAddBook(book))
              ) : (
                <>
                  {library?.root.books.map((book) => renderAddBook(book))}
                  {library?.root.children.map((category) => renderCategory(category))}
                </>
              )}
            </div>
          </div>
          <footer className="flex justify-end gap-2 border-t border-outline-variant px-6 pb-4 pt-0">
            <button type="button" onClick={() => setAdding(false)} disabled={Boolean(addingProgress)} className="min-h-10 rounded-lg bg-sec-container px-4 py-2 text-sm font-medium text-on-sec-container transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40">ביטול</button>
            <button
              type="button"
              disabled={selectedAddIds.length === 0 || Boolean(addingProgress)}
              onClick={() => void addSelectedBooks()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              {addingProgress ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" /> }
              {addingProgress ? "מוסיף…" : `הוסף (${selectedAddIds.length})`}
            </button>
          </footer>
        </div>
      </div>
    )}
  </section>;
}
