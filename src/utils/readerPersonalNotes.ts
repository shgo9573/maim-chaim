export interface ReaderPersonalNote {
  id: string;
  bookId: string | number;
  line: number;
  heRef?: string;
  text: string;
  updatedAt: string;
}

export interface ReaderPersonalNoteTarget {
  line: number;
  ids: string[];
}

export function groupReaderPersonalNotes(
  notes: readonly ReaderPersonalNote[],
  bookId: string | number,
): Map<number, ReaderPersonalNote[]> {
  const grouped = new Map<number, ReaderPersonalNote[]>();
  for (const note of notes) {
    if (String(note.bookId) !== String(bookId)) continue;
    if (!note.id?.trim() || !Number.isInteger(note.line) || note.line < 0 || !note.text?.trim()) continue;
    const lineNotes = grouped.get(note.line) ?? [];
    lineNotes.push(note);
    grouped.set(note.line, lineNotes);
  }
  return grouped;
}

export function buildReaderPersonalNoteHref(line: number, ids: readonly string[]): string | null {
  if (!Number.isSafeInteger(line) || line < 0) return null;
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return null;
  return `otzaria://note?line=${line}${uniqueIds.map((id) => `&id=${encodeURIComponent(id)}`).join('')}`;
}

export function parseReaderPersonalNoteHref(href: string): ReaderPersonalNoteTarget | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'otzaria:' || url.hostname !== 'note') return null;
    const rawLine = url.searchParams.get('line');
    if (rawLine === null || !/^\d+$/.test(rawLine)) return null;
    const line = Number(rawLine);
    if (!Number.isSafeInteger(line)) return null;
    const ids = [...new Set(url.searchParams.getAll('id').map((id) => id.trim()).filter(Boolean))];
    return { line, ids };
  } catch {
    return null;
  }
}

export function selectReaderPersonalNotesForPreview(
  notes: readonly ReaderPersonalNote[],
  target: ReaderPersonalNoteTarget,
): ReaderPersonalNote[] {
  return notes.filter((note) => note.line === target.line && (!target.ids.length || target.ids.includes(note.id)));
}

function wrapTextOutsideAnchors(html: string, openTag: string, closeTag: string): string {
  const parts = html.split(/(<[^>]*>)/g);
  let anchorDepth = 0;
  let changed = false;
  const output = parts.map((part) => {
    if (part.startsWith('<')) {
      const closingAnchor = /^<\s*\/\s*a\b/i.test(part);
      const openingAnchor = /^<\s*a\b/i.test(part);
      if (closingAnchor) anchorDepth = Math.max(0, anchorDepth - 1);
      else if (openingAnchor && !/\/\s*>$/.test(part)) anchorDepth += 1;
      return part;
    }
    if (anchorDepth > 0 || !part.trim()) return part;
    changed = true;
    return `${openTag}${part}${closeTag}`;
  });
  return changed ? output.join('') : html;
}

export function decorateReaderLineWithPersonalNotes(
  html: string,
  lineIndex0: number,
  notes: readonly ReaderPersonalNote[],
): string {
  if (!html || html.includes('otzaria://note?')) return html;
  const href = buildReaderPersonalNoteHref(lineIndex0, notes.map((note) => note.id));
  if (!href) return html;
  const safeHref = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const openTag = `<a class="reader-personal-note-link" href="${safeHref}" title="הצג הערה אישית">`;
  return wrapTextOutsideAnchors(html, openTag, '</a>');
}
