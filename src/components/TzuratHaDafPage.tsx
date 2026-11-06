import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Home } from 'lucide-react';
import { TzuratHaDafView, findShasTractate } from './TzuratHaDafView';
import { useApp } from '../store';

/**
 * Standalone Tzurat HaDaf workspace. It is intentionally rendered at /tzuratadaf
 * outside the main app shell, so the PDF, bubble hit areas and commentary panel
 * have a stable, opaque viewport and are not clipped by the book reader.
 */
export default function TzuratHaDafPage() {
  const { settings } = useApp();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedName = params.get('masechta') || params.get('book') || 'ברכות';
  const tractate = findShasTractate(requestedName)?.name || requestedName;
  const dafValue = Number(params.get('daf') || 2);
  const daf = Number.isFinite(dafValue) && dafValue >= 2 ? Math.floor(dafValue) : 2;
  const amud = params.get('amud') === 'b' ? 'b' : 'a';
  const initialDaf = `דף ${daf} ע״${amud === 'a' ? 'א' : 'ב'}`;
  const dark = settings.theme === 'dark';
  const appBasePath = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const requestedBookId = params.get('bookId');
  const suppliedBookId = requestedBookId && /^\d+$/.test(requestedBookId) ? requestedBookId : undefined;
  const [resolvedBookId, setResolvedBookId] = useState<string | undefined>(suppliedBookId);

  // This route can also be opened from the general Tzurat HaDaf screen, which
  // does not know the open reader tab's book ID. Resolve the real Bavli book from
  // the live catalogue instead of relying on guessed numeric IDs.
  useEffect(() => {
    if (suppliedBookId) {
      setResolvedBookId(suppliedBookId);
      return;
    }
    let cancelled = false;
    fetch('/api/library/tree')
      .then(async response => {
        if (!response.ok) throw new Error('לא ניתן לטעון את קטלוג הספרים');
        return await response.json() as {
          books?: Array<{ id?: string | number; title?: string; categoryPath?: string }>;
        };
      })
      .then(data => {
        const candidates = (Array.isArray(data.books) ? data.books : [])
          .filter(book => book.id !== undefined && findShasTractate(String(book.title || ''))?.name === tractate)
          .sort((a, b) => {
            const score = (book: { title?: string; categoryPath?: string }) => {
              const title = String(book.title || '').trim();
              const category = String(book.categoryPath || '');
              const matchesMainTalmud = /תלמוד|גמרא|בבלי/u.test(title + ' ' + category);
              const isCommentaryTitle = /רש[״"׳']?י|תוספות|מהרש[״"׳']?א|חידושי|פירוש|ביאור/u.test(title);
              return (title === tractate ? 30 : 0)
                + (/^תלמוד בבלי/u.test(title) ? 25 : 0)
                + (/^גמרא/u.test(title) ? 20 : 0)
                + (matchesMainTalmud ? 10 : 0)
                - (isCommentaryTitle ? 35 : 0);
            };
            return score(b) - score(a);
          });
        if (!cancelled && candidates[0]?.id !== undefined) {
          setResolvedBookId(String(candidates[0].id));
        }
      })
      .catch(error => {
        if (!cancelled) console.warn('[TzuratHaDaf] could not resolve tractate book ID:', error);
      });
    return () => { cancelled = true; };
  }, [suppliedBookId, tractate]);

  return (
    <main dir="rtl" className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface text-on-surface">
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant bg-surface px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary p-1.5 text-on-primary"><BookOpen size={17} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-serif text-sm font-bold">מיים חיים · צורת הדף</h1>
              {import.meta.env.BASE_URL.startsWith('/beta/') && (
                <span
                  title="גרסת בטא — סביבת בדיקה"
                  aria-label="גרסת בטא — סביבת בדיקה"
                  className="shrink-0 rounded-full border border-amber-500/50 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  BETA
                </span>
              )}
            </div>
            <p className="hidden text-[11px] text-on-variant sm:block">מסכת {tractate}</p>
          </div>
        </div>
        <a href={`${appBasePath}/`} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-outline-variant bg-surface-1 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-surface-2">
          <Home size={16} /> <span className="hidden sm:inline">חזרה לאוצריא</span><ArrowRight size={16} />
        </a>
      </header>
      <section className="min-h-0 flex-1 overflow-hidden">
        <TzuratHaDafView
          bookTitle={tractate}
          bookId={resolvedBookId}
          initialDaf={initialDaf}
        />
      </section>
    </main>
  );
}
