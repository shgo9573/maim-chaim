import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import type { TextOpts } from '../utils/text';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const menuId = useId().replace(/:/gu, '');
  const hasSelection = Boolean(text.trim());
  const options = getReaderCopyOptionStates(base, draft);

  useEffect(() => {
    setDraft(base);
    setExpanded(false);
  }, [base, replacement, text]);

  const toggleExpanded = () => {
    setExpanded((current) => !current);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    window.requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  };

  const handleGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(false);
    triggerRef.current?.focus();
  };

  const copyWith = (profile: TextOpts) => {
    onCopy(formatReaderCopyText(text, profile), 'הטקסט הועתק');
    setExpanded(false);
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
        onClick={toggleExpanded}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Copy size={18} />
        <span className="flex-1">העתק כ...</span>
        <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} />
      </button>
      {expanded && (
        <div
          ref={groupRef}
          id={menuId}
          role="menu"
          aria-label="אפשרויות העתקה"
          dir="rtl"
          onKeyDown={handleGroupKeyDown}
          className="mr-3 mt-1 flex flex-col border-r border-outline-variant pr-2"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={option.checked}
              disabled={!hasSelection || option.disabled}
              onClick={() => setDraft((current) => toggleReaderCopyOption(current, option.id, replacement))}
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                {option.checked && <Check size={14} />}
              </span>
              <span className="flex-1">{option.label}</span>
            </button>
          ))}
          <div role="separator" className="my-1 border-t border-outline-variant" />
          <button
            type="button"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => copyWith(draft)}
            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy size={16} />
            העתק
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasSelection}
            onClick={() => copyWith(base)}
            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy size={16} />
            כמו בתצוגה
          </button>
        </div>
      )}
    </>
  );
}
