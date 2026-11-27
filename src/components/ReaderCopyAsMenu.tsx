import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Eye } from 'lucide-react';
import type { TextOpts } from '../utils/text';
import { placeReaderCopyAsSubmenu } from '../utils/readerCopyAsMenu';

export type ReaderCopyOptionId = 'nikud' | 'teamim' | 'punctuation' | 'holyName';

export interface ReaderCopyOptionState {
  id: ReaderCopyOptionId;
  label: string;
  checked: boolean;
  disabled: boolean;
}

/** מחזיר את אפשרויות ההעתקה ביחס לטקסט שמוצג כרגע בקורא. */
export function getReaderCopyOptionStates(
  base: TextOpts,
  draft: TextOpts,
): ReaderCopyOptionState[] {
  return [
    { id: 'nikud', label: 'ניקוד', checked: draft.nikud, disabled: !base.nikud },
    { id: 'teamim', label: 'טעמים', checked: draft.teamim, disabled: !base.teamim },
    { id: 'punctuation', label: 'פיסוק', checked: draft.punctuation, disabled: !base.punctuation },
    {
      id: 'holyName',
      label: 'שם הוי״ה ככתבו',
      checked: draft.holyName === 'יהוה',
      disabled: base.holyName !== 'יהוה',
    },
  ];
}

/** מעדכן טיוטת העתקה בלבד; הגדרות התצוגה של הספר אינן משתנות. */
export function toggleReaderCopyOption(
  profile: TextOpts,
  option: ReaderCopyOptionId,
  replacement: string,
): TextOpts {
  switch (option) {
    case 'nikud':
      return { ...profile, nikud: !profile.nikud };
    case 'teamim':
      return { ...profile, teamim: !profile.teamim };
    case 'punctuation':
      return { ...profile, punctuation: !profile.punctuation };
    case 'holyName':
      return {
        ...profile,
        holyName: profile.holyName === 'יהוה' ? replacement : 'יהוה',
      };
  }
}

/** מעצב את הטקסט שנבחר בלבד, בלי לשנות את תוכן הספר או את הגדרות הקורא. */
export function formatReaderCopyText(text: string, profile: TextOpts): string {
  let result = text;
  if (!profile.teamim) result = result.replace(/[\u0591-\u05AF]/gu, '');
  if (!profile.nikud) result = result.replace(/[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/gu, '');
  if (profile.holyName !== 'יהוה') {
    result = result.replace(
      /י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה[\u0591-\u05C7]*/gu,
      profile.holyName,
    );
  }
  if (!profile.punctuation) result = result.replace(/[.,:;!?]/gu, '');
  return result;
}

interface ReaderCopyAsMenuProps {
  text: string;
  base: TextOpts;
  replacement: string;
  onCopy: (text: string, message: string) => void;
}

export default function ReaderCopyAsMenu({
  text,
  base,
  replacement,
  onCopy,
}: ReaderCopyAsMenuProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<TextOpts>(base);
  const [position, setPosition] = useState<ReturnType<typeof placeReaderCopyAsSubmenu> | null>(null);
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const menuId = useId().replace(/:/gu, '');
  const hasSelection = Boolean(text.trim());
  const options = getReaderCopyOptionStates(base, draft);
  const opensToRight = position?.opensToRight ?? direction === 'ltr';

  const clearHoverTimers = () => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const close = (restoreFocus = true) => {
    clearHoverTimers();
    setExpanded(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openMenu = (focusFirst = false) => {
    clearHoverTimers();
    setExpanded(true);
    if (focusFirst) {
      window.requestAnimationFrame(() => {
        const first = menuRef.current?.querySelector<HTMLButtonElement>(
          '[role="menuitemcheckbox"]:not(:disabled), [role="menuitem"]:not(:disabled)',
        );
        first?.focus();
      });
    }
  };

  const scheduleClose = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => close(false), 320);
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const anchorRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const nextDirection = window.getComputedStyle(trigger).direction === 'rtl' ? 'rtl' : 'ltr';
    setDirection(nextDirection);
    const next = placeReaderCopyAsSubmenu(
      {
        left: anchorRect.left,
        right: anchorRect.right,
        top: anchorRect.top,
        bottom: anchorRect.bottom,
      },
      {
        width: menuRect.width,
        height: menuRect.height,
      },
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      nextDirection,
    );

    setPosition((current) => {
      if (
        current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        current.maxWidth === next.maxWidth &&
        current.maxHeight === next.maxHeight &&
        current.opensToRight === next.opensToRight
      ) {
        return current;
      }
      return next;
    });
  };

  useEffect(() => {
    setDraft(base);
    setExpanded(false);
    setPosition(null);
    clearHoverTimers();
  }, [base, replacement, text]);

  useEffect(() => () => clearHoverTimers(), []);

  useLayoutEffect(() => {
    if (!expanded) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded || !position) return;
    updatePosition();
  }, [expanded, position?.maxWidth, position?.maxHeight]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = triggerRef.current
      ? window.getComputedStyle(triggerRef.current).direction
      : 'rtl';
    const openKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const closeKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === openKey || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      openMenu(true);
    } else if (expanded && (event.key === closeKey || event.key === 'Escape')) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }

    if (event.key === 'Tab') {
      close(false);
      return;
    }

    const direction = triggerRef.current
      ? window.getComputedStyle(triggerRef.current).direction
      : 'rtl';
    const closeKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === closeKey) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemcheckbox"]:not(:disabled), [role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1 + items.length) % items.length
          : (activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
    items[nextIndex]?.focus();
  };

  const copyWith = (profile: TextOpts) => {
    onCopy(formatReaderCopyText(text, profile), 'הטקסט הועתק');
    close(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        disabled={!hasSelection}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={menuId}
        onClick={() => openMenu(true)}
        onKeyDown={handleTriggerKeyDown}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          if (hoverCloseTimerRef.current !== null) {
            window.clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
          }
          if (hoverOpenTimerRef.current !== null) window.clearTimeout(hoverOpenTimerRef.current);
          hoverOpenTimerRef.current = window.setTimeout(() => setExpanded(true), 500);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return;
          if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
          }
          if (expanded) scheduleClose();
        }}
        className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-right text-sm font-normal text-on-surface transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
      >
        <Copy size={18} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 text-start">העתק כ...</span>
        {opensToRight
          ? <ChevronRight size={18} strokeWidth={1.8} className="shrink-0" />
          : <ChevronLeft size={18} strokeWidth={1.8} className="shrink-0" />}
      </button>
      {expanded && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="אפשרויות העתקה"
          dir={direction}
          onKeyDown={handleMenuKeyDown}
          onPointerEnter={() => {
            if (hoverCloseTimerRef.current !== null) {
              window.clearTimeout(hoverCloseTimerRef.current);
              hoverCloseTimerRef.current = null;
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') scheduleClose();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: position?.left ?? -10000,
            top: position?.top ?? -10000,
            width: 'max-content',
            minWidth: position ? Math.min(150, position.maxWidth) : 150,
            maxWidth: position?.maxWidth ?? 'calc(100vw - 16px)',
            maxHeight: position?.maxHeight ?? 'calc(100vh - 16px)',
            boxSizing: 'border-box',
            visibility: position ? 'visible' : 'hidden',
            zIndex: 12020,
          }}
          className="fixed z-[12020] flex flex-col overflow-y-auto rounded-lg bg-surface-2 py-2 text-sm text-on-surface shadow-md"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={option.checked}
              disabled={!hasSelection || option.disabled}
              onClick={() => setDraft((current) => toggleReaderCopyOption(current, option.id, replacement))}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
            >
              <span className="min-w-0 flex-1">{option.label}</span>
              <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                {option.checked && <CheckCircle2 size={18} strokeWidth={1.8} />}
              </span>
            </button>
          ))}
          <div role="separator" className="my-1 border-t border-outline-variant" />
          <button
            type="button"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => copyWith(draft)}
            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
          >
            <Copy size={18} strokeWidth={1.8} />
            <span>העתק</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => copyWith(base)}
            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
          >
            <Eye size={18} strokeWidth={1.8} />
            <span>כמו בתצוגה</span>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
