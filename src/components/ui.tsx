import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-on-variant">
      <div className="spinner" />
      {label && <div className="text-sm">{label}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`fade-in w-full ${width} overflow-hidden rounded-[28px] bg-surface-2 text-on-surface shadow-2xl`}>
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <h2 className="text-xl font-medium">{title}</h2>
            <button onClick={onClose} className="rounded-full p-1.5 text-on-variant hover:bg-surface-3" aria-label="סגור">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors ${
        checked ? 'border-primary bg-primary' : 'border-outline bg-surface-3'
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${
          checked ? 'h-6 w-6 bg-on-primary' : 'h-4 w-4 bg-outline'
        }`}
        style={checked ? { left: 4 } : { left: 26 }}
      />
    </button>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
      className={`rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary ${className}`}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'tonal',
  className = '',
  disabled,
  type = 'button',
  title,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'filled' | 'tonal' | 'text' | 'outlined';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  ariaLabel?: string;
}) {
  const styles = {
    filled: 'bg-primary text-on-primary hover:opacity-90',
    tonal: 'bg-sec-container text-on-sec-container hover:brightness-95',
    text: 'text-primary hover:bg-surface-3',
    outlined: 'border border-outline text-primary hover:bg-surface-3',
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  onClick,
  title,
  active,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
        active ? 'bg-sec-container text-on-sec-container' : 'text-on-variant hover:bg-surface-3'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-on-variant">
      <div className="opacity-60">{icon}</div>
      <div className="text-lg text-on-surface">{title}</div>
      {hint && <div className="max-w-sm text-sm">{hint}</div>}
      {children}
    </div>
  );
}
