import React, { type ReactNode, type Ref } from 'react';
import type { ReaderDirectLinkMenuItem } from '../utils/readerDirectLinkMenu';
import ReaderDirectLinkMenu from './ReaderDirectLinkMenu';

type ReaderActionIconName = 'library' | 'copy' | 'note-add';

const readerActionIconPaths: Record<ReaderActionIconName, string> = {
  library: 'M4 3H5C6.05382 3 6.91812 3.8164 6.99451 4.85081L7 5V19C7 20.0538 6.1836 20.9181 5.14919 20.9945L5 21H4C2.94618 21 2.08188 20.1836 2.00549 19.1492L2 19V5C2 3.94618 2.8164 3.08188 3.85081 3.00549L4 3H5H4ZM10 3H11C12.0538 3 12.9181 3.8164 12.9945 4.85081L13 5V19C13 20.0538 12.1836 20.9181 11.1492 20.9945L11 21H10C8.94618 21 8.08188 20.1836 8.00549 19.1492L8 19V5C8 3.94618 8.8164 3.08188 9.85081 3.00549L10 3H11H10ZM16.9743 5.0005C17.8138 5.0005 18.5825 5.5311 18.8643 6.34636L18.9113 6.5025L21.9263 18.2485C22.1888 19.2689 21.613 20.3094 20.6295 20.6402L20.4863 20.6825L19.5173 20.9315C19.3513 20.9735 19.1833 20.9945 19.0193 20.9945C18.1807 20.9945 17.4112 20.463 17.1302 19.6476L17.0833 19.4915L14.0673 7.7465C13.8058 6.72514 14.3807 5.68555 15.3649 5.35484L15.5083 5.3125L16.4763 5.0635C16.6423 5.0205 16.8103 5.0005 16.9743 5.0005ZM5 4.5H4C3.75467 4.5 3.55042 4.67778 3.50806 4.91043L3.5 5V19C3.5 19.2444 3.67699 19.4494 3.91016 19.4919L4 19.5H5C5.24533 19.5 5.44958 19.3222 5.49194 19.0896L5.5 19V5C5.5 4.75556 5.32301 4.55062 5.08984 4.50809L5 4.5ZM11 4.5H10C9.75467 4.5 9.55042 4.67778 9.50806 4.91043L9.5 5V19C9.5 19.2444 9.67699 19.4494 9.91016 19.4919L10 19.5H11C11.2453 19.5 11.4496 19.3222 11.4919 19.0896L11.5 19V5C11.5 4.75556 11.323 4.55062 11.0898 4.50809L11 4.5ZM16.9753 6.5005L16.9119 6.50437L16.8493 6.5165L15.8813 6.7645C15.7063 6.8095 15.6143 6.9275 15.5743 6.9955C15.5431 7.0483 15.4985 7.14718 15.5049 7.27422L15.5203 7.3745L18.5363 19.1185C18.6023 19.3765 18.8333 19.4945 19.0193 19.4945L19.0818 19.4906L19.1443 19.4785L20.1133 19.2295C20.3515 19.1691 20.5052 18.9458 20.4879 18.7102L20.4733 18.6215L17.4583 6.8755C17.3913 6.6185 17.1613 6.5005 16.9753 6.5005Z',
  copy: 'M8.5 8.5H5.25C4.2835 8.5 3.5 9.2835 3.5 10.25V18.75C3.5 19.7165 4.2835 20.5 5.25 20.5H11.25C12.2165 20.5 13 19.7165 13 18.75V18H14.5V18.75C14.5 20.5449 13.0449 22 11.25 22H5.25C3.45507 22 2 20.5449 2 18.75V10.25C2 8.45507 3.45507 7 5.25 7H8.5V8.5ZM18.75 2C20.5449 2 22 3.45507 22 5.25V13.75C22 15.5449 20.5449 17 18.75 17H12.75C10.9551 17 9.5 15.5449 9.5 13.75V5.25C9.5 3.45507 10.9551 2 12.75 2H18.75ZM12.75 3.5C11.7835 3.5 11 4.2835 11 5.25V13.75C11 14.7165 11.7835 15.5 12.75 15.5H18.75C19.7165 15.5 20.5 14.7165 20.5 13.75V5.25C20.5 4.2835 19.7165 3.5 18.75 3.5H12.75Z',
  'note-add': 'M12 6.5C12 3.46243 9.53757 1 6.5 1C3.46243 1 1 3.46243 1 6.5C1 9.53757 3.46243 12 6.5 12C9.53757 12 12 9.53757 12 6.5ZM7.00065 7.00001L7.00111 9.50352C7.00111 9.77966 6.77725 10.0035 6.50111 10.0035C6.22497 10.0035 6.00111 9.77966 6.00111 9.50352L6.00065 7.00001H3.49609C3.21995 7.00001 2.99609 6.77615 2.99609 6.50001C2.99609 6.22387 3.21995 6.00001 3.49609 6.00001H6.00046L6 3.49927C6 3.22313 6.22386 2.99927 6.5 2.99927C6.77614 2.99927 7 3.22313 7 3.49927L7.00046 6.00001H9.50301C9.77915 6.00001 10.003 6.22387 10.003 6.50001C10.003 6.77615 9.77915 7.00001 9.50301 7.00001H7.00065ZM17.75 4.5H12.6865C12.5142 3.96653 12.2747 3.46321 11.9782 3H17.75C19.5449 3 21 4.45507 21 6.25V13.1287C21 13.7254 20.7629 14.2977 20.341 14.7197L14.7197 20.341C14.2977 20.7629 13.7254 21 13.1287 21H6.25C4.45507 21 3 19.5449 3 17.75V11.9782C3.46321 12.2747 3.96653 12.5142 4.5 12.6865V17.75C4.5 18.7165 5.2835 19.5 6.25 19.5H13V16.25C13 14.517 14.3565 13.1008 16.0656 13.0051L16.25 13H19.5V6.25C19.5 5.2835 18.7165 4.5 17.75 4.5ZM18.439 14.5H16.25C15.3318 14.5 14.5788 15.2071 14.5058 16.1065L14.5 16.25V18.439L18.439 14.5Z',
};

function ReaderActionIcon({ name }: { name: ReaderActionIconName }) {
  return (
    <svg aria-hidden="true" focusable="false" data-icon={`fluent-${name}-24-regular`} width={18} height={18} viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <path d={readerActionIconPaths[name]} />
    </svg>
  );
}

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
