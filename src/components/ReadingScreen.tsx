import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown, Copy, MoreVertical, Search as SearchIcon, X } from 'lucide-react';
import { useApp } from '../store';
import BookViewer from './BookViewer';
import SearchTabView from './SearchTabView';
import TabSearch from './TabSearch';
import TzuratHaDafView from './TzuratHaDafView';
import { Btn, EmptyState } from './ui';
import { t } from '../i18n';
import { placeReaderContextMenu } from '../utils/readerContextMenu';
import {
  getTabContextMenuActions,
  tabsAfter,
  tabsOtherThan,
  type TabContextMenuActionId,
} from '../utils/tabContextMenu';

type TabContextMenuState = { tabId: string; x: number; y: number };

export default function ReadingScreen() {
  const {
    tabs,
    recentlyClosedTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeTabs,
    duplicateTab,
    closeAllTabs,
    restoreClosedTab,
    clearRecentlyClosedTabs,
    setScreen,
    openSearch,
    settings,
  } = useApp();
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [tabMenu, setTabMenu] = useState<TabContextMenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState<ReturnType<typeof placeReaderContextMenu> | null>(null);
  const [openTabsExpanded, setOpenTabsExpanded] = useState(false);
  const lang = settings.interfaceLanguage || 'he';
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const stripRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuReturnFocusRef = useRef<HTMLElement | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMoveHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (touchMoveHandlerRef.current) {
      window.removeEventListener('pointermove', touchMoveHandlerRef.current);
      touchMoveHandlerRef.current = null;
    }
    touchStartRef.current = null;
  };

  const openTabContextMenu = (tabId: string, x: number, y: number, returnFocus: HTMLElement | null) => {
    menuReturnFocusRef.current = returnFocus;
    setOpenTabsExpanded(false);
    setMenuPosition(null);
    setTabMenu({ tabId, x, y });
  };

  const dismissTabContextMenu = (restoreFocus = false) => {
    setTabMenu(null);
    setMenuPosition(null);
    setOpenTabsExpanded(false);
    if (restoreFocus) {
      const target = menuReturnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    }
  };

  const handleTabMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1);
    else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? items.length - 1 : Math.max(currentIndex - 1, 0);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissTabContextMenu(true);
      return;
    }
    if (nextIndex !== null && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  };

  const handleTabMenuAction = (action: TabContextMenuActionId) => {
    if (!tabMenu) return;
    const tab = tabs.find((item) => item.id === tabMenu.tabId);
    if (!tab) {
      dismissTabContextMenu(false);
      return;
    }
    if (action === 'close') {
      dismissTabContextMenu(false);
      closeTab(tab.id);
    } else if (action === 'close-all') {
      dismissTabContextMenu(false);
      setConfirmCloseAll(true);
    } else if (action === 'close-others') {
      const closing = tabsOtherThan(tabs, tab.id);
      dismissTabContextMenu(false);
      closeTabs(closing.map((item) => item.id));
    } else if (action === 'close-after') {
      const closing = tabsAfter(tabs, tab.id);
      dismissTabContextMenu(false);
      closeTabs(closing.map((item) => item.id));
    } else if (action === 'duplicate') {
      dismissTabContextMenu(false);
      duplicateTab(tab.id);
    } else if (action === 'open-tabs') {
      setOpenTabsExpanded((expanded) => !expanded);
    }
  };

  useLayoutEffect(() => {
    if (!tabMenu || typeof window === 'undefined') return;
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setMenuPosition(
      placeReaderContextMenu(
        { x: tabMenu.x, y: tabMenu.y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [tabMenu, openTabsExpanded, tabs.length]);

  useEffect(() => {
    if (!tabMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setTabMenu(null);
        setMenuPosition(null);
        setOpenTabsExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setTabMenu(null);
      setMenuPosition(null);
      setOpenTabsExpanded(false);
      const target = menuReturnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [tabMenu]);

  useEffect(() => {
    if (!tabMenu || tabs.some((tab) => tab.id === tabMenu.tabId)) return;
    setTabMenu(null);
    setMenuPosition(null);
    setOpenTabsExpanded(false);
  }, [tabMenu, tabs]);

  useEffect(() => {
    if (!tabMenu) return;
    const reposition = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      setMenuPosition(
        placeReaderContextMenu(
          { x: tabMenu.x, y: tabMenu.y },
          { width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [tabMenu, openTabsExpanded, tabs.length]);

  useEffect(() => () => {
    if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current);
    if (touchMoveHandlerRef.current) {
      window.removeEventListener('pointermove', touchMoveHandlerRef.current);
    }
  }, []);

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
                onContextMenu={(event) => {
                  event.preventDefault();
                  clearLongPress();
                  const titleButton = event.currentTarget.querySelector('button:not([data-tab-control])') as HTMLButtonElement | null;
                  openTabContextMenu(t.id, event.clientX, event.clientY, titleButton);
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('[data-tab-control]')) return;
                  clearLongPress();
                  longPressTriggeredRef.current = false;
                  touchStartRef.current = { x: event.clientX, y: event.clientY };
                  const titleButton = event.currentTarget.querySelector('button:not([data-tab-control])') as HTMLButtonElement | null;
                  const x = event.clientX;
                  const y = event.clientY;
                  const pointerId = event.pointerId;
                  const moveHandler = (moveEvent: PointerEvent) => {
                    if (moveEvent.pointerId !== pointerId) return;
                    if (Math.hypot(moveEvent.clientX - x, moveEvent.clientY - y) > 10) clearLongPress();
                  };
                  touchMoveHandlerRef.current = moveHandler;
                  window.addEventListener('pointermove', moveHandler, { passive: true });
                  touchTimerRef.current = window.setTimeout(() => {
                    clearLongPress();
                    longPressTriggeredRef.current = true;
                    openTabContextMenu(t.id, x, y, titleButton);
                  }, 550);
                }}
                onPointerUp={() => {
                  clearLongPress();
                  if (longPressTriggeredRef.current) {
                    window.setTimeout(() => { longPressTriggeredRef.current = false; }, 0);
                  }
                }}
                onPointerCancel={clearLongPress}
                className={`group flex h-9 min-w-[120px] max-w-[220px] shrink-0 items-center gap-1 rounded-t-xl pr-3 pl-1 text-sm transition-colors ${
                  isActive ? 'bg-surface text-on-surface shadow-[0_-1px_0_var(--c-outline-variant)]' : 'text-on-variant hover:bg-surface-3'
                }`}
              >
                <button
                  onClick={(event) => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      event.preventDefault();
                      return;
                    }
                    setActiveTab(t.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openTabContextMenu(t.id, lang === 'en' ? rect.left : Math.max(8, rect.right - 240), rect.bottom, event.currentTarget);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  title={t.kind === 'search' ? t.query : t.title}
                >
                  {t.kind === 'search' && <SearchIcon size={15} className="shrink-0" />}
                  <span className="truncate">{t.kind === 'search' ? `${lang === 'en' ? 'Search' : 'חיפוש'}${t.query ? `: ${t.query}` : ''}` : t.title}</span>
                </button>
                <button
                  data-tab-control="true"
                  onClick={() => closeTab(t.id)}
                  className="rounded-full p-1 text-on-variant opacity-70 hover:bg-surface-3 hover:opacity-100"
                  aria-label={lang === 'en' ? 'Close tab' : 'סגור לשונית'}
                  title={lang === 'en' ? 'Close tab' : 'סגור לשונית'}
                >
                  <X size={14} />
                </button>
                <button
                  data-tab-control="true"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openTabContextMenu(t.id, lang === 'en' ? rect.left : Math.max(8, rect.right - 240), rect.bottom, event.currentTarget);
                  }}
                  className="rounded-full p-1 text-on-variant opacity-70 hover:bg-surface-3 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={lang === 'en' ? 'Tab options' : 'אפשרויות לשונית'}
                  aria-haspopup="menu"
                  aria-expanded={tabMenu?.tabId === t.id}
                  title={lang === 'en' ? 'Tab options' : 'אפשרויות לשונית'}
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <TabSearch tabs={tabs} recentlyClosedTabs={recentlyClosedTabs} activeTabId={active?.id ?? null} language={lang} onSelect={setActiveTab} onClose={closeTab} onRestoreClosed={restoreClosedTab} onClearRecentlyClosed={clearRecentlyClosedTabs} />
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
      {tabMenu && tabs.some((tab) => tab.id === tabMenu.tabId) && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={lang === 'en' ? 'Tab options' : 'אפשרויות לשונית'}
          dir={lang === 'en' ? 'ltr' : 'rtl'}
          onKeyDown={handleTabMenuKeyDown}
          style={{
            position: 'fixed',
            left: menuPosition?.left ?? tabMenu.x,
            top: menuPosition?.top ?? tabMenu.y,
            width: Math.min(240, menuPosition?.maxWidth ?? 240),
            maxWidth: menuPosition?.maxWidth ?? 'calc(100vw - 16px)',
            maxHeight: menuPosition?.maxHeight ?? 'calc(100vh - 16px)',
            overflowY: 'auto',
            boxSizing: 'border-box',
            zIndex: 12000,
          }}
          className="rounded-xl border border-outline-variant bg-surface p-1.5 text-on-surface shadow-2xl"
        >
          {getTabContextMenuActions(tabs, tabMenu.tabId, lang).map((action) => (
            <div key={action.id}>
              {(action.id === 'duplicate' || action.id === 'open-tabs') && (
                <div role="separator" className="my-1 border-t border-outline-variant" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={action.disabled}
                aria-expanded={action.id === 'open-tabs' ? openTabsExpanded : undefined}
                onClick={() => handleTabMenuAction(action.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {action.id === 'duplicate' ? <Copy size={15} className="shrink-0" /> : action.id === 'open-tabs' ? <ChevronDown size={15} className={openTabsExpanded ? 'shrink-0 rotate-180' : 'shrink-0'} /> : <X size={15} className="shrink-0" />}
                <span className="min-w-0 flex-1">{action.label}</span>
              </button>
            </div>
          ))}
          {openTabsExpanded && (
            <div role="group" aria-label={lang === 'en' ? 'Open tabs' : 'כרטיסיות פתוחות'} className="mt-1 max-h-56 overflow-y-auto border-t border-outline-variant pt-1">
              {tabs.map((tab) => (
                <div key={tab.id} className="flex items-center gap-1 rounded-lg hover:bg-surface-2">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab(tab.id);
                      dismissTabContextMenu(false);
                    }}
                    className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span>{tab.kind === 'search' ? (lang === 'en' ? 'Search' : 'חיפוש') + (tab.query ? ': ' + tab.query : '') : tab.title}</span>
                    {tab.id === active?.id && <span className="ms-2 text-xs text-primary">{lang === 'en' ? 'Current' : 'פעילה'}</span>}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => closeTab(tab.id)}
                    aria-label={(lang === 'en' ? 'Close ' : 'סגור ') + (tab.kind === 'search' ? tab.query || (lang === 'en' ? 'search tab' : 'חיפוש') : tab.title)}
                    className="rounded-full p-1.5 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
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
