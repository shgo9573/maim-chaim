export type ReaderPaneShortcutAction = 'toggle-navigation' | 'toggle-commentary';

export interface ReaderPaneShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  repeat: boolean;
}

/** Resolve the reader pane shortcuts used by the native Otzaria reader. */
export function getReaderPaneShortcutAction(
  event: ReaderPaneShortcutEvent,
): ReaderPaneShortcutAction | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    !event.shiftKey ||
    (!event.ctrlKey && !event.metaKey)
  ) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'l') return 'toggle-navigation';
  if (key === 'c') return 'toggle-commentary';
  return null;
}
