import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ChevronDown, ChevronUp, Hash, Minus, Plus, PanelRightClose, PanelRightOpen, Search, MessageSquareText, Link2, TextSearch, X, Copy, ScrollText } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { BookTab, ContentLine, TocEntry } from '../types';
import { buildDeepLink, highlight, highlightWords, processHtml, stripTags, type TextOpts } from '../utils/text';
import BookSidebar from './BookSidebar';
import CommentaryPanel, { fontStack } from './CommentaryPanel';
import { EmptyState, IconBtn, Spinner } from './ui';
import { hebrewNumber, masechtaForName, parseDafRef } from '../utils/talmud';
import { EXCLUDED_BOOK_NOTICE, isExcludedBook } from '../utils/bookFilter';
import { isReaderContextMenuShortcut, placeReaderContextMenu } from '../utils/readerContextMenu';

const CHUNK = 200;
const PRELOAD_MARGIN = '2400px 0px';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

const LineView = memo(function LineView({
  line,
  html,
  selected,
  isMatch,
  inline,
  isHead,
  showRef,
  onSelect,
}: {
  line: ContentLine;
  html: string;
  selected: boolean;
  isMatch?: boolean;
  inline: boolean;
  isHead: boolean;
  showRef?: boolean;
  onSelect: (i: number) => void;
}) {
  const heading = isHead || /^\s*<h\d/i.test(html);
  const refLabel = showRef && !heading && line.heRef ? line.heRef : '';
  return (
    <div
      data-line={line.lineIndex}
      onClick={() => onSelect(line.lineIndex)}
      className={`cursor-text rounded transition-colors ${selected ? 'bg-primary/15' : ''} ${isMatch && !selected ? 'bg-primary/5' : ''} ${inline && !heading ? 'inline' : 'block'}`}
      style={{
        marginBottom: inline && !heading ? 0 : '0.15em',
        ...(isMatch ? { boxShadow: 'inset -3px 0 0 0 var(--c-primary)', paddingInlineEnd: 6 } : null),
        ...(isHead ? { textAlign: 'center', fontWeight: 700, fontSize: '1.25em', margin: '0.5em 0 0.3em' } : null),
      }}
    >
      {refLabel && (
        <span
          className={`select-none text-[0.6em] font-medium text-on-variant ${inline ? 'ml-1' : 'block leading-tight'}`}
          style={{ fontFamily: 'Heebo, sans-serif' }}
        >
          {refLabel}
        </span>
      )}
      <span dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
      {inline && !heading && ' '}
    </div>
  );
});

interface SelMenu {
  text: string;
  line: number;
  from: number;
  to: number;
  left: number;
  top: number;
}

interface ReaderContextMenu {
  x: number;
  y: number;
  line: number;
  text: string;
  from: number;
  to: number;
}

interface ReaderNoteDraft {
  line: number;
  heRef: string;
  selectedText: string;
}

function getReaderSelectionForContextMenu(root: HTMLElement, lineNode: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  try {
    if (!range.intersectsNode(lineNode)) return null;
  } catch {
    return null;
  }

  const text = selection.toString().trim();
  const startElement = range.startContainer.nodeType === 1
    ? (range.startContainer as Element)
    : range.startContainer.parentElement;
  const startLine = startElement?.closest<HTMLElement>('[data-line]');
  if (!text || !startLine) return null;

  const before = document.createRange();
  before.selectNodeContents(startLine);
  before.setEnd(range.startContainer, range.startOffset);
  const prefix = before.toString();
  const trimmedPrefix = prefix.trim();
  let from = trimmedPrefix ? trimmedPrefix.split(/\s+/).length : 0;
  if (trimmedPrefix && !/\s$/.test(prefix)) from -= 1;
  const selectedWords = text.split(/\s+/).filter(Boolean).length;
  return {
    text,
    line: Number(startLine.dataset.line) || Number(lineNode.dataset.line),
    from,
    to: from + Math.max(1, selectedWords) - 1,
  };
}

export default function BookViewer({ tab }: { tab: BookTab }) {
  const { settings, updateSettings, updateTab, addBookmark, saveNote, openSearch, saveHistory, library, libraryLoading, toast, openTzuratHaDaf } = useApp();
  const [lines, setLines] = useState<ContentLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [selMenu, setSelMenu] = useState<SelMenu | null>(null);
  const [contextMenu, setContextMenu] = useState<ReaderContextMenu | null>(null);
  const [noteDraft, setNoteDraft] = useState<ReaderNoteDraft | null>(null);
  const [noteText, setNoteText] = useState('');
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [topLine, setTopLine] = useState(tab.line);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [sidebarTab, setSidebarTab] = useState<'toc' | 'search'>('toc');
  const [searchSeed, setSearchSeed] = useState(0);
  const bookLayout = settings.perBookSettingsEnabled ? settings.perBookLayoutSettings?.[String(tab.bookId)] : undefined;
  const [commentOpen, setCommentOpen] = useState(() => bookLayout?.commentaryOpen ?? settings.commentaryOpenByDefault ?? settings.commentaryViewMode !== 'inline');
  const [commentWidth, setCommentWidth] = useState(() => bookLayout?.commentaryPanelWidth ?? settings.commentaryPanelWidth ?? 19);
  const [sidebarWidth, setSidebarWidth] = useState(() => bookLayout?.navigationPanelWidth ?? settings.navigationPanelWidth ?? 16);
  const commentWidthRef = useRef(commentWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  commentWidthRef.current = commentWidth;
  sidebarWidthRef.current = sidebarWidth;
  const [commentLine, setCommentLine] = useState(tab.line);
  const [endReached, setEndReached] = useState(false);

  const scRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const firstContextMenuItemRef = useRef<HTMLButtonElement>(null);
  const touchTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; line: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const botSentinel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const position = placeReaderContextMenu(
      { x: contextMenu.x, y: contextMenu.y },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    if (Math.abs(position.left - contextMenu.x) > 0.5 || Math.abs(position.top - contextMenu.y) > 0.5) {
      setContextMenu((current) => current ? { ...current, x: position.left, y: position.top } : current);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const frame = window.requestAnimationFrame(() => firstContextMenuItemRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu]);
  const pending = useRef<null | { type: 'jump'; line: number } | { type: 'prepend'; h: number; t: number }>(null);
  const busyDown = useRef(false);
  const busyUp = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const totalRef = useRef(total);
  totalRef.current = total;
  const reachedEndRef = useRef(false);
  const topReachedRef = useRef(false);

  const saveLayoutPreference = useCallback((patch: { commentaryPanelWidth?: number; navigationPanelWidth?: number; commentaryOpen?: boolean }) => {
    if (settings.perBookSettingsEnabled) {
      const all = settings.perBookLayoutSettings || {};
      const key = String(tab.bookId);
      updateSettings({ perBookLayoutSettings: { ...all, [key]: { ...(all[key] || {}), ...patch } } });
    } else {
      const { commentaryOpen: open, ...sizes } = patch;
      updateSettings({ ...sizes, ...(open !== undefined ? { commentaryOpenByDefault: open } : {}) });
    }
  }, [settings.perBookSettingsEnabled, settings.perBookLayoutSettings, tab.bookId, updateSettings]);

  useEffect(() => {
    const own = settings.perBookSettingsEnabled ? settings.perBookLayoutSettings?.[String(tab.bookId)] : undefined;
    setCommentWidth(own?.commentaryPanelWidth ?? settings.commentaryPanelWidth ?? 19);
    setSidebarWidth(own?.navigationPanelWidth ?? settings.navigationPanelWidth ?? 16);
    setCommentOpen(own?.commentaryOpen ?? settings.commentaryOpenByDefault ?? settings.commentaryViewMode !== 'inline');
  }, [tab.bookId, settings.perBookSettingsEnabled, settings.perBookLayoutSettings, settings.commentaryPanelWidth, settings.navigationPanelWidth, settings.commentaryOpenByDefault, settings.commentaryViewMode]);

  const book = library?.byId.get(String(tab.bookId));
  const blocked = isExcludedBook(book || { id: tab.bookId, title: tab.title, categoryPath: tab.category || '' });
  // Unknown IDs from direct links must wait for the catalogue to resolve source metadata.
  // If the catalogue cannot be loaded, fail closed rather than accidentally exposing an
  // ID whose source cannot be verified.
  const waitingForCatalogue = !book && !blocked && (libraryLoading || !library);

  const [toc, setToc] = useState<TocEntry[] | null>(null);
  const [tocError, setTocError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setToc(null);
    setTocError('');
    if (blocked) {
      setTocError(EXCLUDED_BOOK_NOTICE);
      return () => { cancelled = true; };
    }
    if (waitingForCatalogue) return () => { cancelled = true; };
    api
      .toc(tab.bookId)
      .then((t) => !cancelled && setToc(t))
      .catch((e) => !cancelled && setTocError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab.bookId, book, blocked, waitingForCatalogue]);
  const headIdx = useMemo(() => new Set((toc || []).map((t) => t.index)), [toc]);

  const title = book?.title || tab.title;
  const category = book?.categoryPath || tab.category || '';
  const isTanakh = category.startsWith('תנ"ך') || category.startsWith("תנ'ך");
  const dafMasechta = masechtaForName(title);
  const isBavli = !!dafMasechta && /תלמוד|גמרא|בבלי/u.test(`${title} ${category}`);


  // fill in the real title once the library is loaded (deep links open before it is)
  useEffect(() => {
    if (book && (book.title !== tab.title || (book.categoryPath && book.categoryPath !== tab.category))) {
      updateTab(tab.id, { title: book.title, category: book.categoryPath });
    }
  }, [book, tab.id, tab.title, tab.category, updateTab]);

  const opts: TextOpts = useMemo(() => {
    const nikud = settings.nikudPolicy === 'none' ? false : settings.nikudPolicy === 'tanakh_only' ? isTanakh && settings.showNikud : settings.showNikud;
    return { nikud, teamim: settings.showTeamim && nikud, punctuation: settings.showPunctuation, holyName: settings.holyNameReplacement };
  }, [settings.nikudPolicy, settings.showNikud, settings.showTeamim, settings.showPunctuation, settings.holyNameReplacement, isTanakh]);
  const optsKey = JSON.stringify(opts);

  // ---- initial / jump load ----
  const target = tab.jump?.line ?? tab.line;
  const jumpN = tab.jump?.n ?? 0;
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoading(true);
    setError('');
    busyDown.current = false;
    busyUp.current = false;
    reachedEndRef.current = false;
    topReachedRef.current = false;
    setEndReached(false);
    if (blocked) {
      setLines([]);
      setTotal(0);
      setError(EXCLUDED_BOOK_NOTICE);
      setLoading(false);
      return () => { cancelled = true; };
    }
    if (waitingForCatalogue) {
      if (!libraryLoading && !library) {
        setLines([]);
        setTotal(0);
        setError('לא ניתן לאמת את מקור הספר כי הקטלוג לא נטען. רענן את האתר ונסה שוב.');
        setLoading(false);
      } else {
        setLoading(true);
      }
      return () => { cancelled = true; };
    }
    const start = Math.max(1, target - 60);
    api
      .content(tab.bookId, start, target + CHUNK)
      .then((r) => {
        if (cancelled) return;
        setTotal(r.totalLines);
        if (r.totalLines) totalRef.current = r.totalLines;
        const safeTarget = r.totalLines > 0 ? Math.min(target, r.totalLines) : target;
        pending.current = { type: 'jump', line: safeTarget };
        setLines(r.lines);
        if (tab.jump) setSelected(safeTarget);
        const last = r.lines[r.lines.length - 1]?.lineIndex ?? 0;
        if ((r.totalLines > 0 && last >= r.totalLines) || (!r.totalLines && r.lines.length < target + CHUNK - start + 1)) {
          reachedEndRef.current = true;
          setEndReached(true);
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.bookId, jumpN, library, libraryLoading, blocked, waitingForCatalogue]);

  useLayoutEffect(() => {
    const sc = scRef.current;
    const p = pending.current;
    if (!sc || !p) return;
    if (p.type === 'jump') {
      const el = sc.querySelector<HTMLElement>(`[data-line="${p.line}"]`);
      sc.scrollTop = el ? Math.max(0, sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12) : 0;
      pending.current = null;
      setReady(true);
      setTopLine(p.line);
      setCommentLine(p.line);
    } else {
      sc.scrollTop = p.t + (sc.scrollHeight - p.h);
      pending.current = null;
    }
  }, [lines]);

  const downErrors = useRef(0);
  const loadDown = useCallback(async () => {
    if (busyDown.current || reachedEndRef.current) return;
    const cur = linesRef.current;
    const last = cur[cur.length - 1];
    if (!last) return;
    if (totalRef.current > 0 && last.lineIndex >= totalRef.current) {
      reachedEndRef.current = true;
      setEndReached(true);
      return;
    }
    busyDown.current = true;
    try {
      const from = last.lineIndex + 1;
      // never request beyond the known total – the server may ignore the range
      // and return the same lines again, which used to cause an endless loop
      const effectiveTo = totalRef.current > 0 ? Math.min(last.lineIndex + CHUNK, totalRef.current) : last.lineIndex + CHUNK;
      if (totalRef.current > 0 && from > totalRef.current) {
        reachedEndRef.current = true;
        setEndReached(true);
        return;
      }
      const r = await api.content(tab.bookId, from, effectiveTo);
      if (r.totalLines) {
        setTotal(r.totalLines);
        totalRef.current = r.totalLines;
      }
      const incoming = r.lines || [];
      if (incoming.length === 0) {
        reachedEndRef.current = true;
        setEndReached(true);
        setTotal(last.lineIndex);
        totalRef.current = last.lineIndex;
        return;
      }
      // progress check: if the server returned no lines beyond what we have,
      // it is ignoring the range – stop instead of polling forever
      const fresh = incoming.filter((l) => l.lineIndex > last.lineIndex);
      if (fresh.length === 0) {
        reachedEndRef.current = true;
        setEndReached(true);
        setTotal(last.lineIndex);
        totalRef.current = last.lineIndex;
        return;
      }
      downErrors.current = 0;
      setLines((p) => {
        const lastIdx = p[p.length - 1]?.lineIndex ?? 0;
        return [...p, ...fresh.filter((l) => l.lineIndex > lastIdx)];
      });
      const lastGot = fresh[fresh.length - 1].lineIndex;
      const knownTotal = r.totalLines || totalRef.current;
      const isEnd = knownTotal > 0 ? lastGot >= knownTotal : incoming.length < effectiveTo - from + 1;
      if (isEnd) {
        reachedEndRef.current = true;
        setEndReached(true);
        if (!knownTotal) {
          setTotal(lastGot);
          totalRef.current = lastGot;
        }
      }
    } catch {
      // transient network error: allow a retry, but stop after repeated failures
      // so a persistently failing range can't spin forever
      downErrors.current += 1;
      if (downErrors.current >= 3) {
        reachedEndRef.current = true;
        setEndReached(true);
      }
    } finally {
      busyDown.current = false;
    }
  }, [tab.bookId]);

  const loadUp = useCallback(async () => {
    if (busyUp.current || topReachedRef.current) return;
    const cur = linesRef.current;
    const first = cur[0];
    if (!first || first.lineIndex <= 1) return;
    busyUp.current = true;
    try {
      const start = Math.max(1, first.lineIndex - CHUNK);
      const r = await api.content(tab.bookId, start, first.lineIndex - 1);
      const sc = scRef.current;
      const incoming = r.lines || [];
      const fresh = incoming.filter((l) => l.lineIndex < first.lineIndex);
      if (fresh.length === 0) {
        // server ignored the range – stop polling upward
        topReachedRef.current = true;
        return;
      }
      if (sc && fresh.length) {
        pending.current = { type: 'prepend', h: sc.scrollHeight, t: sc.scrollTop };
        setLines((p) => {
          const firstIdx = p[0]?.lineIndex ?? Infinity;
          return [...fresh.filter((l) => l.lineIndex < firstIdx), ...p];
        });
      }
    } catch {
      /* ignore – a failed upward fetch simply retries on next intersection */
    } finally {
      busyUp.current = false;
    }
  }, [tab.bookId]);

  useEffect(() => {
    const sc = scRef.current;
    if (!ready || !sc || endReached) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === botSentinel.current) loadDown();
          if (e.target === topSentinel.current) loadUp();
        }
      },
      { root: sc, rootMargin: PRELOAD_MARGIN },
    );
    if (topSentinel.current) io.observe(topSentinel.current);
    if (botSentinel.current) io.observe(botSentinel.current);
    return () => io.disconnect();
  }, [ready, lines, loadDown, loadUp, endReached]);

  // if the viewport isn't filled yet (short lines), keep loading
  useEffect(() => {
    const sc = scRef.current;
    if (!ready || !sc || endReached) return;
    if (sc.scrollHeight <= sc.clientHeight + 200) loadDown();
  }, [ready, lines, loadDown, endReached]);

  // ---- scroll tracking ----
  const rafRef = useRef(0);
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const sc = scRef.current;
      if (!sc || !ready) return;
      const top = sc.getBoundingClientRect().top;
      const nodes = sc.querySelectorAll<HTMLElement>('[data-line]');
      // binary search for the first visible line
      let lo = 0;
      let hi = nodes.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (nodes[mid].getBoundingClientRect().bottom > top + 6) {
          found = mid;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      if (found >= 0) setTopLine(Number(nodes[found].dataset.line));
    });
  };

  // persist position (debounced)
  const curRef = useRef({ topLine, lines });
  curRef.current = { topLine, lines };
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      updateTab(tab.id, { line: topLine });
      const l = curRef.current.lines.find((x) => x.lineIndex === topLine);
      saveHistory({ bookId: tab.bookId, bookTitle: title, category, lastPosition: topLine, lastSection: l?.heRef || '' });
    }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLine, ready]);

  // commentary line follows selection / top line (debounced)
  const wanted = selected ?? topLine;
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setCommentLine(wanted), 350);
    return () => window.clearTimeout(t);
  }, [wanted, ready]);

  const goTo = useCallback(
    (line: number, hlText?: string) => {
      updateTab(tab.id, { jump: { line, n: Date.now() }, ...(hlText !== undefined ? { highlight: { text: hlText } } : {}) });
      // jumping between in-book search results keeps the panel open until the user closes it;
      // only table-of-contents navigation on small screens collapses the overlay
      if (hlText === undefined && window.innerWidth < 900) setSidebarOpen(false);
    },
    [tab.id, updateTab],
  );

  const openBookSearch = (query = '') => {
    setBookSearchQuery(query);
    setSidebarOpen(true);
    setSidebarTab('search');
    setSearchSeed((seed) => seed + 1);
  };

  const openCommentaryForLine = (line: number) => {
    setSelected(line);
    setCommentLine(line);
    if (!commentOpen) {
      setCommentOpen(true);
      saveLayoutPreference({ commentaryOpen: true });
    }
  };

  const openLocalTzuratHaDaf = () => {
    if (!dafMasechta) return;
    // Resolve the daf/amud closest to the reader's current position.
    let ref = parseDafRef(lines.find((l) => l.lineIndex === topLine)?.heRef || '');
    if (toc) {
      let best: TocEntry | undefined;
      for (const entry of toc) {
        if (entry.index <= topLine && /^דף\s/u.test(entry.title) && (!best || entry.index >= best.index)) best = entry;
      }
      const fromToc = best && parseDafRef(best.title);
      if (fromToc) ref = fromToc;
    }
    const daf = ref?.daf ?? 2;
    const amud = ref?.amud ?? 'a';
    openTzuratHaDaf({ id: tab.bookId, title, categoryPath: category }, daf, amud, 'reuse');
  };

  const onSelect = useCallback((i: number) => {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    setSelected((s) => (s === i ? null : i));
  }, []);

  // ---- selection menu (copy text / link to line / link to text) ----
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = scRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
          setSelMenu(null);
          return;
        }
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) {
          setSelMenu(null);
          return;
        }
        const text = sel.toString().trim();
        const startEl = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
        const lineNode = startEl?.closest<HTMLElement>('[data-line]');
        const rect = range.getBoundingClientRect();
        if (!text || !lineNode || (rect.width === 0 && rect.height === 0)) {
          setSelMenu(null);
          return;
        }
        // word offsets inside the line
        const before = document.createRange();
        before.selectNodeContents(lineNode);
        before.setEnd(range.startContainer, range.startOffset);
        const prefix = before.toString();
        const prefTrim = prefix.trim();
        let from = prefTrim ? prefTrim.split(/\s+/).length : 0;
        if (prefTrim && !/\s$/.test(prefix)) from -= 1; // selection starts mid-word
        const count = text.split(/\s+/).filter(Boolean).length;
        const to = from + Math.max(1, count) - 1;
        const left = Math.min(window.innerWidth - 190, Math.max(190, rect.left + rect.width / 2));
        const top = rect.top > 70 ? rect.top - 52 : Math.min(window.innerHeight - 54, rect.bottom + 8);
        setSelMenu({ text, line: Number(lineNode.dataset.line), from, to, left, top });
      });
    };
    document.addEventListener('selectionchange', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', update);
    };
  }, []);

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
      setSelMenu(null);
      setContextMenu(null);
    } catch {
      setContextMenu(null);
      toast('לא ניתן להעתיק ללוח');
    }
  };

  const copyTextAsLink = async (selection: Pick<SelMenu, 'text' | 'line' | 'from' | 'to'>) => {
    const href = buildDeepLink({ book: String(tab.bookId), title, line: selection.line, from: selection.from, to: selection.to });
    const html = `<a href="${escapeHtml(href)}" style="color:#1769e0;text-decoration:underline">${escapeHtml(selection.text)}</a>`;
    const plain = `${selection.text}\\n${href}`;
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast('הטקסט הועתק כקישור');
      setSelMenu(null);
      setContextMenu(null);
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        toast('הטקסט הועתק כקישור');
        setSelMenu(null);
        setContextMenu(null);
      } catch {
        setContextMenu(null);
        toast('לא ניתן להעתיק ללוח');
      }
    }
  };

  const copySelectionAsLink = async () => {
    if (!selMenu) return;
    await copyTextAsLink(selMenu);
  };

  const curLine = lines.find((l) => l.lineIndex === topLine);
  const refLabel = curLine?.heRef || '';

  const addMarkAt = (lineIndex: number) => {
    const line = lines.find((item) => item.lineIndex === lineIndex);
    void addBookmark({
      bookId: tab.bookId,
      bookTitle: title,
      lineIndex,
      textSnippet: stripTags(line?.content || '').slice(0, 120),
      heRef: line?.heRef || '',
      category,
    });
  };

  const addMark = () => addMarkAt(selected ?? topLine);

  const openReaderContextMenuAt = (x: number, y: number, lineNode: HTMLElement) => {
    const clickedLine = Number(lineNode.dataset.line);
    if (!Number.isInteger(clickedLine) || clickedLine < 1) return;
    const selection = scRef.current
      ? getReaderSelectionForContextMenu(scRef.current, lineNode)
      : null;
    setSelMenu(null);
    setContextMenu({
      x,
      y,
      line: selection?.line ?? clickedLine,
      text: selection?.text ?? '',
      from: selection?.from ?? 0,
      to: selection?.to ?? 0,
    });
  };

  const handleReaderContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const lineNode = target?.closest<HTMLElement>('[data-line]');
    if (!lineNode) return;
    event.preventDefault();
    openReaderContextMenuAt(event.clientX, event.clientY, lineNode);
  };

  const handleReaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isReaderContextMenuShortcut(event.key, event.shiftKey)) return;
    event.preventDefault();
    const lineIndex = selected ?? topLine;
    const lineNode = scRef.current?.querySelector<HTMLElement>('[data-line="' + lineIndex + '"]');
    if (!lineNode) return;
    const rect = lineNode.getBoundingClientRect();
    openReaderContextMenuAt(rect.left + Math.min(rect.width / 2, 180), rect.bottom, lineNode);
  };

  const clearReaderTouchTimer = () => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    touchStartRef.current = null;
  };

  const handleReaderTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const target = event.target instanceof Element ? event.target : null;
    const lineNode = target?.closest<HTMLElement>('[data-line]');
    const line = Number(lineNode?.dataset.line);
    if (!touch || !lineNode || !Number.isInteger(line) || line < 1) return;
    clearReaderTouchTimer();
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, line };
    touchTimerRef.current = window.setTimeout(() => {
      const point = touchStartRef.current;
      touchTimerRef.current = null;
      if (!point) return;
      const node = scRef.current?.querySelector<HTMLElement>('[data-line="' + point.line + '"]');
      if (node) openReaderContextMenuAt(point.x, point.y, node);
    }, 560);
  };

  const handleReaderTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = touchStartRef.current;
    const touch = event.touches[0];
    if (!point || !touch) return;
    if (Math.hypot(touch.clientX - point.x, touch.clientY - point.y) > 12) {
      clearReaderTouchTimer();
    }
  };

  const closeReaderContextMenu = () => {
    setContextMenu(null);
    window.requestAnimationFrame(() => scRef.current?.focus({ preventScroll: true }));
  };

  const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeReaderContextMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(contextMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    event.preventDefault();
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1 + items.length) % items.length
          : (activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
    items[nextIndex].focus();
  };

  const saveContextNote = () => {
    if (!noteDraft) return;
    const text = noteText.trim();
    if (!text) {
      toast('יש להזין תוכן להערה');
      return;
    }
    saveNote({
      bookId: tab.bookId,
      line: noteDraft.line - 1,
      heRef: noteDraft.heRef,
      text,
    });
    setNoteDraft(null);
    setNoteText('');
    toast('ההערה נשמרה');
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (settings.copyIncludeHeader !== 'always') return;
    const text = window.getSelection()?.toString();
    if (!text) return;
    const header =
      settings.copyHeaderFormat === 'title_only' ? title : settings.copyHeaderFormat === 'full_path' ? `${category}/${title}${refLabel ? ' ' + refLabel : ''}` : `${title}${refLabel ? ', ' + refLabel : ''}`;
    e.clipboardData.setData('text/plain', `${text}\n\n(${header})`);
    e.preventDefault();
  };

  // resizable divider
  const dragging = useRef(false);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (!dragging.current || !bodyRef.current) return;
      const r = bodyRef.current.getBoundingClientRect();
      const min = Math.max(16, 220 / r.width * 100);
      const textMin = Math.max(24, 320 / r.width * 100);
      const max = Math.min(60, 100 - (sidebarOpen ? sidebarWidthRef.current : 0) - textMin);
      setCommentWidth(Math.max(min, Math.min(max, (ev.clientX - r.left) / r.width * 100)));
    };
    const up = () => {
      dragging.current = false;
      saveLayoutPreference({ commentaryPanelWidth: commentWidthRef.current });
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const startSidebarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (!dragging.current || !bodyRef.current) return;
      const r = bodyRef.current.getBoundingClientRect();
      const minText = Math.max(24, 320 / r.width * 100);
      const comment = commentOpen ? commentWidthRef.current : 0;
      const max = Math.min(32, 100 - comment - minText);
      setSidebarWidth(Math.max(12, Math.min(max, (r.right - ev.clientX) / r.width * 100)));
    };
    const up = () => {
      dragging.current = false;
      saveLayoutPreference({ navigationPanelWidth: sidebarWidthRef.current });
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const toggleCommentary = () => {
    const next = !commentOpen;
    setCommentOpen(next);
    saveLayoutPreference({ commentaryOpen: next });
  };

  const inline = settings.continuousReadingMode;
  const hl = tab.highlight;
  const matchSet = useMemo(() => new Set(hl?.matches ?? []), [hl?.matches]);
  const matchPos = useMemo(() => {
    const m = hl?.matches;
    if (!m?.length) return -1;
    const cur = selected ?? topLine;
    const exact = m.indexOf(cur);
    return exact >= 0 ? exact : -1;
  }, [hl?.matches, selected, topLine]);

  const gotoMatch = (dir: 1 | -1) => {
    const m = hl?.matches;
    if (!m?.length) return;
    const cur = selected ?? topLine;
    let next: number;
    if (dir === 1) next = m.find((x) => x > cur) ?? m[0];
    else next = [...m].reverse().find((x) => x < cur) ?? m[m.length - 1];
    setSelected(next);
    updateTab(tab.id, { jump: { line: next, n: Date.now() } });
  };
  const processed = useMemo(
    () =>
      lines.map((l) => {
        let html = processHtml(l.content, opts);
        if (hl?.from !== undefined && hl.line === l.lineIndex) html = highlightWords(html, hl.from, hl.to ?? hl.from);
        else if (hl?.text && (hl.line === undefined || hl.line === l.lineIndex)) html = highlight(html, hl.text);
        return html;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, optsKey, hl?.text, hl?.line, hl?.from, hl?.to],
  );

  const atStart = lines[0]?.lineIndex <= 1;
  const atEnd = endReached || (lines.length > 0 && total > 0 && lines[lines.length - 1].lineIndex >= total);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* toolbar */}
      <div className="flex items-center gap-1 border-b border-outline-variant bg-surface px-2 py-1.5">
        <IconBtn title={sidebarOpen ? 'הסתר ניווט' : 'הצג ניווט'} onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
        </IconBtn>
        <div className="min-w-0 flex-1 px-2" style={{ height: 36 }}>
          <div className="truncate text-[15px] font-medium leading-tight">{title}</div>
          <div className="truncate text-xs leading-tight text-on-variant tabular-nums" style={{ minHeight: 16 }}>
            {refLabel}
          </div>
        </div>
        {hl?.matches && hl.matches.length > 0 && (
          <div className="hidden items-center gap-0.5 rounded-full bg-sec-container px-1.5 py-0.5 text-xs text-on-sec-container sm:flex" title="תוצאות החיפוש בספר זה">
            <button onClick={() => gotoMatch(-1)} className="rounded-full p-1 hover:bg-surface-3/40" aria-label="תוצאה קודמת">
              <ChevronUp size={14} />
            </button>
            <span className="tabular-nums">
              {matchPos >= 0 ? matchPos + 1 : '–'}/{hl.matches.length}
            </span>
            <button onClick={() => gotoMatch(1)} className="rounded-full p-1 hover:bg-surface-3/40" aria-label="תוצאה הבאה">
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        {hl && (
          <button onClick={() => updateTab(tab.id, { highlight: undefined })} className="hidden items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs sm:flex" title="נקה הדגשה">
            <X size={12} /> הדגשה
          </button>
        )}
        <IconBtn title="חיפוש בספר" onClick={() => openBookSearch('')}>
          <TextSearch size={20} />
        </IconBtn>
        <IconBtn title="הוסף סימניה" onClick={addMark}>
          <Bookmark size={20} />
        </IconBtn>
        {isBavli && (
          <IconBtn title="פתח צורת הדף המקומית בתוך אוצריא" onClick={openLocalTzuratHaDaf}>
            <ScrollText size={20} />
          </IconBtn>
        )}
        <IconBtn
          title={settings.showLineRefs ? 'הסתר כותרות שורה' : 'הצג כותרות שורה'}
          active={!!settings.showLineRefs}
          onClick={() => updateSettings({ showLineRefs: !settings.showLineRefs })}
        >
          <Hash size={18} />
        </IconBtn>
        <IconBtn title={settings.showNikud ? 'הסתר ניקוד' : 'הצג ניקוד'} active={settings.showNikud} onClick={() => updateSettings({ showNikud: !settings.showNikud })}>
          <span className="text-[19px] font-bold leading-none" style={{ fontFamily: fontStack(settings.fontFamily) }}>
            {settings.showNikud ? 'אֶ' : 'א'}
          </span>
        </IconBtn>
        <IconBtn title="העתק קישור לשורה הנוכחית" onClick={() => copy(buildDeepLink({ book: String(tab.bookId), title, line: selected ?? topLine }), 'הקישור לשורה הועתק')}>
          <Link2 size={19} />
        </IconBtn>
        <IconBtn title="הקטן גופן" onClick={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 2) })}>
          <Minus size={18} />
        </IconBtn>
        <span className="hidden w-7 text-center text-xs text-on-variant sm:block">{settings.fontSize}</span>
        <IconBtn title="הגדל גופן" onClick={() => updateSettings({ fontSize: Math.min(64, settings.fontSize + 2) })}>
          <Plus size={18} />
        </IconBtn>
        <IconBtn title={commentOpen ? 'הסתר מפרשים' : 'הצג מפרשים'} active={commentOpen} onClick={toggleCommentary}>
          <MessageSquareText size={20} />
        </IconBtn>
      </div>

      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <div
              className="absolute inset-y-0 right-0 z-20 w-[min(320px,88vw)] shadow-xl md:static md:z-auto md:w-[var(--sw)] md:shrink-0 md:shadow-none"
              style={{ ['--sw' as string]: `${sidebarWidth}%` }}
            >
              {!blocked && !waitingForCatalogue && <BookSidebar
                bookId={tab.bookId}
                bookTitle={title}
                tab={sidebarTab}
                setTab={setSidebarTab}
                currentLine={topLine}
                onGo={goTo}
                opts={opts}
                searchSeed={searchSeed}
                searchQuery={bookSearchQuery}
                toc={toc}
                tocError={tocError}
              />}
            </div>
            <div onMouseDown={startSidebarDrag} className="hidden w-1.5 shrink-0 cursor-col-resize bg-outline-variant/60 transition-colors hover:bg-primary md:block" title="גרור לשינוי רוחב הניווט" />
          </>
        )}

        {commentOpen && !blocked && !waitingForCatalogue && (
          <>
            <div
              className="absolute inset-x-0 bottom-0 z-10 h-[50%] border-t border-outline-variant shadow-[0_-4px_16px_rgba(0,0,0,0.15)] md:static md:z-auto md:h-auto md:w-[var(--cw)] md:shrink-0 md:border-t-0 md:shadow-none"
              style={{ ['--cw' as string]: `${commentWidth}%`, order: 3 }}
            >
              <CommentaryPanel bookId={tab.bookId} bookTitle={title} line={commentLine} heRef={lines.find((l) => l.lineIndex === commentLine)?.heRef} opts={opts} />
            </div>
            <div onMouseDown={startDrag} className="hidden w-1.5 shrink-0 cursor-col-resize bg-outline-variant/60 transition-colors hover:bg-primary md:block" style={{ order: 2 }} />
          </>
        )}

        <div className="relative min-w-0 flex-1" style={{ order: 1 }}>
          <div
            ref={scRef}
            tabIndex={0}
            aria-label="תוכן הספר"
            onScroll={() => { onScroll(); setContextMenu(null); }}
            onCopy={onCopy}
            onContextMenu={handleReaderContextMenu}
            onKeyDown={handleReaderKeyDown}
            onTouchStart={handleReaderTouchStart}
            onTouchMove={handleReaderTouchMove}
            onTouchEnd={clearReaderTouchTimer}
            onTouchCancel={clearReaderTouchTimer}
            className="relative h-full overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 md:px-10"
          >
            {loading && lines.length === 0 && <Spinner label="טוען את הספר..." />}
            {error && (
              <EmptyState icon={<Search size={48} />} title="שגיאה בטעינת הספר" hint={error}>
                <button onClick={() => updateTab(tab.id, { jump: { line: tab.line, n: Date.now() } })} className="rounded-full bg-primary px-5 py-2 text-sm text-on-primary">
                  נסה שוב
                </button>
              </EmptyState>
            )}
            {!loading && !error && lines.length === 0 && <EmptyState icon={<Search size={48} />} title="אין תוכן להצגה בספר זה" />}
            {lines.length > 0 && (
              <div
                dir="rtl"
                className="book-text mx-auto"
                style={{
                  maxWidth: settings.textMaxWidth === '100%' ? '60rem' : `calc(60rem * ${parseInt(settings.textMaxWidth) / 100})`,
                  fontFamily: fontStack(settings.fontFamily),
                  fontSize: settings.fontSize,
                  lineHeight: settings.lineHeight,
                  opacity: ready ? 1 : 0,
                }}
              >
                {!atStart && <div ref={topSentinel} className="h-px" />}
                {atStart && <div className="h-2" />}
                {lines.map((l, i) => (
                  <LineView
                    key={l.lineIndex}
                    line={l}
                    html={processed[i]}
                    selected={selected === l.lineIndex}
                    isMatch={matchSet.has(l.lineIndex)}
                    inline={inline}
                    isHead={headIdx.has(l.lineIndex) && !l.heRef && l.content.length < 60}
                    showRef={!!settings.showLineRefs}
                    onSelect={onSelect}
                  />
                ))}
                {!atEnd && !endReached && <div ref={botSentinel} className="h-px" />}
                {atEnd || endReached ? (
                  <div className="py-10 text-center text-sm text-on-variant" style={{ fontFamily: 'Heebo' }}>
                    • סוף הספר •
                  </div>
                ) : (
                  <div className="py-6">
                    <div className="spinner mx-auto" />
                  </div>
                )}
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-transparent">
              <div className="ml-auto h-full bg-primary/60" style={{ width: `${Math.min(100, (topLine / total) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed inset-0 z-[110]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeReaderContextMenu();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            ref={contextMenuRef}
            role="menu"
            aria-label="פעולות על טקסט בספר"
            dir="rtl"
            className="fixed z-[111] flex w-[min(300px,calc(100vw-16px))] max-h-[calc(100vh-16px)] flex-col overflow-y-auto rounded-xl border border-outline-variant bg-surface-2 p-1.5 text-sm text-on-surface shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={handleContextMenuKeyDown}
          >
            <button
              ref={firstContextMenuItemRef}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none motion-reduce:transition-none"
              onClick={() => {
                const line = lines.find((item) => item.lineIndex === contextMenu.line);
                void copy(stripTags(line?.content || '').trim(), 'הפסקה הועתקה');
              }}
            >
              <Copy size={15} /> העתק את כל הפסקה
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!contextMenu.text}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void copy(contextMenu.text, 'הטקסט הועתק')}
            >
              <Copy size={15} /> העתק טקסט נבחר
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => void copy(buildDeepLink({ book: String(tab.bookId), title, line: contextMenu.line }), 'הקישור לשורה הועתק')}
            >
              <Link2 size={15} /> העתק קישור לשורה
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!contextMenu.text}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void copyTextAsLink(contextMenu)}
            >
              <Link2 size={15} /> העתק טקסט כקישור
            </button>

            <div role="separator" className="my-1 border-t border-outline-variant" />

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                openSearch(contextMenu.text || undefined);
              }}
            >
              <Search size={15} /> חיפוש בכל הספרים
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                openBookSearch(contextMenu.text);
              }}
            >
              <TextSearch size={15} /> חיפוש בספר
            </button>

            <div role="separator" className="my-1 border-t border-outline-variant" />

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                addMarkAt(contextMenu.line);
              }}
            >
              <Bookmark size={15} /> הוסף סימניה לקטע זה
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                const line = lines.find((item) => item.lineIndex === contextMenu.line);
                setNoteDraft({
                  line: contextMenu.line,
                  heRef: line?.heRef || '',
                  selectedText: contextMenu.text,
                });
                setNoteText('');
                setContextMenu(null);
              }}
            >
              <MessageSquareText size={15} /> הוסף הערה אישית
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                openCommentaryForLine(contextMenu.line);
              }}
            >
              <MessageSquareText size={15} /> הצג מפרשים לשורה
            </button>
          </div>
        </div>
      )}

      {noteDraft && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setNoteDraft(null);
              setNoteText('');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setNoteDraft(null);
              setNoteText('');
            }
          }}
        >
          <section
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-note-title"
            className="w-full max-w-lg rounded-2xl border border-outline-variant bg-surface p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="reader-note-title" className="text-base font-semibold">הערה אישית</h2>
                <p className="mt-1 text-xs text-on-variant">{title} · {noteDraft.heRef || 'שורה ' + noteDraft.line}</p>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-on-variant hover:bg-surface-3"
                aria-label="סגור"
                onClick={() => { setNoteDraft(null); setNoteText(''); }}
              >
                <X size={17} />
              </button>
            </div>
            {noteDraft.selectedText && (
              <blockquote className="mb-3 max-h-24 overflow-y-auto rounded-lg bg-surface-1 px-3 py-2 text-sm text-on-variant">
                {noteDraft.selectedText}
              </blockquote>
            )}
            <textarea
              autoFocus
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={6}
              placeholder="כתוב כאן את ההערה או החידוש..."
              className="w-full resize-y rounded-xl border border-outline-variant bg-surface-1 p-3 text-sm leading-relaxed text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-on-variant hover:bg-surface-3"
                onClick={() => { setNoteDraft(null); setNoteText(''); }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={!noteText.trim()}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={saveContextNote}
              >
                שמור הערה
              </button>
            </div>
          </section>
        </div>
      )}

      {selMenu && !contextMenu && !noteDraft && (
        <div
          className="fixed z-[80] flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-outline-variant bg-surface-2 p-1 text-[13px] text-on-surface shadow-xl"
          style={{ left: selMenu.left, top: selMenu.top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={() => copy(selMenu.text, 'הטקסט הועתק')} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 hover:bg-surface-3">
            <Copy size={14} /> העתק טקסט
          </button>
          <button onClick={() => copy(buildDeepLink({ book: String(tab.bookId), title, line: selMenu.line }), 'הקישור לשורה הועתק')} className="rounded-xl px-2.5 py-1.5 hover:bg-surface-3">
            קישור לשורה
          </button>
          <button
            onClick={copySelectionAsLink}
            className="rounded-xl bg-sec-container px-2.5 py-1.5 text-on-sec-container hover:brightness-95"
          >
            העתק טקסט כקישור
          </button>
          <button onClick={() => setSelMenu(null)} className="rounded-full p-1.5 text-on-variant hover:bg-surface-3" aria-label="סגור">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
