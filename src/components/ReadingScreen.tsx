import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search as SearchIcon, X } from 'lucide-react';
import { useApp } from '../store';
import BookViewer from './BookViewer';
import SearchTabView from './SearchTabView';
import TzuratHaDafView from './TzuratHaDafView';
import { Btn, EmptyState } from './ui';
import { t } from '../i18n';

export default function ReadingScreen() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeAllTabs, setScreen, openSearch, settings } = useApp();
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const lang = settings.interfaceLanguage;
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const stripRef = useRef<HTMLDivElement>(null);

  // keep the active tab visible when there are many tabs
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${active?.id}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [active?.id, tabs.length]);

  if (tabs.length === 0) {
    return (
      <EmptyState icon={<BookOpen size={64} />} title={t('אין לשוניות פתוחות', lang)} hint={lang === 'en' ? 'Choose a book from the library or search to start reading.' : 'בחרו ספר מהספרייה או בצעו חיפוש כדי להתחיל לקרוא'}>
        <div className="mt-2 flex gap-2">
          <Btn variant="filled" onClick={() => setScreen('library')}>
            {t('לספרייה', lang)}
          </Btn>
          <Btn variant="tonal" onClick={() => openSearch()}>
            {t('חיפוש', lang)}
          </Btn>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-end bg-surface-1">
        <div ref={stripRef} className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-1 pt-1.5" style={{ scrollbarWidth: 'thin' }}>
          {tabs.map((t) => {
            const isActive = active?.id === t.id;
            return (
              <div
                key={t.id}
                data-tab={t.id}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(t.id);
                  }
                }}
                className={`group flex h-9 min-w-[120px] max-w-[220px] shrink-0 items-center gap-1 rounded-t-xl pr-3 pl-1 text-sm transition-colors ${
                  isActive ? 'bg-surface text-on-surface shadow-[0_-1px_0_var(--c-outline-variant)]' : 'text-on-variant hover:bg-surface-3'
                }`}
              >
                <button onClick={() => setActiveTab(t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start" title={t.kind === 'search' ? t.query : t.title}>
                  {t.kind === 'search' && <SearchIcon size={15} className="shrink-0" />}
                  <span className="truncate">{t.kind === 'search' ? `${lang === 'en' ? 'Search' : 'חיפוש'}${t.query ? `: ${t.query}` : ''}` : t.title}</span>
                </button>
                <button onClick={() => closeTab(t.id)} className="rounded-full p-1 text-on-variant opacity-70 hover:bg-surface-3 hover:opacity-100" aria-label="סגור לשונית">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
        {/* Closing every tab only means something once there is more than one. */}
        {tabs.length > 1 && (
          <button
            type="button"
            onClick={() => setConfirmCloseAll(true)}
            className="group mb-1 ml-1.5 mr-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-outline bg-surface-2 px-2 text-[11px] font-semibold text-primary shadow-sm transition duration-150 hover:bg-surface-3 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title={lang === 'en' ? 'Close all tabs' : 'סגור את כל הלשוניות'}
            aria-label={lang === 'en' ? 'Close all tabs' : 'סגור את כל הלשוניות'}
          >
            <X size={12} strokeWidth={2.5} />
            <span className="whitespace-nowrap">{lang === 'en' ? 'Close all' : 'סגור הכול'}</span>
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === active?.id ? 'h-full min-h-0' : 'hidden'}>
            {tab.kind === 'book'
              ? <BookViewer tab={tab} />
              : tab.kind === 'search'
                ? <SearchTabView tab={tab} />
                : (
                  <TzuratHaDafView
                    key={tab.id}
                    bookTitle={tab.tractate}
                    bookId={tab.bookId}
                    initialDaf={`דף ${tab.daf} ע״${tab.amud === 'a' ? 'א' : 'ב'}`}
                    onCloseTab={() => closeTab(tab.id)}
                  />
                )}
          </div>
        ))}
      </div>
      {confirmCloseAll && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmCloseAll(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-all-tabs-title"
            className="fade-in w-full max-w-sm overflow-hidden rounded-2xl border border-outline-variant bg-surface text-on-surface shadow-2xl"
          >
            <div className="flex items-start gap-3 border-b border-outline-variant bg-error/5 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
                <X size={20} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="close-all-tabs-title" className="text-base font-bold">
                  {lang === 'en' ? 'Close all tabs?' : 'לסגור את כל הלשוניות?'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-on-variant">
                  {lang === 'en'
                    ? 'This will close every open book and search tab.'
                    : 'פעולה זו תסגור את כל הספרים והחיפושים הפתוחים.'}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 text-sm leading-6 text-on-variant">
              {lang === 'en'
                ? `There are ${tabs.length} open tabs. This cannot be undone.`
                : `פתוחות כרגע ${tabs.length} לשוניות. אי אפשר לבטל את הסגירה לאחר האישור.`}
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={() => setConfirmCloseAll(false)}
                className="rounded-xl border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {lang === 'en' ? 'Cancel' : 'ביטול'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCloseAll(false);
                  closeAllTabs();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
              >
                <X size={15} />
                {lang === 'en' ? 'Close all tabs' : 'סגור את כולן'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
