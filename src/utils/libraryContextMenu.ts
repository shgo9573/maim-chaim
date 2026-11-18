import type { BookItem } from '../types';

export type LibraryBookContextMenuActionId = 'toggle-selection';

export interface LibraryBookContextMenuAction {
  id: LibraryBookContextMenuActionId;
  label: string;
  selected: boolean;
}

export function getLibraryBookContextMenuAction(
  isSelected: boolean,
  language: 'he' | 'en' = 'he',
): LibraryBookContextMenuAction {
  return {
    id: 'toggle-selection',
    label: language === 'en'
      ? (isSelected ? 'Remove from selection' : 'Add to selection')
      : (isSelected ? 'הסר מהבחירה' : 'הוסף לבחירה'),
    selected: isSelected,
  };
}

export function shouldOfferTextOpenContextAction(
  book: Pick<BookItem, 'categoryPath' | 'fileType'>,
): boolean {
  const segments = book.categoryPath
    .split(/[\\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[0] === 'תלמוד בבלי'
    && /^סדר(?:\\s|$)/u.test(segments[1] ?? '')
    && !/pdf/i.test(book.fileType ?? '');
}

export function toggleLibraryBookSelection(
  selectedIds: readonly string[],
  bookId: string | number,
): string[] {
  const id = String(bookId);
  return selectedIds.includes(id)
    ? selectedIds.filter((selectedId) => selectedId !== id)
    : [...selectedIds, id];
}

export function selectLibraryBookRange(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
  anchorId: string | null,
  targetId: string | number,
): string[] {
  const target = String(targetId);
  const anchorIndex = anchorId === null ? -1 : visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(target);
  if (anchorIndex < 0 || targetIndex < 0) {
    return selectedIds.includes(target) ? [...selectedIds] : [...selectedIds, target];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const result = [...selectedIds];
  const selected = new Set(result);
  for (const id of visibleIds.slice(start, end + 1)) {
    if (!selected.has(id)) {
      selected.add(id);
      result.push(id);
    }
  }
  return result;
}

export function reconcileLibraryBookSelection(
  selectedIds: readonly string[],
  availableIds: readonly string[],
): string[] {
  const available = new Set(availableIds);
  return selectedIds.filter((id) => available.has(id));
}
