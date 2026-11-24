import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown, Copy, Folder, Pin, Search as SearchIcon, X } from 'lucide-react';
import { useApp } from '../store';
import BookViewer from './BookViewer';
import SearchTabView from './SearchTabView';
import TabSearch from './TabSearch';
import TzuratHaDafView from './TzuratHaDafView';
import { Btn, EmptyState } from './ui';
import { t } from '../i18n';
import { placeReaderContextMenu } from '../utils/readerContextMenu';
import {
  getTabAutoScrollDelta,
  getTabDropPositionAt,
  getTabContextMenuActions,
  tabsAfterClosable,
  tabsOtherThanClosable,
  tabsToCloseAll,
  type TabContextMenuActionId,
} from '../utils/tabContextMenu';

type TabContextMenuState = { tabId: string; x: number; y: number };
type TabDropTarget = { tabId: string; position: 'before' | 'after' };

export default function ReadingScreen() {
  const {
    tabs,
    recentlyClosedTabs,
    activeTabId,
    setActiveTab,
    reorderTab,
    closeTab,
    closeTabs,
    duplicateTab,
    togglePinTab,
    closeAllTabs,
    restoreClosedTab,
    clearRecentlyClosedTabs,
    setScreen,
    openSearch,
    settings,
    workspaces,
    activeWorkspaceId,
    moveTabsToWorkspace,
    toast,
  } = useApp();
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [tabMenu, setTabMenu] = useState<TabContextMenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState<ReturnType<typeof placeReaderContextMenu> | null>(null);
  const [openTabsExpanded, setOpenTabsExpanded] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>([]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TabDropTarget | null>(null);
  const lang = settings.interfaceLanguage || 'he';
  const closableTabs = tabsToCloseAll(tabs);
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const stripRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuReturnFocusRef = useRef<HTMLElement | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const touchArmTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMoveHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const touchUpHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const touchCancelHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const touchPointerIdRef = useRef<number | null>(null);
  const touchDragArmedRef = useRef(false);
  const touchDragActiveRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const dragSourceIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<TabDropTarget | null>(null);
  const dragPointRef = useRef<{ x: number; y: number; sourceId: string } | null>(null);
  const autoScrollTimerRef = useRef<number | null>(null);
  const autoScrollDeltaRef = useRef(0);
  const springOpenTimerRef = useRef<number | null>(null);
  const springTargetRef = useRef<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const getTabDropPosition = (clientX: number, rect: DOMRect): 'before' | 'after' =>
    getTabDropPositionAt(clientX, rect.left, rect.width, lang);

  const clearTouchTimers = () => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (touchArmTimerRef.current !== null) {
      window.clearTimeout(touchArmTimerRef.current);
      touchArmTimerRef.current = null;
    }
  };

  const removeTouchMoveHandler = () => {
    if (touchMoveHandlerRef.current) {
      window.removeEventListener('pointermove', touchMoveHandlerRef.current);
      touchMoveHandlerRef.current = null;
    }
  };

  const removeTouchEndHandlers = () => {
    if (touchUpHandlerRef.current) {
      window.removeEventListener('pointerup', touchUpHandlerRef.current);
      touchUpHandlerRef.current = null;
    }
    if (touchCancelHandlerRef.current) {
      window.removeEventListener('pointercancel', touchCancelHandlerRef.current);
      touchCancelHandlerRef.current = null;
    }
  };

  const clearLongPress = () => {
    clearTouchTimers();
    removeTouchMoveHandler();
    removeTouchEndHandlers();
    touchStartRef.current = null;
    touchPointerIdRef.current = null;
    touchDragArmedRef.current = false;
    touchDragActiveRef.current = false;
  };

  const stopAutoScroll = () => {
    if (autoScrollTimerRef.current !== null) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    autoScrollDeltaRef.current = 0;
  };

  const clearSpringOpen = () => {
    if (springOpenTimerRef.current !== null) {
      window.clearTimeout(springOpenTimerRef.current);
      springOpenTimerRef.current = null;
    }
    springTargetRef.current = null;
  };

  const clearDragFeedback = () => {
    stopAutoScroll();
    clearSpringOpen();
    dragSourceIdRef.current = null;
    dropTargetRef.current = null;
    dragPointRef.current = null;
    setDraggedTabId(null);
    setDropTarget(null);
  };

  const scheduleSpringOpen = (sourceId: string, targetId: string | null) => {
    if (!targetId || targetId === sourceId) {
      clearSpringOpen();
      return;
    }
    if (springTargetRef.current === targetId) return;
    clearSpringOpen();
    springTargetRef.current = targetId;
    springOpenTimerRef.current = window.setTimeout(() => {
      springOpenTimerRef.current = null;
      if (tabsRef.current.some((tab) => tab.id === targetId)) setActiveTab(targetId);
      springTargetRef.current = null;
    }, 400);
  };

  const updateDropTargetAtPoint = (x: number, y: number, sourceId: string): TabDropTarget | null => {
    const strip = stripRef.current;
    const targetElement = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tab]');
    if (!strip || !targetElement || !strip.contains(targetElement)) {
      dropTargetRef.current = null;
      setDropTarget(null);
      clearSpringOpen();
      return null;
    }
    const targetId = targetElement.dataset.tab;
    if (!targetId || targetId === sourceId) {
      dropTargetRef.current = null;
      setDropTarget(null);
      clearSpringOpen();
      return null;
    }
    const next = { tabId: targetId, position: getTabDropPosition(x, targetElement.getBoundingClientRect()) };
    dropTargetRef.current = next;
    setDropTarget(next);
    scheduleSpringOpen(sourceId, targetId);
    return next;
  };

  const updateAutoScroll = (x: number, y: number, sourceId: string) => {
    const strip = stripRef.current;
    if (!strip) {
      stopAutoScroll();
      return;
    }
    const rect = strip.getBoundingClientRect();
    const delta = getTabAutoScrollDelta(x, rect.left, rect.right);
    dragPointRef.current = { x, y, sourceId };
    if (delta === 0) {
      stopAutoScroll();
      return;
    }
    autoScrollDeltaRef.current = delta;
    if (autoScrollTimerRef.current !== null) return;
    autoScrollTimerRef.current = window.setInterval(() => {
      const currentStrip = stripRef.current;
      const point = dragPointRef.current;
      if (!currentStrip || !point) {
        stopAutoScroll();
        return;
      }
      const before = currentStrip.scrollLeft;
      currentStrip.scrollBy({ left: autoScrollDeltaRef.current, behavior: 'auto' });
      if (currentStrip.scrollLeft === before) {
        stopAutoScroll();
        return;
      }
      updateDropTargetAtPoint(point.x, point.y, point.sourceId);
    }, 16);
  };

  const updateDragAtPoint = (x: number, y: number, sourceId: string) => {
    dragPointRef.current = { x, y, sourceId };
    updateDropTargetAtPoint(x, y, sourceId);
    updateAutoScroll(x, y, sourceId);
  };

  useEffect(() => () => {
    clearLongPress();
    stopAutoScroll();
    clearSpringOpen();
  }, []);

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
    if (action === 'toggle-pin') {
      dismissTabContextMenu(false);
      togglePinTab(tab.id);
    } else if (action === 'close') {
      const closingIds = selectedTabIds.includes(tab.id) && selectedTabIds.length > 1
        ? selectedTabIds
        : [tab.id];
      dismissTabContextMenu(false);
      closeTabs(closingIds);
      setSelectedTabIds([]);
    } else if (action === 'close-all') {
      dismissTabContextMenu(false);
      setConfirmCloseAll(true);
    } else if (action === 'close-others') {
      const closing = tabsOtherThanClosable(tabs, tab.id);
      dismissTabContextMenu(false);
      closeTabs(closing.map((item) => item.id));
      setSelectedTabIds([]);
    } else if (action === 'close-after') {
      const closing = tabsAfterClosable(tabs, tab.id);
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

  useEffect(() => {
    setSelectedTabIds((current) => current.filter((id) => tabs.some((tab) => tab.id === id)));
  }, [tabs]);

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
      <div className="flex h-8 shrink-0 items-end border-b border-outline-variant/50 bg-surface-1 sm:h-10">
        <div ref={stripRef} className="flex h-full min-w-0 flex-1 items-end gap-0 overflow-x-auto px-1" style={{ scrollbarWidth: 'thin' }}>
          {tabs.map((t) => {
            const isActive = active?.id === t.id;
            const isSelected = selectedTabIds.includes(t.id);
            const displayTitle = t.kind === 'search' ? (t.query || (lang === 'en' ? 'Search' : 'חיפוש')) : t.title;
            return (
              <div
                key={t.id}
                data-tab={t.id}
                data-active={isActive}
                data-selected={isSelected}
                draggable
                onDragStart={(event) => {
                  if ((event.target as HTMLElement).closest('[data-tab-control]')) {
                    event.preventDefault();
                    return;
                  }
                  clearLongPress();
                  stopAutoScroll();
                  clearSpringOpen();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', t.id);
                  dragSourceIdRef.current = t.id;
                  dropTargetRef.current = null;
                  setDraggedTabId(t.id);
                  setDropTarget(null);
                }}
                onDragOver={(event) => {
                  const sourceId = draggedTabId ?? dragSourceIdRef.current;
                  if (!sourceId || sourceId === t.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  updateDragAtPoint(event.clientX, event.clientY, sourceId);
                }}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    if (dropTargetRef.current?.tabId === t.id) {
                      dropTargetRef.current = null;
                      setDropTarget(null);
                    }
                    const nextTab = nextTarget instanceof Element ? nextTarget.closest('[data-tab]') : null;
                    if (!nextTab || !stripRef.current?.contains(nextTab)) {
                      clearSpringOpen();
                      stopAutoScroll();
                    }
                  }
                }}
                onDrop={(event) => {
                  const sourceId = event.dataTransfer.getData('text/plain') || draggedTabId || dragSourceIdRef.current;
                  if (!sourceId) return;
                  event.preventDefault();
                  if (sourceId !== t.id) reorderTab(sourceId, t.id, getTabDropPosition(event.clientX, event.currentTarget.getBoundingClientRect()));
                  clearDragFeedback();
                }}
                onDragEnd={() => {
                  clearDragFeedback();
                  clearLongPress();
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(t.id);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (touchPointerIdRef.current !== null) {
                    clearTouchTimers();
                    removeTouchMoveHandler();
                    longPressTriggeredRef.current = true;
                  } else {
                    clearLongPress();
                  }
                  const titleButton = event.currentTarget.querySelector('button:not([data-tab-control])') as HTMLButtonElement | null;
                  openTabContextMenu(t.id, event.clientX, event.clientY, titleButton);
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch' || (event.target as HTMLElement).closest('[data-tab-control]')) return;
                  clearLongPress();
                  longPressTriggeredRef.current = false;
                  const x = event.clientX;
                  const y = event.clientY;
                  const pointerId = event.pointerId;
                  const titleButton = event.currentTarget.querySelector('button:not([data-tab-control])') as HTMLButtonElement | null;
                  touchPointerIdRef.current = pointerId;
                  touchStartRef.current = { x, y };
                  touchDragArmedRef.current = false;
                  touchDragActiveRef.current = false;
                  const moveHandler = (moveEvent: PointerEvent) => {
                    if (moveEvent.pointerId !== pointerId) return;
                    const start = touchStartRef.current;
                    if (!start) return;
                    const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
                    if (!touchDragArmedRef.current && !touchDragActiveRef.current) {
                      if (distance > 10) {
                        clearTouchTimers();
                        removeTouchMoveHandler();
                      }
                      return;
                    }
                    if (touchDragArmedRef.current && !touchDragActiveRef.current && distance > 8) {
                      clearTouchTimers();
                      touchDragActiveRef.current = true;
                      dragSourceIdRef.current = t.id;
                      dropTargetRef.current = null;
                      longPressTriggeredRef.current = true;
                      setDraggedTabId(t.id);
                      setDropTarget(null);
                    }
                    if (touchDragActiveRef.current) {
                      moveEvent.preventDefault();
                      updateDragAtPoint(moveEvent.clientX, moveEvent.clientY, t.id);
                    }
                  };
                  const upHandler = (upEvent: PointerEvent) => {
                    if (upEvent.pointerId !== pointerId) return;
                    if (touchDragActiveRef.current) {
                      updateDropTargetAtPoint(upEvent.clientX, upEvent.clientY, t.id);
                      const target = dropTargetRef.current;
                      if (target && target.tabId !== t.id) reorderTab(t.id, target.tabId, target.position);
                      longPressTriggeredRef.current = true;
                      clearDragFeedback();
                    }
                    clearLongPress();
                    if (longPressTriggeredRef.current) {
                      window.setTimeout(() => { longPressTriggeredRef.current = false; }, 0);
                    }
                  };
                  const cancelHandler = (cancelEvent: PointerEvent) => {
                    if (cancelEvent.pointerId !== pointerId) return;
                    if (touchDragActiveRef.current) clearDragFeedback();
                    clearLongPress();
                    longPressTriggeredRef.current = false;
                  };
                  touchMoveHandlerRef.current = moveHandler;
                  touchUpHandlerRef.current = upHandler;
                  touchCancelHandlerRef.current = cancelHandler;
                  window.addEventListener('pointermove', moveHandler, { passive: false });
                  window.addEventListener('pointerup', upHandler);
                  window.addEventListener('pointercancel', cancelHandler);
                  touchArmTimerRef.current = window.setTimeout(() => {
                    if (touchPointerIdRef.current === pointerId) touchDragArmedRef.current = true;
                  }, 350);
                  touchTimerRef.current = window.setTimeout(() => {
                    if (touchPointerIdRef.current !== pointerId || touchDragActiveRef.current) return;
                    clearTouchTimers();
                    removeTouchMoveHandler();
                    longPressTriggeredRef.current = true;
                    openTabContextMenu(t.id, x, y, titleButton);
                  }, 650);
                }}
                className={`reader-tab group relative flex h-[calc(100%-3px)] min-w-[60px] max-w-[140px] shrink-0 flex-[0_1_140px] sm:h-[calc(100%-4px)] items-center gap-0 rounded-t-lg text-sm transition-colors ${draggedTabId === t.id ? 'opacity-[.35]' : ''} ${
                  isActive ? 'bg-surface text-on-surface font-semibold' : isSelected ? 'bg-sec-container text-on-sec-container ring-1 ring-inset ring-outline-variant' : 'text-on-variant'
                }`}
              >
                <button
                  onClick={(event) => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      event.preventDefault();
                      return;
                    }
                    if (event.ctrlKey || event.metaKey) {
                      setSelectedTabIds((current) => current.includes(t.id)
                        ? current.filter((id) => id !== t.id)
                        : [...current, t.id]);
                      return;
                    }
                    if (event.shiftKey && active) {
                      const anchorIndex = tabs.findIndex((tab) => tab.id === active.id);
                      const targetIndex = tabs.findIndex((tab) => tab.id === t.id);
                      if (anchorIndex >= 0 && targetIndex >= 0) {
                        const start = Math.min(anchorIndex, targetIndex);
                        const end = Math.max(anchorIndex, targetIndex);
                        setSelectedTabIds(tabs.slice(start, end + 1).map((tab) => tab.id));
                        return;
                      }
                    }
                    setSelectedTabIds([]);
                    setActiveTab(t.id);
                  }}
                  aria-pressed={isSelected}
                  onKeyDown={(event) => {
                    if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                      event.preventDefault();
                      const currentIndex = tabs.findIndex((tab) => tab.id === t.id);
                      const moveForward = lang === 'en' ? event.key === 'ArrowRight' : event.key === 'ArrowLeft';
                      const delta = moveForward ? 1 : -1;
                      const target = tabs[currentIndex + delta];
                      if (target) reorderTab(t.id, target.id, delta > 0 ? 'after' : 'before');
                      return;
                    }
                    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openTabContextMenu(t.id, lang === 'en' ? rect.left : Math.max(8, rect.right - 240), rect.bottom, event.currentTarget);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-start"
                  title={displayTitle}
                >
                  {t.isPinned && <Pin size={14} strokeWidth={1.5} fill="currentColor" className="shrink-0 text-primary" aria-hidden="true" />}
                  {t.kind === 'search' && <SearchIcon size={14} className="shrink-0" />}
                  <span className="min-w-0 truncate">{displayTitle}</span>
                </button>
                {dropTarget?.tabId === t.id && draggedTabId !== t.id && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-y-1 z-20 w-[3px] rounded-full bg-primary ${dropTarget.position === 'before' ? 'start-0' : 'end-0'}`}
                  />
                )}
                <button
                  data-tab-control="true"
                  onClick={() => closeTab(t.id)}
                  className="reader-tab-close shrink-0 rounded-full text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={lang === 'en' ? 'Close tab' : 'סגור לשונית'}
                  title={lang === 'en' ? 'Close tab' : 'סגור לשונית'}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
        <TabSearch tabs={tabs} recentlyClosedTabs={recentlyClosedTabs} activeTabId={active?.id ?? null} language={lang} onSelect={setActiveTab} onClose={closeTab} onRestoreClosed={restoreClosedTab} onClearRecentlyClosed={clearRecentlyClosedTabs} />
        {/* Closing every tab only means something once there is more than one. */}
        {closableTabs.length > 0 && tabs.length > 1 && (
          <button
            type="button"
            onClick={() => setConfirmCloseAll(true)}
            className="group mx-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-outline bg-surface-2 px-2 text-[11px] font-semibold text-primary shadow-sm transition duration-150 hover:bg-surface-3 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
          {getTabContextMenuActions(tabs, tabMenu.tabId, lang, selectedTabIds).map((action) => (
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
                {action.id === 'toggle-pin' ? <Pin size={15} className="shrink-0" /> : action.id === 'duplicate' ? <Copy size={15} className="shrink-0" /> : action.id === 'open-tabs' ? <ChevronDown size={15} className={openTabsExpanded ? 'shrink-0 rotate-180' : 'shrink-0'} /> : <X size={15} className="shrink-0" />}
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
          {workspaces.some((workspace) => workspace.id !== activeWorkspaceId) && (
            <div role="group" aria-label={lang === 'en' ? 'Move tabs to workspace' : 'העבר כרטיסיות לשולחן עבודה'} className="mt-1 border-t border-outline-variant pt-1">
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-on-variant">
                <Folder size={14} />
                {lang === 'en' ? `Move ${selectedTabIds.includes(tabMenu.tabId) && selectedTabIds.length > 1 ? selectedTabIds.length : 1} tab(s) to workspace` : `העבר ${selectedTabIds.includes(tabMenu.tabId) && selectedTabIds.length > 1 ? selectedTabIds.length : 1} כרטיסיות לשולחן עבודה`}
              </div>
              {workspaces.filter((workspace) => workspace.id !== activeWorkspaceId).map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const ids = selectedTabIds.includes(tabMenu.tabId) && selectedTabIds.length > 1
                      ? selectedTabIds
                      : [tabMenu.tabId];
                    const moved = moveTabsToWorkspace(ids, workspace.id);
                    dismissTabContextMenu(false);
                    setSelectedTabIds([]);
                    toast(moved
                      ? (lang === 'en' ? `Moved to ${workspace.name}` : `הכרטיסיות הועברו אל ${workspace.name}`)
                      : (lang === 'en' ? 'Could not move tabs' : 'לא ניתן להעביר את הכרטיסיות'));
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  <span className="text-xs text-on-variant">{workspace.tabs.length}</span>
                </button>
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
                    ? 'This will close every unpinned book and search tab. Pinned tabs will remain open.'
                    : 'פעולה זו תסגור את כל הספרים והחיפושים שאינם מוצמדים. לשוניות מוצמדות יישארו פתוחות.'}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 text-sm leading-6 text-on-variant">
              {lang === 'en'
                ? `There are ${closableTabs.length} unpinned tabs to close. Pinned tabs will remain open.`
                : `ייסגרו ${closableTabs.length} לשוניות שאינן מוצמדות. לשוניות מוצמדות יישארו פתוחות.`}
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
                {lang === 'en' ? (closableTabs.length === tabs.length ? 'Close all tabs' : 'Close unpinned tabs') : (closableTabs.length === tabs.length ? 'סגור את כולן' : 'סגור את הלא מוצמדות')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
