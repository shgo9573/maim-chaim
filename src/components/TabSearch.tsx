import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Language } from '../i18n';
import type { Tab } from '../types';
import { filterOpenTabs, tabSearchLabel } from '../utils/tabSearch';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  language: Language;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function TabSearch({ tabs, activeTabId, language, onSelect, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const english = language === 'en';
  const matches = filterOpenTabs(tabs, query, language);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setQuery('');
    setOpen(!open);
  };

  return (
    <div ref={wrapper} className="relative mb-1 shrink-0">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={english ? 'Search open tabs' : 'חיפוש בכרטיסיות פתוחות'}
        aria-expanded={open}
        aria-controls="open-tab-search"
        title={english ? 'Search open tabs' : 'חיפוש בכרטיסיות פתוחות'}
        className="mx-1 flex h-8 w-8 items-center justify-center rounded-full text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Search size={18} />
      </button>
      {open && (
        <section id="open-tab-search" aria-label={english ? 'Search open tabs' : 'חיפוש בכרטיסיות פתוחות'} className="absolute end-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-outline-variant bg-surface p-3 text-on-surface shadow-xl">
          <label htmlFor="open-tab-query" className="mb-2 block text-sm font-semibold">{english ? 'Search open tabs' : 'חיפוש בכרטיסיות פתוחות'}</label>
          <input
            ref={input}
            id="open-tab-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={english ? 'Book or search...' : 'שם ספר או חיפוש...'}
            className="w-full rounded-xl border border-outline bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 max-h-80 overflow-y-auto" aria-live="polite">
            {matches.length === 0 ? (
              <p className="px-2 py-4 text-sm text-on-variant">{english ? 'No matching tabs' : 'לא נמצאו כרטיסיות מתאימות'}</p>
            ) : matches.map((tab) => (
              <div key={tab.id} className="flex items-center gap-1 rounded-xl hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => { onSelect(tab.id); setOpen(false); button.current?.focus(); }}
                  aria-current={tab.id === activeTabId ? 'page' : undefined}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {tabSearchLabel(tab, language)}
                  {tab.id === activeTabId && <span className="ms-2 text-xs text-primary">{english ? 'Current' : 'פעילה'}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => onClose(tab.id)}
                  aria-label={english ? `Close ${tabSearchLabel(tab, language)}` : `סגור כרטיסייה: ${tabSearchLabel(tab, language)}`}
                  title={english ? 'Close tab' : 'סגור כרטיסייה'}
                  className="rounded-full p-2 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                ><X size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
