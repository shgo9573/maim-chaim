export type ReaderLinkTarget =
  | { kind: 'book'; title: string; headings: string[] }
  | { kind: 'inline-book'; title: string; line: number; reference: string }
  | { kind: 'book-id'; id: string; line?: number }
  | { kind: 'anchor'; anchor: string }
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
    const anchor = safeDecode(href.slice(1)).trim();
    return anchor ? { kind: 'anchor', anchor } : null;
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

    if (url.protocol !== 'otzaria:') return null;

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
      if (parts[0] !== 'book' || !parts[1]) return null;
      const id = safeDecode(parts[1]).trim();
      if (!id) return null;
      const rawLine = url.searchParams.get('line');
      const line = rawLine == null ? undefined : Number(rawLine);
      if (line !== undefined && (!Number.isInteger(line) || line < 1)) return null;
      return { kind: 'book-id', id, ...(line === undefined ? {} : { line }) };
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
  if (scheme === 'mailto:' || scheme === 'tel:') {
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
  return target?.kind === 'book' || target?.kind === 'inline-book' || target?.kind === 'book-id';
}
