import { useMemo, useState } from 'react';
import { ArrowLeft, BookMarked, BookOpen, CheckCircle2, ChevronLeft, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { BookItem, ShamorZachorTrackedBook } from '../types';
import {
  addShamorColumn, addTrackedShamorBook, applyShamorRange, buildShamorZachorUnits,
  getShamorProgressSummary, normalizeShamorZachorState, removeShamorColumn,
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
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [columnLabel, setColumnLabel] = useState('');
  const [rangeColumn, setRangeColumn] = useState('learn');
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('1');

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
  const candidates = (library?.books || []).filter(trackable)
    .filter((book) => !state.books[String(book.id)])
    .filter((book) => !addQuery.trim() || `${book.title} ${book.categoryPath} ${book.author || ''}`.toLocaleLowerCase().includes(addQuery.trim().toLocaleLowerCase()))
    .slice(0, 60);

  const addBook = async (book: BookItem) => {
    if (addingId) return;
    setAddingId(String(book.id)); setError('');
    try {
      const [tocResult, contentResult] = await Promise.allSettled([api.toc(book.id), api.content(book.id, 1, 1)]);
      if (tocResult.status === 'rejected' && contentResult.status === 'rejected') throw new Error('לא ניתן לטעון את מבנה הספר');
      const units = buildShamorZachorUnits(tocResult.status === 'fulfilled' ? tocResult.value : [], contentResult.status === 'fulfilled' ? contentResult.value.totalLines : 0);
      const next = addTrackedShamorBook(state, book, units);
      if (next === state) throw new Error('הספר כבר במעקב או שהגעת למגבלת הספרים');
      persist(next); setSelectedId(String(book.id)); setAdding(false); setAddQuery('');
      toast(`הספר ${book.title} נוסף למעקב`);
    } catch (e) { setError((e as Error).message || 'הוספת הספר נכשלה'); }
    finally { setAddingId(null); }
  };

  const removeBook = (book: ShamorZachorTrackedBook) => {
    if (!window.confirm(`להסיר את "${book.title}" ואת כל סימוני ההתקדמות שלו?`)) return;
    persist(removeTrackedShamorBook(state, book.bookId)); setSelectedId(null); toast('הספר הוסר מהמעקב');
  };
  const openAt = (book: ShamorZachorTrackedBook, line: number) => openBook({ id: book.bookId, title: book.title, categoryPath: book.categoryPath }, line);

  if (selected) {
    const progress = summary(selected);
    const activeRangeColumn = selected.columns.some((column) => column.id === rangeColumn) ? rangeColumn : selected.columns[0].id;
    const applyRange = (checked: boolean) => {
      const from = Number(rangeFrom), to = Number(rangeTo);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > selected.units.length || to > selected.units.length) return toast('יש לבחור טווח יחידות תקין');
      updateBook(selected.bookId, (book) => applyShamorRange(book, activeRangeColumn, from - 1, to - 1, checked));
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
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-3">
        <label className="min-w-36 flex-1 text-xs text-on-variant">עמודה<select value={activeRangeColumn} onChange={(e)=>setRangeColumn(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm">{selected.columns.map((c)=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="w-24 text-xs text-on-variant">מיחידה<input type="number" min="1" max={selected.units.length} value={rangeFrom} onChange={(e)=>setRangeFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm"/></label>
        <label className="w-24 text-xs text-on-variant">עד יחידה<input type="number" min="1" max={selected.units.length} value={rangeTo} onChange={(e)=>setRangeTo(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm"/></label>
        <button type="button" onClick={()=>applyRange(true)} className="rounded-lg bg-primary px-3 py-2 text-sm text-on-primary">סמן טווח</button>
        <button type="button" onClick={()=>applyRange(false)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm">בטל טווח</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="w-full min-w-[680px] text-sm"><thead className="bg-surface-2"><tr><th className="sticky right-0 bg-surface-2 p-3 text-right">יחידת לימוד</th>{selected.columns.map((column)=>{const count=(selected.progress[column.id]||[]).length;const all=count===selected.units.length;return <th key={column.id} className="border-r border-outline-variant p-2 text-center"><input key={`${selected.bookId}-${column.id}-${column.label}`} defaultValue={column.label} aria-label={`שם עמודה ${column.label}`} onBlur={(e)=>updateBook(selected.bookId,(book)=>renameShamorColumn(book,column.id,e.target.value))} className="w-full rounded border border-transparent bg-transparent p-1 text-center font-semibold focus:border-primary"/><div className="text-[11px] text-on-variant">{count}/{selected.units.length}</div><div className="flex justify-center gap-1"><button type="button" onClick={()=>updateBook(selected.bookId,(book)=>setShamorColumnAll(book,column.id,!all))} className="text-[11px] text-primary">{all?'בטל הכל':'סמן הכל'}</button><button type="button" disabled={selected.columns.length<=1} onClick={()=>{if(window.confirm('להסיר את העמודה ואת הסימונים שלה?'))updateBook(selected.bookId,(book)=>removeShamorColumn(book,column.id));}} aria-label={`הסר ${column.label}`} className="text-on-variant disabled:opacity-30"><X size={13}/></button></div></th>;})}</tr></thead>
          <tbody>{selected.units.map((unit,index)=><tr key={unit.id} className="border-t border-outline-variant hover:bg-surface-2/70"><td className="sticky right-0 bg-surface-1 p-2"><button type="button" onClick={()=>openAt(selected,unit.lineIndex)} className="text-right hover:text-primary"><span className="block font-medium">{index+1}. {unit.label}</span><span className="text-[11px] text-on-variant">שורה {unit.lineIndex}</span></button></td>{selected.columns.map((column)=><td key={column.id} className="border-r border-outline-variant p-2 text-center"><input type="checkbox" checked={(selected.progress[column.id]||[]).includes(unit.id)} onChange={(e)=>updateBook(selected.bookId,(book)=>toggleShamorUnit(book,column.id,unit.id,e.target.checked))} aria-label={`${column.label}: ${unit.label}`} className="h-4 w-4 accent-primary"/></td>)}</tr>)}</tbody></table>
      </div>
      <div className="flex justify-between text-xs text-on-variant"><span>הסימונים נשמרים בהגדרות המשתמש.</span><button type="button" onClick={()=>removeBook(selected)} className="inline-flex items-center gap-1 text-error"><Trash2 size={14}/> הסר ספר מהמעקב</button></div>
    </section>;
  }

  return <section dir="rtl" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant pb-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><BookMarked size={22}/></span><div><h2 className="font-semibold text-on-surface">שמור וזכור</h2><p className="text-xs text-on-variant">מעקב לימוד וחזרות לפי יחידות בספר</p></div></div><button type="button" onClick={()=>{setAdding(true);setError('');}} disabled={!library||libraryLoading} className="rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"><Plus className="ml-1 inline" size={16}/> הוסף ספרים למעקב</button></header>
    <div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">ספרים</div><strong className="text-xl">{books.length}</strong></div><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">בתהליך</div><strong className="text-xl">{books.length-completed}</strong></div><div className="rounded-xl border border-outline-variant bg-surface-1 p-3"><div className="text-xs text-on-variant">הושלמו</div><strong className="text-xl">{completed}</strong></div></div>
    <div className="flex flex-wrap items-center gap-2">{([['in_progress','בתהליך'],['completed','הושלם'],['all','הכל']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setFilter(value)} className={`rounded-full px-3 py-2 text-sm ${filter===value?'bg-sec-container text-on-sec-container':'text-on-variant hover:bg-surface-3'}`}>{label}</button>)}<label className="relative min-w-44 flex-1"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-variant"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="חיפוש בספרים שבמעקב" className="w-full rounded-full border-outline-variant bg-surface py-2 pr-9 pl-3 text-sm"/></label></div>
    {libraryLoading &&<p className="text-sm text-on-variant">טוען ספרייה…</p>}
    {libraryError &&<p className="text-sm text-error">{libraryError} <button type="button" onClick={reloadLibrary} className="underline">נסה שוב</button></p>}
    {visible.length===0?<div className="rounded-xl border-dashed border-outline-variant p-10 text-center"><BookOpen size={34} className="mx-auto text-on-variant/60"/><h3 className="mt-2 font-semibold">{books.length ? 'אין תוצאות לסינון' : 'עדיין אין ספרים במעקב'}</h3><p className="mt-1 text-sm text-on-variant">הוסף ספר כדי לנהל לימוד וחזרות.</p><button type="button" onClick={()=>setAdding(true)} disabled={!library||libraryLoading} className="mt-3 rounded-full bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50">הוסף ספר</button></div>:<div className="grid gap-3 xl:grid-cols-2">{visible.map((book)=>{const p=summary(book);return <article key={String(book.bookId)} className="rounded-xl border border-outline-variant bg-surface-1 p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={()=>setSelectedId(String(book.bookId))} className="min-w-0 flex-1 text-right"><strong className="block truncate hover:text-primary">{book.title}</strong><span className="text-xs text-on-variant">{book.categoryPath} · {book.units.length} יחידות</span></button>{p.isComplete?<CheckCircle2 className="text-primary" size={20}/>:<span className="text-xs text-on-variant">{p.learningPercent}% לימוד</span>}</div><div className="mt-3 h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{width:`${p.learningPercent}%`}}/></div><div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-on-variant">לימוד {p.learningCompleted}/{p.totalUnits} · הושלמו בכל העמודות {p.fullyCompletedUnits}</span><div className="flex items-center gap-2"><button type="button" onClick={()=>openAt(book,book.units.find((unit)=>unit.id===book.lastTouchedUnitId)?.lineIndex||book.units[0].lineIndex)} className="text-primary">פתח ספר</button><button type="button" onClick={()=>setSelectedId(String(book.bookId))} aria-label={`נהל ${book.title}`}><ChevronLeft size={17}/></button><button type="button" onClick={()=>removeBook(book)} aria-label={`הסר ${book.title}`} className="text-error"><Trash2 size={15}/></button></div></div></article>;})}</div>}
    {adding&&<div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-3" onMouseDown={(e)=>{if(e.target===e.currentTarget)setAdding(false);}}><div role="dialog" aria-modal="true" aria-label="הוספת ספרים למעקב" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-outline-variant bg-surface shadow-2xl"><header className="flex items-center justify-between border-b border-outline-variant p-4"><strong>הוספת ספרים למעקב</strong><button type="button" onClick={()=>setAdding(false)} aria-label="סגור"><X size={19}/></button></header><div className="p-3"><input autoFocus value={addQuery} onChange={(e)=>setAddQuery(e.target.value)} placeholder="חפש ספר, מחבר או קטגוריה" className="w-full rounded-lg border border-outline-variant bg-surface-1 px-3 py-2 text-sm"/>{error&&<p role="alert" className="mt-2 text-sm text-error">{error}</p>}</div><div className="min-h-0 flex-1 overflow-y-auto p-2">{candidates.length===0?<p className="p-5 text-center text-sm text-on-variant">לא נמצאו ספרים זמינים</p>:candidates.map((book)=><div key={String(book.id)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{book.title}</strong><span className="text-xs text-on-variant">{book.categoryPath}</span></div><button type="button" disabled={Boolean(addingId)} onClick={()=>void addBook(book)} className="rounded-full bg-sec-container px-3 py-2 text-xs text-on-sec-container disabled:opacity-50">{addingId===String(book.id)?'טוען…':<><Plus className="ml-1 inline" size={13}/>הוסף</>}</button></div>)}</div><footer className="flex justify-between border-t border-outline-variant p-3 text-xs text-on-variant"><span>עד 60 תוצאות מוצגות</span><button type="button" onClick={()=>setAdding(false)}>סיום</button></footer></div></div>}
  </section>;
}
