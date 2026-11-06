import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, X } from 'lucide-react';
import { api } from '../api';
import type { BookItem } from '../types';

type BookInfoResponse = { book?: Partial<BookItem>; source?: string };

export default function BookInfoDialog({
  book,
  onClose,
}: {
  book: BookItem | null;
  onClose: () => void;
}) {
  const [serverBook, setServerBook] = useState<Partial<BookItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!book) {
      setServerBook(null);
      setLoading(false);
      setLoadError('');
      return;
    }
    let cancelled = false;
    setServerBook(null);
    setLoading(true);
    setLoadError('');
    api.bookInfo(book.id)
      .then((response: BookInfoResponse) => {
        if (!cancelled) setServerBook(response.book || null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('לא ניתן היה לטעון פרטים נוספים מהשרת; מוצגים הפרטים הזמינים בקטלוג.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [book?.id]);

  useEffect(() => {
    if (!book) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, onClose]);

  if (!book) return null;
  const merged = { ...book, ...(serverBook || {}) };
  const fields: { label: string; value: string }[] = [
    { label: 'מחבר', value: merged.author || '' },
    { label: 'תיאור', value: merged.heDesc || '' },
    { label: 'קטגוריה', value: merged.categoryPath || merged.heCategories || '' },
    { label: 'תקופה', value: merged.heEra || '' },
    { label: 'שנת פרסום', value: merged.pubDate || '' },
    { label: 'מקום פרסום', value: merged.pubPlace || '' },
    { label: 'סוג קובץ', value: merged.fileType || '' },
    { label: 'מספר ספר בקטלוג', value: String(merged.id) },
    { label: 'תוכן עניינים', value: merged.hasToc === undefined ? '' : merged.hasToc ? 'קיים' : 'לא זמין' },
    { label: 'קישורים ומפרשים', value: merged.hasLinks === undefined ? '' : merged.hasLinks ? 'קיימים' : 'לא זמינים' },
  ].filter((field) => field.value.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/45 p-3 sm:p-5" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="book-info-title" dir="rtl"
        className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface text-on-surface shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-outline-variant px-4 py-3.5 sm:px-5">
          <div className="mt-0.5 rounded-xl bg-primary-container p-2 text-on-primary-container"><BookOpen size={21} /></div>
          <div className="min-w-0 flex-1">
            <h2 id="book-info-title" className="text-base font-semibold">מידע על הספר</h2>
            <p className="mt-1 break-words text-sm text-on-variant">{merged.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="סגור מידע על הספר" className="rounded-full p-2 text-on-variant hover:bg-surface-3"><X size={19} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading && <p className="mb-3 flex items-center gap-2 text-xs text-on-variant"><LoaderCircle size={14} className="animate-spin" />טוען פרטים נוספים מהשרת...</p>}
          {fields.length > 0 ? (
            <dl className="divide-y divide-outline-variant">
              {fields.map((field) => (
                <div key={field.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="text-on-variant">{field.label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="py-3 text-sm text-on-variant">אין בקטלוג מידע נוסף על הספר הזה.</p>}
          {loadError && <p className="mt-3 text-xs leading-5 text-on-variant">{loadError}</p>}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-outline-variant px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90">סגור</button>
        </footer>
      </section>
    </div>
  );
}
