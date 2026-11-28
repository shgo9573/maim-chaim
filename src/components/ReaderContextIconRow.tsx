import React, { type ReactNode, type Ref } from 'react';
import type { ReaderDirectLinkMenuItem } from '../utils/readerDirectLinkMenu';
import ReaderDirectLinkMenu from './ReaderDirectLinkMenu';
import ReaderActionIcon from './ReaderActionIcon';

function ReaderContextIconAction({
  buttonRef,
  icon,
  label,
  ariaLabel,
  disabled = false,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      className="flex min-w-12 max-w-24 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] leading-4 text-on-surface hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
    >
      {icon}
      <span className="max-w-full truncate whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function ReaderContextIconRow({
  firstItemRef,
  hasSelection,
  onSearchAllBooks,
  onCopySelection,
  onAddNote,
  directLinkItems,
  onCopyDirectLink,
}: {
  firstItemRef: Ref<HTMLButtonElement>;
  hasSelection: boolean;
  onSearchAllBooks: () => void;
  onCopySelection: () => void;
  onAddNote: () => void;
  directLinkItems: ReaderDirectLinkMenuItem[];
  onCopyDirectLink: (item: ReaderDirectLinkMenuItem) => void;
}) {
  return (
    <div
      role="group"
      aria-label="פעולות מהירות"
      dir="rtl"
      className="flex w-full items-start justify-center gap-1 overflow-x-auto px-1 py-0.5"
    >
      <ReaderContextIconAction
        buttonRef={firstItemRef}
        icon={<ReaderActionIcon name="library" />}
        label="חיפוש"
        ariaLabel="חיפוש בכל הספרים"
        onClick={onSearchAllBooks}
      />
      <ReaderContextIconAction
        icon={<ReaderActionIcon name="copy" />}
        label="העתקה"
        ariaLabel="העתקת טקסט נבחר"
        disabled={!hasSelection}
        onClick={onCopySelection}
      />
      <ReaderContextIconAction
        icon={<ReaderActionIcon name="note-add" />}
        label="הערה"
        ariaLabel="הוסף הערה אישית"
        onClick={onAddNote}
      />
      <ReaderDirectLinkMenu items={directLinkItems} onCopy={onCopyDirectLink} />
    </div>
  );
}
