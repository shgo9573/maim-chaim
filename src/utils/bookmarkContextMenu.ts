export type BookmarkContextMenuActionId = 'edit-description' | 'delete';

export interface BookmarkContextMenuAction {
  id: BookmarkContextMenuActionId;
  label: string;
  destructive: boolean;
}

export function getBookmarkContextMenuActions(): BookmarkContextMenuAction[] {
  return [
    { id: 'edit-description', label: 'ערוך תיאור', destructive: false },
    { id: 'delete', label: 'מחק', destructive: true },
  ];
}

export function normalizeBookmarkDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length <= 500 ? normalized : null;
}

export function updateBookmarkDescriptionInList<T extends { id: string; description?: string }>(
  bookmarks: readonly T[],
  bookmarkId: string,
  description: string,
): T[] | null {
  let found = false;
  const updated = bookmarks.map((bookmark) => {
    if (bookmark.id !== bookmarkId) return bookmark;
    found = true;
    const next = { ...bookmark };
    if (description) next.description = description;
    else Reflect.deleteProperty(next, 'description');
    return next;
  });
  return found ? updated : null;
}
