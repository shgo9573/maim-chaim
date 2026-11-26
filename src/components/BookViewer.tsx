import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, ChevronDown, ChevronUp, Hash, Minus, Plus, PanelRightClose, PanelRightOpen, Search, MessageSquareText, Link2, TextSearch, X, Copy, ScrollText } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import type { BookItem, BookTab, ContentLine, TocEntry } from '../types';
import { buildDeepLink, highlight, highlightWords, processHtml, stripTags, type TextOpts } from '../utils/text';
import BookSidebar from './BookSidebar';
import CommentaryPanel, { fontStack } from './CommentaryPanel';
import { EmptyState, IconBtn, Spinner } from './ui';
import { hebrewNumber, masechtaForName, parseDafRef } from '../utils/talmud';
import { EXCLUDED_BOOK_NOTICE, isExcludedBook } from '../utils/bookFilter';
import { isReaderContextMenuShortcut, placeReaderContextMenu } from '../utils/readerContextMenu';
import { parseReaderLinkTarget, readerLinkCanOpenInBackground } from '../utils/readerLinks';
import { findTocLine } from '../utils/studyLinks';
import { findUniqueReaderCommentaryBook, groupReaderCommentaryLinks } from '../utils/readerCommentaryContextMenu';
import { groupReaderReferenceLinks } from '../utils/readerReferenceContextMenu';
import ReaderContextIconRow from './ReaderContextIconRow';
import { getReaderDirectLinkMenuItems } from '../utils/readerDirectLinkMenu';
import { getInitialReaderRange } from '../utils/readerPagination';
import { normalizeReaderNavigationHistory, recordReaderNavigation, travelReaderNavigation } from '../utils/readerNavigationHistory';
import { isBookmarkHighlightLine } from '../utils/bookmarkNavigation';
import { decorateReaderLineWithPersonalNotes, groupReaderPersonalNotes, parseReaderPersonalNoteHref, selectReaderPersonalNotesForPreview } from '../utils/readerPersonalNotes';
import ReaderNotePreview from './ReaderNotePreview';

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
  bookmarkTarget,
  inline,
  isHead,
  showRef,
  onSelect,
}: {
  line: ContentLine;
  html: string;
  selected: boolean;
  isMatch?: boolean;
  bookmarkTarget?: boolean;
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
      className={`cursor-text rounded transition-colors ${selected ? 'bg-primary/15' : ''} ${isMatch && !selected ? 'bg-primary/5' : ''} ${bookmarkTarget ? 'reader-bookmark-target' : ''} ${inline && !heading ? 'inline' : 'block'}`}
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
  selectionLine: number;
  text: string;
  from: number;
  to: number;
  linkUrl?: string;
}

interface ReaderNoteDraft {
  line: number;
  heRef: string;
  selectedText: string;
}

interface ReaderNotePreviewState {
  line: number;
  ids: string[];
  x: number;
  y: number;
}

function isPointInsideReaderSelection(range: Range, lineNode: HTMLElement, x: number, y: number) {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const caretRange = documentWithCaret.caretRangeFromPoint?.(x, y) ?? null;
  if (caretRange) return range.isPointInRange(caretRange.startContainer, caretRange.startOffset);
  const caretPosition = documentWithCaret.caretPositionFromPoint?.(x, y) ?? null;
  if (caretPosition) return range.isPointInRange(caretPosition.offsetNode, caretPosition.offset);
  try {
    return range.intersectsNode(lineNode);
  } catch {
    return false;
  }
}

function getReaderSelectionForContextMenu(root: HTMLElement, lineNode: HTMLElement, rangeOverride?: Range) {
  const selection = window.getSelection();
  const range = rangeOverride ?? (
    selection && !selection.isCollapsed && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null
  );
  if (!range) return null;
  if (!root.contains(range.commonAncestorContainer)) return null;
  try {
    if (!range.intersectsNode(lineNode)) return null;
  } catch {
    return null;
  }

  const text = range.toString().trim();
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
  const { settings, updateSettings, updateTab, addBookmark, saveNote, notes, openSearch, openBookByTitle, openBookInNewTab, openBookInBackground, saveHistory, library, libraryLoading, toast, openTzuratHaDaf } = useApp();
  const [lines, setLines] = useState<ContentLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [selMenu, setSelMenu] = useState<SelMenu | null>(null);
  const [contextMenu, setContextMenu] = useState<ReaderContextMenu | null>(null);
  const [commentaryMenuExpanded, setCommentaryMenuExpanded] = useState(false);
  const [commentaryMenuStatus, setCommentaryMenuStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [commentaryMenuItems, setCommentaryMenuItems] = useState<ReturnType<typeof groupReaderCommentaryLinks>>([]);
  const [referenceMenuExpanded, setReferenceMenuExpanded] = useState(false);
  const [referenceMenuItems, setReferenceMenuItems] = useState<ReturnType<typeof groupReaderReferenceLinks>>([]);
  const [noteDraft, setNoteDraft] = useState<ReaderNoteDraft | null>(null);
  const [noteText, setNoteText] = useState('');
  const [notePreview, setNotePreview] = useState<ReaderNotePreviewState | null>(null);
  const closeNotePreview = useCallback(() => setNotePreview(null), []);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookSearchAutoRun, setBookSearchAutoRun] = useState(false);
  const [topLine, setTopLine] = useState(tab.line);
  const navigationHistoryRef = useRef(normalizeReaderNavigationHistory(tab.navigationHistory));
  const currentLineRef = useRef(tab.line);
  const personalNotesByLine = useMemo(() => groupReaderPersonalNotes(notes, tab.bookId), [notes, tab.bookId]);
  const notePreviewNotes = useMemo(() => notePreview
    ? selectReaderPersonalNotesForPreview(personalNotesByLine.get(notePreview.line) ?? [], notePreview)
    : [], [personalNotesByLine, notePreview]);

  useEffect(() => {
    navigationHistoryRef.current = normalizeReaderNavigationHistory(tab.navigationHistory);
  }, [tab.id, tab.navigationHistory]);

  useEffect(() => {
    currentLineRef.current = tab.line;
  }, [tab.id, tab.line]);

  useEffect(() => {
    closeNotePreview();
  }, [tab.id, closeNotePreview]);
  const resolveReferenceBook = (item: (typeof referenceMenuItems)[number]) => {
    const books = library?.books ?? [];
    if (item.bookId != null) {
      return books.find((book) => String(book.id) === String(item.bookId)) ?? null;
    }
    return findUniqueReaderCommentaryBook(books, item.title);
  };
  const firstAvailableReferenceKey = referenceMenuItems.find((item) => {
    const book = resolveReferenceBook(item);
    return !libraryLoading && Boolean(book) && !isExcludedBook(book);
  })?.key;
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
  const commentaryMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const commentaryMenuFirstItemRef = useRef<HTMLButtonElement>(null);
  const referenceMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const referenceMenuFirstItemRef = useRef<HTMLButtonElement>(null);
  const focusReferenceMenuItemRef = useRef(false);
  const commentaryMenuRequestRef = useRef(0);
  const focusCommentaryMenuItemRef = useRef(false);
  const touchTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; line: number; linkUrl?: string } | null>(null);
  const selectionSnapshotRef = useRef<ReturnType<typeof getReaderSelectionForContextMenu> | null>(null);
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

  useEffect(() => {
    if (!contextMenu || !commentaryMenuExpanded || !focusCommentaryMenuItemRef.current || commentaryMenuStatus === 'loading') return;
    const frame = window.requestAnimationFrame(() => {
      commentaryMenuFirstItemRef.current?.focus();
      focusCommentaryMenuItemRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu, commentaryMenuExpanded, commentaryMenuStatus, commentaryMenuItems]);

  useEffect(() => {
    if (!contextMenu || !referenceMenuExpanded || !focusReferenceMenuItemRef.current || commentaryMenuStatus === 'loading') return;
    const frame = window.requestAnimationFrame(() => {
      referenceMenuFirstItemRef.current?.focus();
      focusReferenceMenuItemRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu, referenceMenuExpanded, commentaryMenuStatus, referenceMenuItems]);

  useEffect(() => {
    commentaryMenuRequestRef.current += 1;
    setContextMenu(null);
    setCommentaryMenuExpanded(false);
    setReferenceMenuExpanded(false);
    setCommentaryMenuStatus('idle');
    setCommentaryMenuItems([]);
    setReferenceMenuItems([]);
    setNoteDraft(null);
    setNoteText('');
    setBookSearchAutoRun(false);
  }, [tab.bookId]);

  useEffect(() => () => {
    if (touchTimerRef.current !== null) window.clearTimeout(touchTimerRef.current);
  }, []);
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
    const { start, end } = getInitialReaderRange(target);
    api
      .content(tab.bookId, start, end)
      .then((r) => {
        if (cancelled) return;
        setTotal(r.totalLines);
        if (r.totalLines) totalRef.current = r.totalLines;
        const safeTarget = r.totalLines > 0 ? Math.min(target, r.totalLines) : target;
        pending.current = { type: 'jump', line: safeTarget };
        setLines(r.lines);
        if (tab.jump) setSelected(safeTarget);
        const last = r.lines[r.lines.length - 1]?.lineIndex ?? 0;
        if ((r.totalLines > 0 && last >= r.totalLines) || (!r.totalLines && r.lines.length < end - start + 1)) {
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
      currentLineRef.current = p.line;
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
      if (found >= 0) {
        const nextLine = Number(nodes[found].dataset.line);
        currentLineRef.current = nextLine;
        setTopLine(nextLine);
      }
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
      const navigationHistory = recordReaderNavigation(
        navigationHistoryRef.current,
        currentLineRef.current,
        line,
      );
      navigationHistoryRef.current = navigationHistory;
      currentLineRef.current = line;
      updateTab(tab.id, {
        line,
        jump: { line, n: Date.now() },
        navigationHistory,
        ...(hlText !== undefined ? { highlight: { text: hlText } } : {}),
      });
      if (hlText === undefined && window.innerWidth < 900) setSidebarOpen(false);
    },
    [tab.id, updateTab],
  );

  const navigateHistory = useCallback((direction: 'back' | 'forward') => {
    const result = travelReaderNavigation(
      navigationHistoryRef.current,
      currentLineRef.current,
      direction,
    );
    if (!result) return;
    navigationHistoryRef.current = result.history;
    currentLineRef.current = result.line;
    setSelected(null);
    updateTab(tab.id, {
      line: result.line,
      jump: { line: result.line, n: Date.now() },
      navigationHistory: result.history,
    });
    if (window.innerWidth < 900) setSidebarOpen(false);
  }, [tab.id, updateTab]);

  const openBookSearch = (query = '', autoRun = false) => {
    setBookSearchQuery(query);
    setBookSearchAutoRun(autoRun);
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
    const plain = `${selection.text}\n${href}`;
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
  const contextMenuLine = contextMenu
    ? lines.find((line) => line.lineIndex === contextMenu.line)
    : undefined;
  const directLinkMenuItems = contextMenu
    ? getReaderDirectLinkMenuItems({
        line: contextMenu.line,
        sectionWordCount: stripTags(contextMenuLine?.content || '')
          .trim()
          .split(/\s+/u)
          .filter(Boolean).length,
        selection: contextMenu.text.trim()
          ? {
              text: contextMenu.text,
              line: contextMenu.selectionLine,
              from: contextMenu.from,
              to: contextMenu.to,
            }
          : null,
      })
    : [];

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

  const openReaderLink = async (href: string, inBackground = false) => {
    const target = parseReaderLinkTarget(href);
    if (!target) {
      toast('הקישור אינו נתמך');
      return;
    }

    if (target.kind === 'external') {
      if (/^mailto:/iu.test(target.href)) {
        window.location.assign(target.href);
        return;
      }
      const opened = window.open(target.href, '_blank', 'noopener,noreferrer');
      if (!opened) toast('הדפדפן חסם את פתיחת הקישור');
      return;
    }

    if (target.kind === 'anchor') {
      if (inBackground) return;
      const root = scRef.current;
      const anchorId = target.headings.join('#');
      const anchor = root
        ? Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === anchorId)
        : undefined;
      if (anchor) {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        anchor.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }
      let targetLine: number | undefined;
      if (toc) {
        for (const heading of [...target.headings].reverse()) {
          targetLine = findTocLine(toc, [heading]);
          if (targetLine !== undefined) break;
        }
      }
      if (targetLine !== undefined) {
        goTo(targetLine);
        return;
      }
      toast('היעד הפנימי לא נמצא בספר');
      return;
    }

    if (!library) {
      toast(libraryLoading ? 'הספרייה עדיין נטענת, נסה שוב בעוד רגע' : 'הספרייה אינה זמינה');
      return;
    }

    let targetBook: BookItem | undefined;
    let targetLine = 1;

    if (target.kind === 'book') {
      const matches = library.books.filter((candidate) =>
        candidate.title.trim() === target.title.trim() && !isExcludedBook(candidate),
      );
      if (matches.length !== 1) {
        toast(matches.length > 1
          ? 'הקישור אינו חד-משמעי: נמצאו כמה ספרים בעלי אותו שם'
          : 'הספר "' + target.title + '" לא נמצא בספרייה');
        return;
      }
      targetBook = matches[0];
      if (target.headings.length > 0) {
        try {
          const targetToc = await api.toc(targetBook.id);
          let headingLine: number | undefined;
          for (const heading of [...target.headings].reverse()) {
            headingLine = findTocLine(targetToc, [heading]);
            if (headingLine !== undefined) break;
          }
          if (headingLine === undefined) {
            toast('לא נמצאה הכותרת המבוקשת; הספר ייפתח בתחילתו');
          } else {
            targetLine = headingLine;
          }
        } catch {
          toast('לא ניתן לטעון את תוכן העניינים; הספר ייפתח בתחילתו');
        }
      }
    } else if (target.kind === 'inline-book') {
      const matches = library.books.filter((candidate) =>
        candidate.title.trim() === target.title.trim() && !isExcludedBook(candidate),
      );
      if (matches.length !== 1) {
        toast(matches.length > 1
          ? 'הקישור אינו חד-משמעי: נמצאו כמה ספרים בעלי אותו שם'
          : 'הספר "' + target.title + '" לא נמצא בספרייה');
        return;
      }
      targetBook = matches[0];
      targetLine = target.line;
    } else if (target.kind === 'book-id') {
      targetBook = library.books.find((candidate) => String(candidate.id) === target.id);
      targetLine = target.line ?? 1;
    }

    if (!targetBook || isExcludedBook(targetBook)) {
      toast(targetBook ? EXCLUDED_BOOK_NOTICE : 'ספר היעד של הקישור אינו זמין בספרייה');
      return;
    }

    const bookRef = {
      id: targetBook.id,
      title: targetBook.title,
      categoryPath: targetBook.categoryPath,
    };
    if (inBackground) openBookInBackground(bookRef, targetLine, undefined, { insertAdjacent: true });
    else openBookInNewTab(bookRef, targetLine, undefined, { textOnly: true, insertAdjacent: true });
  };

  const handleReaderLinkClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    const href = anchor.getAttribute('href');
    if (!href) return;

    const noteTarget = parseReaderPersonalNoteHref(href);
    if (noteTarget) {
      event.stopPropagation();
      event.preventDefault();
      const matchingNotes = selectReaderPersonalNotesForPreview(
        personalNotesByLine.get(noteTarget.line) ?? [],
        noteTarget,
      );
      if (!matchingNotes.length) {
        toast('ההערה האישית כבר אינה זמינה');
        return;
      }
      setNotePreview({
        line: noteTarget.line,
        ids: matchingNotes.map((note) => note.id),
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    if (!parseReaderLinkTarget(href)) return;
    const linkTarget = parseReaderLinkTarget(href);
    if (!linkTarget) return;
    event.stopPropagation();
    if (linkTarget.kind === 'external') return;

    event.preventDefault();
    void openReaderLink(href);
  };

  const openReaderContextMenuAt = (
    x: number,
    y: number,
    lineNode: HTMLElement,
    selectionOverride?: ReturnType<typeof getReaderSelectionForContextMenu> | null,
    linkUrl?: string,
  ) => {
    const clickedLine = Number(lineNode.dataset.line);
    if (!Number.isInteger(clickedLine) || clickedLine < 1) return;
    const selection = selectionOverride === undefined
      ? (scRef.current ? getReaderSelectionForContextMenu(scRef.current, lineNode) : null)
      : selectionOverride;
    commentaryMenuRequestRef.current += 1;
    setCommentaryMenuExpanded(false);
    setReferenceMenuExpanded(false);
    setCommentaryMenuStatus('idle');
    setCommentaryMenuItems([]);
    setReferenceMenuItems([]);
    focusCommentaryMenuItemRef.current = false;
    focusReferenceMenuItemRef.current = false;
    setSelMenu(null);
    setContextMenu({
      x,
      y,
      line: clickedLine,
      selectionLine: selection?.line ?? clickedLine,
      text: selection?.text ?? '',
      from: selection?.from ?? 0,
      to: selection?.to ?? 0,
      ...(linkUrl ? { linkUrl } : {}),
    });
  };

  const handleReaderMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) {
      selectionSnapshotRef.current = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const lineNode = target?.closest<HTMLElement>('[data-line]');
    const root = scRef.current;
    const selection = window.getSelection();
    if (!lineNode || !root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      selectionSnapshotRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const pointerIsInsideSelection = isPointInsideReaderSelection(
      range,
      lineNode,
      event.clientX,
      event.clientY,
    );
    selectionSnapshotRef.current = pointerIsInsideSelection
      ? getReaderSelectionForContextMenu(root, lineNode, range)
      : null;
  };

  const handleReaderContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const lineNode = target?.closest<HTMLElement>('[data-line]');
    if (!lineNode) return;
    const anchor = target?.closest<HTMLAnchorElement>('a[href]');
    const linkUrl = anchor && lineNode.contains(anchor) ? anchor.getAttribute('href') || undefined : undefined;
    event.preventDefault();
    const selectionSnapshot = selectionSnapshotRef.current;
    clearReaderTouchTimer();
    openReaderContextMenuAt(event.clientX, event.clientY, lineNode, selectionSnapshot, linkUrl);
  };

  const handleReaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isReaderContextMenuShortcut(event.key, event.shiftKey)) return;
    event.preventDefault();
    const selection = window.getSelection();
    const startElement = selection && !selection.isCollapsed && selection.rangeCount > 0
      ? (selection.getRangeAt(0).startContainer.nodeType === 1
        ? selection.getRangeAt(0).startContainer as Element
        : selection.getRangeAt(0).startContainer.parentElement)
      : null;
    const eventTarget = event.target instanceof Element ? event.target : null;
    const eventLine = Number(eventTarget?.closest<HTMLElement>('[data-line]')?.dataset.line);
    const selectionLine = Number(startElement?.closest<HTMLElement>('[data-line]')?.dataset.line);
    const lineIndex = Number.isInteger(eventLine) && eventLine > 0
      ? eventLine
      : Number.isInteger(selectionLine) && selectionLine > 0
        ? selectionLine
        : selected ?? topLine;
    const lineNode = scRef.current?.querySelector<HTMLElement>('[data-line="' + lineIndex + '"]');
    if (!lineNode) return;
    const activeLink = eventTarget?.closest<HTMLAnchorElement>('a[href]');
    const linkUrl = activeLink && lineNode.contains(activeLink) ? activeLink.getAttribute('href') || undefined : undefined;
    const rect = lineNode.getBoundingClientRect();
    openReaderContextMenuAt(rect.left + Math.min(rect.width / 2, 180), rect.bottom, lineNode, undefined, linkUrl);
  };

  const clearReaderTouchTimer = () => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    touchStartRef.current = null;
    selectionSnapshotRef.current = null;
  };

  const handleReaderTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const target = event.target instanceof Element ? event.target : null;
    const lineNode = target?.closest<HTMLElement>('[data-line]');
    const line = Number(lineNode?.dataset.line);
    if (!touch || event.touches.length !== 1 || !lineNode || !Number.isInteger(line) || line < 1) return;
    clearReaderTouchTimer();
    const touchAnchor = target?.closest<HTMLAnchorElement>('a[href]');
    const linkUrl = touchAnchor && lineNode.contains(touchAnchor) ? touchAnchor.getAttribute('href') || undefined : undefined;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, line, ...(linkUrl ? { linkUrl } : {}) };

    const root = scRef.current;
    const selection = window.getSelection();
    if (root && selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (isPointInsideReaderSelection(range, lineNode, touch.clientX, touch.clientY)) {
        selectionSnapshotRef.current = getReaderSelectionForContextMenu(root, lineNode, range);
      }
    }

    touchTimerRef.current = window.setTimeout(() => {
      const point = touchStartRef.current;
      const selectionSnapshot = selectionSnapshotRef.current;
      touchTimerRef.current = null;
      selectionSnapshotRef.current = null;
      if (!point) return;
      const node = scRef.current?.querySelector<HTMLElement>('[data-line="' + point.line + '"]');
      if (node) openReaderContextMenuAt(point.x, point.y, node, selectionSnapshot, point.linkUrl);
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

  const loadReaderCommentaryLinks = async (line: number) => {
    const requestId = ++commentaryMenuRequestRef.current;
    setCommentaryMenuStatus('loading');
    setCommentaryMenuItems([]);
    setReferenceMenuItems([]);
    try {
      const response = await api.links(tab.bookId, line);
      if (requestId !== commentaryMenuRequestRef.current) return;
      setCommentaryMenuItems(groupReaderCommentaryLinks(response.links ?? []));
      setReferenceMenuItems(groupReaderReferenceLinks(response.references ?? []));
      setCommentaryMenuStatus('loaded');
    } catch {
      if (requestId !== commentaryMenuRequestRef.current) return;
      setCommentaryMenuStatus('error');
    }
  };

  const toggleReaderCommentaryMenu = () => {
    if (!contextMenu) return;
    if (commentaryMenuExpanded) {
      setCommentaryMenuExpanded(false);
      return;
    }
    setReferenceMenuExpanded(false);
    setCommentaryMenuExpanded(true);
    if (commentaryMenuStatus === 'idle' || commentaryMenuStatus === 'error') {
      void loadReaderCommentaryLinks(contextMenu.line);
    }
  };

  const closeReaderCommentaryMenu = () => {
    setCommentaryMenuExpanded(false);
    window.requestAnimationFrame(() => commentaryMenuTriggerRef.current?.focus());
  };

  const toggleReaderReferenceMenu = () => {
    if (!contextMenu) return;
    if (referenceMenuExpanded) {
      setReferenceMenuExpanded(false);
      return;
    }
    setCommentaryMenuExpanded(false);
    setReferenceMenuExpanded(true);
    if (commentaryMenuStatus === 'idle' || commentaryMenuStatus === 'error') {
      void loadReaderCommentaryLinks(contextMenu.line);
    }
  };

  const closeReaderReferenceMenu = () => {
    setReferenceMenuExpanded(false);
    window.requestAnimationFrame(() => referenceMenuTriggerRef.current?.focus());
  };

  const closeReaderContextMenu = () => {
    commentaryMenuRequestRef.current += 1;
    setCommentaryMenuExpanded(false);
    setReferenceMenuExpanded(false);
    setCommentaryMenuStatus('idle');
    setCommentaryMenuItems([]);
    setReferenceMenuItems([]);
    setContextMenu(null);
    window.requestAnimationFrame(() => scRef.current?.focus({ preventScroll: true }));
  };

  const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (commentaryMenuExpanded) {
        closeReaderCommentaryMenu();
        return;
      }
      if (referenceMenuExpanded) {
        closeReaderReferenceMenu();
        return;
      }
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
    goTo(next);
  };
  const processed = useMemo(
    () =>
      lines.map((l) => {
        let html = processHtml(l.content, opts);
        if (hl?.from !== undefined && hl.line === l.lineIndex) html = highlightWords(html, hl.from, hl.to ?? hl.from);
        else if (hl?.text && (hl.line === undefined || hl.line === l.lineIndex)) html = highlight(html, hl.text);
        return decorateReaderLineWithPersonalNotes(
          html,
          l.lineIndex - 1,
          personalNotesByLine.get(l.lineIndex - 1) ?? [],
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, optsKey, hl?.text, hl?.line, hl?.from, hl?.to, personalNotesByLine],
  );

  const atStart = lines[0]?.lineIndex <= 1;
  const atEnd = endReached || (lines.length > 0 && total > 0 && lines[lines.length - 1].lineIndex >= total);
  const readerNavigation = normalizeReaderNavigationHistory(tab.navigationHistory);
  const backLine = readerNavigation.back[readerNavigation.back.length - 1];
  const forwardLine = readerNavigation.forward[readerNavigation.forward.length - 1];
  const navigationLabel = (line: number) =>
    lines.find((item) => item.lineIndex === line)?.heRef || `שורה ${line}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* toolbar */}
      <div className="flex items-center gap-1 border-b border-outline-variant bg-surface px-2 py-1.5">
        <IconBtn title={sidebarOpen ? 'הסתר ניווט' : 'הצג ניווט'} onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
        </IconBtn>
        <button
          type="button"
          disabled={backLine === undefined}
          onClick={() => navigateHistory('back')}
          title={backLine === undefined ? 'אין מיקום קודם' : `חזרה אל ${navigationLabel(backLine)}`}
          aria-label={backLine === undefined ? 'אין מיקום קודם' : `חזרה אל ${navigationLabel(backLine)}`}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35 ${backLine === undefined ? '' : 'text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'}`}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          disabled={forwardLine === undefined}
          onClick={() => navigateHistory('forward')}
          title={forwardLine === undefined ? 'אין מיקום קדימה' : `קדימה אל ${navigationLabel(forwardLine)}`}
          aria-label={forwardLine === undefined ? 'אין מיקום קדימה' : `קדימה אל ${navigationLabel(forwardLine)}`}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-35 ${forwardLine === undefined ? '' : 'text-on-variant hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'}`}
        >
          <ArrowRight size={18} />
        </button>
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
                searchAutoRun={bookSearchAutoRun}
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
            onScroll={() => { onScroll(); setContextMenu(null); closeNotePreview(); }}
            onCopy={onCopy}
            onMouseDownCapture={handleReaderMouseDownCapture}
            onContextMenu={handleReaderContextMenu}
            onClickCapture={handleReaderLinkClick}
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
                    key={isBookmarkHighlightLine(hl, l.lineIndex) ? `${l.lineIndex}-${hl?.flashId ?? 0}` : l.lineIndex}
                    line={l}
                    html={processed[i]}
                    selected={selected === l.lineIndex}
                    isMatch={matchSet.has(l.lineIndex)}
                    bookmarkTarget={isBookmarkHighlightLine(hl, l.lineIndex)}
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
            className="fixed z-[111] flex w-max min-w-[150px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] box-border flex-col overflow-y-auto rounded-lg bg-surface-2 py-2 text-sm text-on-surface shadow-md"
            style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 'min(150px, calc(100vw - 16px))' }}
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={handleContextMenuKeyDown}
          >
            <ReaderContextIconRow
              firstItemRef={firstContextMenuItemRef}
              hasSelection={Boolean(contextMenu.text.trim())}
              onSearchAllBooks={() => {
                setContextMenu(null);
                openSearch(contextMenu.text || undefined);
              }}
              onCopySelection={() => void copy(contextMenu.text, 'הטקסט הועתק')}
              onAddNote={() => {
                const line = lines.find((item) => item.lineIndex === contextMenu.line);
                setNoteDraft({
                  line: contextMenu.line,
                  heRef: line?.heRef || '',
                  selectedText: contextMenu.text,
                });
                setNoteText('');
                setContextMenu(null);
              }}
              directLinkItems={directLinkMenuItems}
              onCopyDirectLink={(item) => {
                const url = buildDeepLink({
                  book: String(tab.bookId),
                  title,
                  line: item.line,
                  ...(item.from !== undefined && item.to !== undefined
                    ? { from: item.from, to: item.to }
                    : {}),
                });
                const message = item.id === 'section'
                  ? 'הקישור למקטע הועתק'
                  : item.id === 'section-mark'
                    ? 'הקישור עם הדגשת המקטע הועתק'
                    : 'הקישור עם הדגשת הטקסט הועתק';
                void copy(url, message);
              }}
            />
            {contextMenu.linkUrl && parseReaderLinkTarget(contextMenu.linkUrl) && (
              <>
                <div role="separator" className="my-[3.5px] border-t border-outline-variant" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                  onClick={() => {
                    const href = contextMenu.linkUrl!;
                    closeReaderContextMenu();
                    void openReaderLink(href);
                  }}
                >
                  <BookOpen size={18} /> פתח קישור
                </button>
                {readerLinkCanOpenInBackground(parseReaderLinkTarget(contextMenu.linkUrl)) && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                    onClick={() => {
                      const href = contextMenu.linkUrl!;
                      closeReaderContextMenu();
                      void openReaderLink(href, true);
                    }}
                  >
                    <BookOpen size={18} /> פתח קישור בכרטיסייה חדשה
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                  onClick={() => void copy(contextMenu.linkUrl!, 'כתובת הקישור הועתקה')}
                >
                  <Copy size={18} /> העתק כתובת קישור
                </button>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none motion-reduce:transition-none"
              onClick={() => {
                const line = lines.find((item) => item.lineIndex === contextMenu.line);
                void copy(stripTags(line?.content || '').trim(), 'הפסקה הועתקה');
              }}
            >
              <Copy size={18} /> העתק את כל הפסקה
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!contextMenu.text}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void copyTextAsLink({
                text: contextMenu.text,
                line: contextMenu.selectionLine,
                from: contextMenu.from,
                to: contextMenu.to,
              })}
            >
              <Link2 size={18} /> העתק טקסט כקישור
            </button>

            <div role="separator" className="my-[3.5px] border-t border-outline-variant" />


            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                openBookSearch(contextMenu.text, Boolean(contextMenu.text.trim()));
              }}
            >
              <TextSearch size={18} /> חיפוש בספר
            </button>

            <div role="separator" className="my-[3.5px] border-t border-outline-variant" />

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onClick={() => {
                setContextMenu(null);
                addMarkAt(contextMenu.line);
              }}
            >
              <Bookmark size={18} /> הוסף סימניה לקטע זה
            </button>

            <button
              ref={commentaryMenuTriggerRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={commentaryMenuExpanded}
              aria-controls={`reader-commentary-context-submenu-${tab.id}`}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                if (commentaryMenuExpanded) {
                  closeReaderCommentaryMenu();
                  return;
                }
                focusCommentaryMenuItemRef.current = true;
                toggleReaderCommentaryMenu();
              }}
              onClick={toggleReaderCommentaryMenu}
            >
              <MessageSquareText size={18} />
              <span className="flex-1">מפרשים על שורה זו</span>
              <ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${commentaryMenuExpanded ? 'rotate-180' : ''}`} />
            </button>
            {commentaryMenuExpanded && (
              <div
                id={`reader-commentary-context-submenu-${tab.id}`}
                role="group"
                aria-label="מפרשים על שורה זו"
                dir="rtl"
                className="mr-3 mt-1 flex flex-col border-r border-outline-variant pr-2"
              >
                <button
                  ref={commentaryMenuFirstItemRef}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                  onClick={() => {
                    setContextMenu(null);
                    openCommentaryForLine(contextMenu.line);
                  }}
                >
                  <PanelRightOpen size={18} /> הצג את חלונית המפרשים
                </button>
                {commentaryMenuStatus === 'loading' && (
                  <div role="presentation" aria-live="polite" className="px-3 py-2 text-xs text-on-variant">
                    טוען מפרשים…
                  </div>
                )}
                {commentaryMenuStatus === 'error' && (
                  <>
                    <div role="presentation" aria-live="polite" className="px-3 py-2 text-xs text-error">
                      לא ניתן לטעון את המפרשים לשורה זו
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                      onClick={() => void loadReaderCommentaryLinks(contextMenu.line)}
                    >
                      נסה שוב
                    </button>
                  </>
                )}
                {commentaryMenuStatus === 'loaded' && commentaryMenuItems.length === 0 && (
                  <div role="presentation" className="px-3 py-2 text-xs text-on-variant">
                    אין מפרשים לשורה זו
                  </div>
                )}
                {commentaryMenuStatus === 'loaded' && commentaryMenuItems.map((item) => {
                  const matches = (library?.books ?? []).filter((book) => book.title.trim() === item.title);
                  const targetBook = matches.length === 1 ? matches[0] : null;
                  const unavailableReason = libraryLoading
                    ? 'טוען את פרטי הספרייה'
                    : !targetBook
                      ? 'לא ניתן לפתוח: שם הספר אינו ייחודי בקטלוג'
                      : isExcludedBook(targetBook)
                        ? EXCLUDED_BOOK_NOTICE
                        : '';
                  return (
                    <button
                      key={item.title}
                      type="button"
                      role="menuitem"
                      disabled={Boolean(unavailableReason)}
                      title={unavailableReason || item.title}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        setContextMenu(null);
                        openBookByTitle(item.title, item.line);
                      }}
                    >
                      <BookOpen size={18} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.count > 1 && <span className="text-xs text-on-variant">×{item.count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              ref={referenceMenuTriggerRef}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={referenceMenuExpanded}
              aria-controls={'reader-reference-context-submenu-' + tab.id}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                if (referenceMenuExpanded) {
                  closeReaderReferenceMenu();
                  return;
                }
                focusReferenceMenuItemRef.current = true;
                toggleReaderReferenceMenu();
              }}
              onClick={toggleReaderReferenceMenu}
            >
              <Link2 size={18} />
              <span className="flex-1">קישורים</span>
              <ChevronDown size={14} className={'transition-transform motion-reduce:transition-none ' + (referenceMenuExpanded ? 'rotate-180' : '')} />
            </button>
            {referenceMenuExpanded && (
              <div
                id={'reader-reference-context-submenu-' + tab.id}
                role="group"
                aria-label="קישורים לשורה זו"
                dir="rtl"
                className="mr-3 mt-1 flex flex-col border-r border-outline-variant pr-2"
              >
                {commentaryMenuStatus === 'loading' && (
                  <div role="presentation" aria-live="polite" className="px-3 py-2 text-xs text-on-variant">
                    טוען קישורים…
                  </div>
                )}
                {commentaryMenuStatus === 'error' && (
                  <>
                    <div role="presentation" aria-live="polite" className="px-3 py-2 text-xs text-error">
                      לא ניתן לטעון קישורים לשורה זו
                    </div>
                    <button
                      ref={referenceMenuFirstItemRef}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
                      onClick={() => void loadReaderCommentaryLinks(contextMenu.line)}
                    >
                      נסה שוב
                    </button>
                  </>
                )}
                {commentaryMenuStatus === 'loaded' && referenceMenuItems.length === 0 && (
                  <div role="presentation" className="px-3 py-2 text-xs text-on-variant">
                    אין קישורים לקטע זה
                  </div>
                )}
                {commentaryMenuStatus === 'loaded' && referenceMenuItems.map((item) => {
                  const targetBook = resolveReferenceBook(item);
                  const unavailableReason = libraryLoading
                    ? 'טוען את פרטי הספרייה'
                    : !targetBook
                      ? 'לא ניתן לפתוח: שם הספר אינו ייחודי בקטלוג או שהספר אינו זמין'
                      : isExcludedBook(targetBook)
                        ? EXCLUDED_BOOK_NOTICE
                        : '';
                  const referenceLabel = item.reference || ('שורה ' + item.line);
                  return (
                    <button
                      key={item.key}
                      ref={item.key === firstAvailableReferenceKey ? referenceMenuFirstItemRef : undefined}
                      type="button"
                      role="menuitem"
                      disabled={Boolean(unavailableReason)}
                      title={unavailableReason || item.preview || item.title}
                      aria-label={item.title + ', ' + item.categoryLabel + ', ' + referenceLabel}
                      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-right hover:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        if (!targetBook || unavailableReason) return;
                        setContextMenu(null);
                        setCommentaryMenuExpanded(false);
                        setReferenceMenuExpanded(false);
                        openBookInNewTab(targetBook, item.line);
                      }}
                    >
                      <Link2 size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        <span className="block text-xs text-on-variant">
                          {item.categoryLabel} · {referenceLabel}
                        </span>
                        {item.preview && (
                          <span className="mt-0.5 block line-clamp-2 text-xs text-on-variant">
                            {item.preview}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {notePreview && notePreviewNotes.length > 0 && (
        <ReaderNotePreview
          notes={notePreviewNotes}
          lineLabel={lines.find((line) => line.lineIndex === notePreview.line + 1)?.heRef || `שורה ${notePreview.line + 1}`}
          position={{ x: notePreview.x, y: notePreview.y }}
          onClose={closeNotePreview}
        />
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
