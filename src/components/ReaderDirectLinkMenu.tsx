import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileText, Highlighter, Link2, Type } from 'lucide-react';
import type { ReaderDirectLinkMenuItem } from '../utils/readerDirectLinkMenu';
import { getReaderDirectLinkIconKind, placeReaderDirectLinkMenu } from '../utils/readerDirectLinkMenu';

type MenuPosition = { left: number; top: number; maxWidth: number; maxHeight: number };

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

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const menuRect = menuRef.current?.getBoundingClientRect();
    const size = {
      width: menuRect?.width ?? Math.min(320, Math.max(0, viewport.width - 16)),
      height: menuRect?.height ?? Math.min(items.length * 36 + 16, Math.max(0, viewport.height - 16)),
    };
    const direction = window.getComputedStyle(trigger).direction === 'rtl' ? 'rtl' : 'ltr';
    const next = placeReaderDirectLinkMenu(
      { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      size,
      viewport,
      direction,
    );
    setPosition((current) => {
      if (current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 && current.maxWidth === next.maxWidth && current.maxHeight === next.maxHeight) return current;
      return next;
    });
  };

  useLayoutEffect(() => {
    if (!expanded) return;
    updatePosition();
    const frame = window.requestAnimationFrame(() => {
      updatePosition();
      firstItemRef.current?.focus();
    });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [expanded, items.length]);

  // Remeasure after the intrinsic-width panel mounts to align its actual edge to the trigger.
  useLayoutEffect(() => {
    if (!expanded || !position) return;
    updatePosition();
  }, [expanded, position?.maxWidth, position?.maxHeight, items.length]);

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
          style={{
            left: position.left,
            top: position.top,
            width: 'max-content',
            minWidth: Math.min(150, position.maxWidth),
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
            boxSizing: 'border-box',
          }}
          className="fixed z-[120] flex flex-col overflow-y-auto rounded-lg bg-surface-2 py-2 text-sm text-on-surface shadow-md"
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
