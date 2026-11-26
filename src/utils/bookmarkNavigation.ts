import type { Highlight } from '../types';

/** בונה יעד סימנייה תקין ומזהה הבהוב חדש בכל פתיחה. */
export function createBookmarkHighlight(lineIndex: number, flashId = Date.now()): Highlight | null {
  if (!Number.isSafeInteger(lineIndex) || lineIndex < 1) return null;
  return { line: lineIndex, wholeLine: true, flashId };
}

/** האם השורה הנוכחית היא יעד ההדגשה של הסימנייה. */
export function isBookmarkHighlightLine(highlight: Highlight | undefined, lineIndex: number): boolean {
  return highlight?.wholeLine === true && highlight.line === lineIndex;
}
