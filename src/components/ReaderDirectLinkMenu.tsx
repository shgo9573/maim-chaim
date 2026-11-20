import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileText, Highlighter, Link2, Type } from 'lucide-react';
import type { ReaderDirectLinkMenuItem } from '../utils/readerDirectLinkMenu';
import { getReaderDirectLinkIconKind } from '../utils/readerDirectLinkMenu';

type MenuPosition = { left: number; top: number; width: number };

function DirectLinkOptionIcon({ kind }: { kind: 'document' | 'marker' | 'alef' }) {
  if (kind === 'document') return <FileText size={18} strokeWidth={1.8} />;
  if (kind === 'marker') return <Highlighter size={18} strokeWidth={1.8} />;
  return <Type size={18} strokeWidth={1.8} />;
}

export default function ReaderDirectLinkMenu({
  items,
  onCopy,
}: {
  items: ReaderDirectLinkMenuItem[];
  onCopy: (item: ReaderDirectLinkMenuItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = true) => {
    setExpanded(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useLayoutEffect(() => {
    if (!expanded) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(256, Math.max(0, window.innerWidth - 16));
      const height = Math.min(items.length * 36 + 16, Math.max(0, window.innerHeight - 16));
      const isRtl = window.getComputedStyle(trigger).direction === 'rtl';
      const preferredLeft = isRtl ? rect.right - width : rect.left;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const left = Math.min(Math.max(8, preferredLeft), maxLeft);
      const below = rect.bottom + 4;
      const top = below + height <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - height - 4);
      setPosition({ left, top, width });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(() => firstItemRef.current?.focus());
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [expanded, items.length]);

  useEffect(() => {
    if (!expanded) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [expanded]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (expanded) close();
    else setExpanded(true);
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (!menuItems.length) return;
    event.preventDefault();
    event.stopPropagation();
    const activeIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? menuItems.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1 + menuItems.length) % menuItems.length
          : (activeIndex <= 0 ? menuItems.length - 1 : activeIndex - 1);
    menuItems[nextIndex]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-label="העתק קישור ישיר"
        title="העתק קישור ישיר"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
        disabled={items.length === 0}
        className="flex min-w-12 max-w-24 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] leading-4 text-on-surface hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (expanded) close();
          else setExpanded(true);
        }}
      >
        <Link2 size={18} strokeWidth={1.8} />
        <span className="flex items-center gap-0.5 whitespace-nowrap">
          <span>קישור</span>
          <ChevronDown size={12} />
        </span>
      </button>
      {expanded && position && createPortal(
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label="העתקת קישור ישיר"
          dir="rtl"
          style={{ left: position.left, top: position.top, width: position.width }}
          className="fixed z-[120] flex max-h-[calc(100vh-16px)] min-w-[180px] flex-col overflow-y-auto rounded-xl border border-outline-variant bg-surface-2 p-1.5 text-sm text-on-surface shadow-xl"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-right text-sm hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                setExpanded(false);
                setPosition(null);
                onCopy(item);
              }}
            >
              <DirectLinkOptionIcon kind={getReaderDirectLinkIconKind(item.id)} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
