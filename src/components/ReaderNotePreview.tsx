import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReaderPersonalNote } from '../utils/readerPersonalNotes';

interface ReaderNotePreviewProps {
  notes: readonly ReaderPersonalNote[];
  lineLabel: string;
  position: { x: number; y: number };
  onClose: () => void;
}

function formatUpdatedAt(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('he-IL') : '';
}

export default function ReaderNotePreview({
  notes,
  lineLabel,
  position,
  onClose,
}: ReaderNotePreviewProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined' || typeof window === 'undefined' || notes.length === 0) return null;

  const panelWidth = Math.max(180, Math.min(380, window.innerWidth - 16));
  const panelMaxHeight = Math.max(160, Math.min(520, Math.floor(window.innerHeight * 0.7)));
  const left = Math.max(8, Math.min(position.x + 8, window.innerWidth - panelWidth - 8));
  const top = Math.max(8, Math.min(position.y + 8, window.innerHeight - panelMaxHeight - 8));

  return createPortal(
    <div
      className="fixed inset-0 z-[130]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        dir="rtl"
        role="dialog"
        aria-modal="false"
        aria-label="הערות אישיות"
        className="fixed flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-2xl"
        style={{ left, top, width: panelWidth, maxHeight: panelMaxHeight }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant bg-surface-1 px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-on-surface">הערות אישיות</h2>
            <p className="mt-0.5 truncate text-xs text-on-variant">{lineLabel} · {notes.length} {notes.length === 1 ? 'הערה' : 'הערות'}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="סגור הערות"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 space-y-2 overflow-y-auto p-3">
          {notes.map((note) => (
            <article key={note.id} className="rounded-lg border border-outline-variant bg-surface-1 p-3">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-on-surface">{note.text}</p>
              {formatUpdatedAt(note.updatedAt) && (
                <p className="mt-2 text-[11px] text-on-variant">עודכן: {formatUpdatedAt(note.updatedAt)}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
