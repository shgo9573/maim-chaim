import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import type { ReaderDirectLinkMenuItem } from '../utils/readerDirectLinkMenu';

export default function ReaderDirectLinkMenu({
  items,
  onCopy,
}: {
  items: ReaderDirectLinkMenuItem[];
  onCopy: (item: ReaderDirectLinkMenuItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const frame = window.requestAnimationFrame(() => {
      firstItemRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  const close = () => {
    setExpanded(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          if (expanded) {
            close();
          } else {
            setExpanded(true);
          }
        }}
        onClick={() => setExpanded((current) => !current)}
      >
        <Link2 size={15} />
        <span className="flex-1">העתק קישור ישיר</span>
        <ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div
          id={id}
          role="menu"
          aria-label="העתקת קישור ישיר"
          dir="rtl"
          className="mr-3 mt-1 flex flex-col border-r border-outline-variant pr-2"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onCopy(item)}
            >
              <Link2 size={14} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
