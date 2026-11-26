import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight } from 'lucide-react';
import { placeReaderLinkPreview } from '../utils/readerLinkPreview';

const SHOW_DELAY_MS = 320;
const HIDE_DELAY_MS = 180;

export default function ReaderLinkPreview({
  children,
  title,
  subtitle,
  reference,
  preview,
  onOpen,
  onOpenInBackground,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  reference: string;
  preview: string;
  onOpen: () => void;
  onOpenInBackground: () => void;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<ReturnType<typeof placeReaderLinkPreview> | null>(null);

  const clearTimers = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const dismiss = () => {
    clearTimers();
    setPinned(false);
    setVisible(false);
    setPosition(null);
  };

  const show = (immediate = false) => {
    if (!preview.trim()) return;
    clearTimers();
    const reveal = () => {
      if (triggerRef.current) setVisible(true);
    };
    if (immediate) reveal();
    else showTimerRef.current = window.setTimeout(reveal, SHOW_DELAY_MS);
  };

  const scheduleHide = () => {
    if (pinned) return;
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (!pinned) dismiss();
    }, HIDE_DELAY_MS);
  };

  useLayoutEffect(() => {
    if (!visible) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const direction = window.getComputedStyle(trigger).direction === 'ltr' ? 'ltr' : 'rtl';
      setPosition(placeReaderLinkPreview(
        { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        { width: window.innerWidth, height: window.innerHeight },
        direction,
      ));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !pinned) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [visible, pinned]);

  useEffect(() => () => clearTimers(), []);

  const handleAuxClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
    onOpenInBackground();
  };

  return (
    <>
      <span
        ref={triggerRef}
        className="block"
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') show();
        }}
        onPointerLeave={scheduleHide}
        onFocusCapture={() => show(true)}
        onBlurCapture={scheduleHide}
        onAuxClick={handleAuxClick}
      >
        {children}
      </span>
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="region"
          aria-label={'תצוגה מקדימה: ' + title}
          dir="rtl"
          data-reader-link-preview="true"
          style={{
            position: 'fixed',
            left: position?.left ?? 8,
            top: position?.top ?? 8,
            width: position?.width ?? 320,
            maxHeight: position?.maxHeight ?? 240,
            zIndex: 13010,
          }}
          className="overflow-hidden rounded-xl border border-outline-variant bg-surface-1 p-3 text-on-surface shadow-lg"
          onPointerEnter={() => {
            if (hideTimerRef.current !== null) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
          onPointerLeave={scheduleHide}
          onFocusCapture={() => {
            if (hideTimerRef.current !== null) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
          onBlurCapture={scheduleHide}
          onPointerDown={(event) => {
            const target = event.target;
            if (!(target instanceof Element) || !target.closest('button')) setPinned(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              dismiss();
            }
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-outline-variant pb-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="mt-0.5 text-xs text-on-variant">
                {subtitle}{reference ? ' · ' + reference : ''}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => {
                dismiss();
                onOpen();
              }}
            >
              פתח
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {preview}
          </div>
          <div className="mt-2 flex justify-start">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => {
                dismiss();
                onOpenInBackground();
              }}
            >
              פתח ברקע
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
