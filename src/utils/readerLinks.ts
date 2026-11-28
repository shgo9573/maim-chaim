export type ReaderLinkTarget =
  | { kind: 'book'; title: string; headings: string[] }
  | { kind: 'inline-book'; title: string; line: number; reference: string }
  | { kind: 'book-id'; id: string; line?: number; source?: string; highlightText?: string; wholeLine?: boolean; selectLine?: boolean }
  | { kind: 'anchor'; anchor: string; headings: string[] }
  | { kind: 'external'; href: string };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleFromPath(path: string): string {
  const filename = path.replace(/\\/gu, '/').split('/').pop() ?? '';
  return filename.replace(/\.(?:txt|text)$/iu, '').trim();
}

/** Parses only the internal and external link schemes supported by the web reader. */
export function parseReaderLinkTarget(value: string): ReaderLinkTarget | null {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f]/u.test(href)) return null;

  if (href.startsWith('#')) {
    const decoded = safeDecode(href.slice(1));
    const headings = decoded.split('#').map((part) => part.trim()).filter(Boolean);
    const anchor = headings[0];
    return anchor ? { kind: 'anchor', anchor, headings } : null;
  }

  if (href.startsWith('book://')) {
    const parts = href.slice('book://'.length).split('#');
    const title = safeDecode(parts.shift() ?? '').trim();
    if (!title) return null;
    const headings = parts.map((part) => safeDecode(part).trim()).filter(Boolean);
    return { kind: 'book', title, headings };
  }

  if (href.startsWith('otzaria://')) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return null;
    }

    if (url.protocol !== 'otzaria:' || url.username || url.password || url.port) return null;

    if (url.hostname === 'inline-link') {
      const path = url.searchParams.get('path') ?? '';
      const line = Number(url.searchParams.get('index'));
      const title = titleFromPath(path);
      if (!title || !Number.isInteger(line) || line < 1) return null;
      return {
        kind: 'inline-book',
        title,
        line,
        reference: (url.searchParams.get('ref') ?? '').trim(),
      };
    }

    if (url.hostname === 'open') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 2 || parts[0] !== 'book' || !parts[1]) return null;
      const id = safeDecode(parts[1]).trim();
      if (!/^\\d+$/u.test(id) || Number(id) <= 0) return null;

      // Native Otzaria links use a zero-based index; the web reader uses one-based lines.
      // Keep the older web-specific line parameter as a one-based compatibility alias.
      const rawLine = url.searchParams.get('line');
      const rawIndex = url.searchParams.get('index');
      let line: number | undefined;
      let validIndex = false;
      if (rawLine !== null) {
        const parsedLine = Number(rawLine);
        if (!Number.isSafeInteger(parsedLine) || parsedLine < 1) return null;
        line = parsedLine;
      } else if (rawIndex !== null) {
        const parsedIndex = Number(rawIndex);
        if (Number.isSafeInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < Number.MAX_SAFE_INTEGER) {
          line = parsedIndex + 1;
          validIndex = true;
        }
      }

      const rawSource = url.searchParams.get('source');
      const source = rawSource === null ? undefined : rawSource.trim().toLowerCase();
      const markText = (url.searchParams.get('m') ?? '').trim();
      const markSection = url.searchParams.has('mark');
      const queryText = (url.searchParams.get('q') ?? '').trim();
      const highlightText = markText || (!markSection ? queryText : '');

      return {
        kind: 'book-id',
        id,
        ...(line === undefined ? {} : { line }),
        ...(source === undefined || source === 'official' ? {} : { source }),
        ...(highlightText ? { highlightText } : {}),
        ...(!markText && markSection ? { wholeLine: true } : {}),
        ...(validIndex && url.searchParams.has('select') ? { selectLine: true } : {}),
      };
    }

    return null;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme === 'http:' || scheme === 'https:') {
    if (!url.hostname) return null;
    return { kind: 'external', href: url.toString() };
  }
  if (scheme === 'mailto:') {
    if (!url.pathname.trim()) return null;
    return { kind: 'external', href: url.toString() };
  }

  return null;
}

/** Sanitizer entry point: unsafe and unsupported schemes are removed. */
export function sanitizeReaderHref(value: string): string | null {
  return parseReaderLinkTarget(value) ? value.trim() : null;
}

/** HTTP(S) links open a new browser tab; mail and telephone links use the browser handler. */
export function isReaderExternalWebHref(value: string): boolean {
  const target = parseReaderLinkTarget(value);
  return target?.kind === 'external' && /^https?:\/\//iu.test(target.href);
}

export function readerLinkCanOpenInBackground(target: ReaderLinkTarget | null): boolean {
  return target?.kind === 'book' || target?.kind === 'inline-book';
}

/** Keeps fragment IDs limited to plain, inert identifiers used by book markup. */
export function isSafeReaderAnchorId(value: string): boolean {
  return /^[\p{L}\p{N}_.:-]{1,120}$/u.test(value);
}
