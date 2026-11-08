import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Search, Undo2, X } from 'lucide-react';
import type { Language } from '../i18n';
import type { Tab } from '../types';
import { filterOpenTabs, tabSearchLabel } from '../utils/tabSearch';
import { calculateTabSearchPosition, type TabSearchPosition } from '../utils/tabSearchPosition';

interface Props {
  tabs: Tab[];
  recentlyClosedTabs: Tab[];
  activeTabId: string | null;
  language: Language;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRestoreClosed: (id: string) => void;
  onClearRecentlyClosed: () => void;
}

export default function TabSearch({
  tabs,
  recentlyClosedTabs,
  activeTabId,
  language,
  onSelect,
  onClose,
  onRestoreClosed,
  onClearRecentlyClosed,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [position, setPosition] = useState<TabSearchPosition | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const english = language === 'en';
  const openMatches = filterOpenTabs(tabs, query, language);
  const closedMatches = filterOpenTabs(recentlyClosedTabs, query, language);
  const totalMatches = openMatches.length + closedMatches.length;

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = button.current?.getBoundingClientRect();
      if (!anchor) return;
      setPosition(calculateTabSearchPosition(
        { left: anchor.left, right: anchor.right, top: anchor.top, bottom: anchor.bottom },
        { width: window.innerWidth, height: window.innerHeight },
        english ? 'ltr' : 'rtl',
      ));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, english]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapper.current?.contains(target) && !popup.current?.contains(target)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        setHighlighted(-1);
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

  useEffect(() => {
    setHighlighted((current) => current >= totalMatches ? totalMatches - 1 : current);
  }, [totalMatches]);

  useEffect(() => {
    if (highlighted < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-entry-index="${highlighted}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, openMatches.length, closedMatches.length]);

  const closePopup = () => {
    setOpen(false);
    setHighlighted(-1);
  };

  const chooseEntry = (index: number) => {
    if (index < openMatches.length) onSelect(openMatches[index].id);
    else onRestoreClosed(closedMatches[index - openMatches.length].id);
    closePopup();
    button.current?.focus();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && totalMatches > 0) {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, totalMatches - 1));
    } else if (event.key === 'ArrowUp' && totalMatches > 0) {
      event.preventDefault();
      setHighlighted((current) => current < 0 ? totalMatches - 1 : Math.max(0, current - 1));
    } else if (event.key === 'Enter' && highlighted >= 0 && highlighted < totalMatches) {
      event.preventDefault();
      chooseEntry(highlighted);
    }
  };

  const toggle = () => {
    if (open) {
      closePopup();
      return;
    }
    setQuery('');
    setHighlighted(-1);
    setOpen(true);
  };

  const panel = open && position && typeof document !== 'undefined'
    ? createPortal(
      <section
        ref={popup}
        id="open-tab-search"
        role="dialog"
        aria-label={english ? 'Search tabs' : 'חיפוש כרטיסיות'}
        dir={english ? 'ltr' : 'rtl'}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          zIndex: 1000,
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
        className="rounded-2xl border border-outline-variant bg-surface p-3 text-on-surface shadow-2xl"
      >
        <label htmlFor="open-tab-query" className="mb-2 block text-sm font-semibold">
          {english ? 'Search tabs' : 'חיפוש כרטיסיות'}
        </label>
        <input
          ref={input}
          id="open-tab-query"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(-1);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={english ? 'Book or search...' : 'שם ספר או חיפוש...'}
          className="w-full rounded-xl border border-outline bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div ref={list} className="mt-2 max-h-80 overflow-y-auto" aria-live="polite">
          {totalMatches === 0 && (
            <p className="px-2 py-4 text-sm text-on-variant">
              {english ? 'No matching tabs' : 'לא נמצאו כרטיסיות תואמות'}
            </p>
          )}
          {openMatches.length > 0 && (
            <div className="mb-1 text-xs font-bold text-primary">
              {english ? 'Open tabs' : 'כרטיסיות פתוחות'}
            </div>
          )}
          {openMatches.map((tab, index) => (
            <div
              key={`open-${tab.id}`}
              data-entry-index={index}
              className={`flex items-center gap-1 rounded-xl ${highlighted === index ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
            >
              <button
                type="button"
                onClick={() => { onSelect(tab.id); closePopup(); button.current?.focus(); }}
                aria-current={tab.id === activeTabId ? 'page' : undefined}
                className="min-w-0 flex-1 truncate px-3 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {tabSearchLabel(tab, language)}
                {tab.id === activeTabId && (
                  <span className="ms-2 text-xs text-primary">{english ? 'Current' : 'פעילה'}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onClose(tab.id)}
                aria-label={english ? `Close ${tabSearchLabel(tab, language)}` : `סגור כרטיסייה: ${tabSearchLabel(tab, language)}`}
                title={english ? 'Close tab' : 'סגור כרטיסייה'}
                className="rounded-full p-2 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {closedMatches.length > 0 && (
            <div className="mt-2 border-t border-outline-variant pt-2">
              <div className="mb-1 flex items-center justify-between gap-2 px-2">
                <span className="text-xs font-bold text-primary">
                  {english ? 'Recently closed' : 'נסגרו לאחרונה'}
                </span>
                <button
                  type="button"
                  onClick={() => { onClearRecentlyClosed(); button.current?.focus(); }}
                  title={english ? 'Clear recently closed' : 'נקה רשימה'}
                  aria-label={english ? 'Clear recently closed tabs' : 'נקה כרטיסיות שנסגרו לאחרונה'}
                  className="rounded-full p-1 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Eraser size={14} />
                </button>
              </div>
              {closedMatches.map((tab, index) => {
                const entryIndex = openMatches.length + index;
                return (
                  <div
                    key={`closed-${tab.id}`}
                    data-entry-index={entryIndex}
                    className={`flex items-center gap-1 rounded-xl ${highlighted === entryIndex ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                  >
                    <button
                      type="button"
                      onClick={() => { onRestoreClosed(tab.id); closePopup(); button.current?.focus(); }}
                      className="min-w-0 flex-1 truncate px-3 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {tabSearchLabel(tab, language)}
                    </button>
                    <button
                      type="button"
                      onClick={() => { onRestoreClosed(tab.id); closePopup(); button.current?.focus(); }}
                      title={english ? 'Restore tab' : 'שחזר כרטיסייה'}
                      aria-label={english ? `Restore ${tabSearchLabel(tab, language)}` : `שחזר כרטיסייה: ${tabSearchLabel(tab, language)}`}
                      className="rounded-full p-2 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Undo2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>,
      document.body,
    )
    : null;

  return (
    <div ref={wrapper} className="mb-1 shrink-0">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={english ? 'Search open and recently closed tabs' : 'חיפוש כרטיסיות פתוחות וכרטיסיות שנסגרו'}
        aria-expanded={open}
        aria-controls="open-tab-search"
        title={english ? 'Search tabs' : 'חיפוש כרטיסיות'}
        className="mx-1 flex h-8 w-8 items-center justify-center rounded-full text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Search size={18} />
      </button>
      {panel}
    </div>
  );
}
