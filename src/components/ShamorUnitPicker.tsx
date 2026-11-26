import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface ShamorUnitOption {
  value: string;
  label: string;
}

interface ShamorUnitPickerProps {
  ariaLabel: string;
  value: string;
  options: ShamorUnitOption[];
  onChange: (value: string) => void;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  direction: 'rtl' | 'ltr';
}

const ROW_HEIGHT = 36;
const MAX_VISIBLE_ROWS = 8;
const MENU_MAX_HEIGHT = 56 + ROW_HEIGHT * MAX_VISIBLE_ROWS + 24;

export function ShamorUnitPicker({
  ariaLabel,
  value,
  options,
  onChange,
}: ShamorUnitPickerProps) {
  const generatedId = useId().replace(/:/g, '');
  const popupId = `shamor-unit-popup-${generatedId}`;
  const listboxId = `shamor-unit-listbox-${generatedId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  const virtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setMenuPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openMenu = () => {
    const hasExactValue = options.some((option) => option.value === value);
    setQuery(hasExactValue ? '' : value);
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const direction = window.getComputedStyle(trigger).direction === 'ltr' ? 'ltr' : 'rtl';
      const availableWidth = Math.max(0, viewportWidth - 16);
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      const preferredWidth = measureContext
        ? (() => {
            measureContext.font = window.getComputedStyle(trigger).font;
            return Math.max(
              150,
              ...options.map((option) => measureContext.measureText(option.label).width + 48),
            );
          })()
        : Math.max(150, ...options.map((option) => option.label.length * 8 + 48));
      const width = Math.min(Math.max(rect.width, preferredWidth), availableWidth);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12);
      const spaceAbove = Math.max(0, rect.top - 12);
      const opensBelow = spaceBelow >= MENU_MAX_HEIGHT || spaceBelow >= spaceAbove;
      const availableHeight = opensBelow ? spaceBelow : spaceAbove;
      const minimumHeight = Math.min(120, Math.max(72, viewportHeight - 16));
      const height = Math.max(
        minimumHeight,
        Math.min(MENU_MAX_HEIGHT, availableHeight, viewportHeight - 16),
      );

      const rawLeft = direction === 'rtl' ? rect.right - width : rect.left;
      const maxLeft = Math.max(8, viewportWidth - width - 8);
      const left = Math.min(Math.max(8, rawLeft), maxLeft);
      const rawTop = opensBelow ? rect.bottom + 4 : rect.top - height - 4;
      const maxTop = Math.max(8, viewportHeight - height - 8);
      const top = Math.min(Math.max(8, rawTop), maxTop);

      setMenuPosition({ top, left, width, height, direction });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !menuPosition) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, menuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIndex, virtualizer]);

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(0);
    onChange(nextQuery);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const selectOption = (option: ShamorUnitOption) => {
    onChange(option.value);
    setQuery('');
    closeMenu(true);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }
    if (filteredOptions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(filteredOptions.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) selectOption(option);
    }
  };

  const activeOption = filteredOptions[activeIndex];

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            closeMenu(true);
          }
        }}
        className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg bg-sec-container ps-4 pe-2 py-2 text-sm text-on-sec-container transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <span className="min-w-0 flex-1 truncate text-center">
          {value || 'בחירת יחידה'}
        </span>
        <ChevronDown size={20} className="shrink-0" aria-hidden="true" />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={popupRef}
          id={popupId}
          role="dialog"
          aria-label={ariaLabel}
          dir={menuPosition.direction}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            height: menuPosition.height,
            zIndex: 1000,
          }}
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-lg"
        >
          <div className="shrink-0 px-2 pt-2 pb-1">
            <div className="relative">
              <Search
                size={18}
                aria-hidden="true"
                className={`absolute top-1/2 -translate-y-1/2 text-on-variant ${menuPosition.direction === 'rtl' ? 'right-3' : 'left-3'}`}
              />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-label="חיפוש יחידות"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={activeOption ? `${listboxId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="חיפוש"
                style={{ backgroundColor: 'color-mix(in srgb, var(--c-on-surface) 6%, var(--c-surface))' }}
                className={`h-10 w-full rounded-lg px-3 text-sm text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary ${menuPosition.direction === 'rtl' ? 'pr-10' : 'pl-10'}`}
              />
            </div>
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="min-h-0 flex-1 overflow-y-auto py-2"
          >
            {filteredOptions.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-on-variant">
                אין תוצאות
              </div>
            ) : (
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const option = filteredOptions[virtualItem.index];
                  const selected = option.value === value;
                  const active = virtualItem.index === activeIndex;
                  return (
                    <div
                      key={option.value}
                      id={`${listboxId}-option-${virtualItem.index}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(virtualItem.index)}
                      onClick={() => selectOption(option)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '100%',
                        height: virtualItem.size,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      className={`flex cursor-pointer items-center gap-2 px-3 text-sm transition-colors ${selected ? 'bg-sec-container font-semibold text-on-sec-container' : active ? 'bg-surface-2 text-on-surface' : 'text-on-surface hover:bg-surface-2'}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {selected ? <Check size={16} className="shrink-0" aria-hidden="true" /> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
