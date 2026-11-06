import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CatalogData, BookItem, ReaderSettings, TocNode } from '../types/otzaria';
import { getBookToc } from '../services/api';
import { sysLogger } from '../services/logger';
import { Search, Compass, BookOpen, ArrowRight, CornerDownLeft, Loader2, ListTree } from 'lucide-react';
import { buildOtzariaCatalogueOrder } from '../utils/catalogueOrder';

import { ORDERED_TOP_CATEGORIES } from '../utils/catalogueOrder';

interface FindRefViewProps {
  catalog: CatalogData | null;
  settings?: ReaderSettings;
  onOpenBook: (bookId: number | string, bookTitle: string, lineIndex?: number) => void;
}

const CANONICAL_TANACH_BOOK_ORDER: Record<string, number> = {
  'בראשית': 1, 'שמות': 2, 'ויקרא': 3, 'במדבר': 4, 'דברים': 5,
  'יהושע': 6, 'שופטים': 7, 'שמואל א': 8, 'שמואל ב': 9, 'שמואל': 8,
  'מלכים א': 10, 'מלכים ב': 11, 'מלכים': 10,
  'ישעיהו': 12, 'ישעיה': 12, 'ירמיהו': 13, 'ירמיה': 13, 'יחזקאל': 14,
  'תרי עשר': 15, 'הושע': 15, 'יואל': 16, 'עמוס': 17, 'עובדיה': 18,
  'יונה': 19, 'מיכה': 20, 'נחום': 21, 'חבקוק': 22, 'צפניה': 23,
  'חגי': 24, 'זכריה': 25, 'מלאכי': 26,
  'תהילים': 27, 'תהלים': 27, 'משלי': 28, 'איוב': 29,
  'שיר השירים': 30, 'רות': 31, 'איכה': 32, 'קהלת': 33, 'אסתר': 34,
  'דניאל': 35, 'עזרא': 36, 'נחמיה': 37, 'דברי הימים א': 38, 'דברי הימים ב': 39, 'דברי הימים': 38
};

function normalizeHebrew(s?: string): string {
  if (!s) return '';
  return s
    .replace(/[\u05F4״"\']/g, '"')
    .replace(/[\u05F3׳]/g, "'")
    .trim();
}

function computeEraRank(book: BookItem): number {
  const cat = normalizeHebrew(book.categoryPath);
  const title = normalizeHebrew(book.title);
  const ord = typeof book.order === 'number' && !isNaN(book.order) && book.order >= 0 ? book.order : 500;

  // 1. Tanach foundational books
  if (cat.startsWith('תנ"ך') || cat.startsWith('תנך')) {
    const isComm = cat.includes('מפרש') || cat.includes('אחרונים') || cat.includes('ראשונים') || title.includes(' על ');
    if (!isComm) {
      const tClean = title.replace(/^(ספר|חומש|תנ"ך|תורה)\s*/, '').trim();
      const tIdx = CANONICAL_TANACH_BOOK_ORDER[tClean] || CANONICAL_TANACH_BOOK_ORDER[title];
      if (tIdx) return 100 + tIdx;
      return 200 + ord;
    }
    // Commentaries on Tanach - placed AFTER foundational Shas and Halacha
    if (cat.includes('ראשונים')) return 10000 + ord;
    return 11000 + ord;
  }

  // 2. Mishnah foundational
  if (cat.startsWith('משנה')) {
    const isComm = cat.includes('מפרש') || title.includes(' על ');
    if (!isComm) return 1000 + ord;
    return 12000 + ord;
  }

  // 3. Tosefta
  if (cat.startsWith('תוספתא')) return 1500 + ord;

  // 4. Talmud Bavli foundational (Berachot, Shabbat, etc. - BEFORE commentaries)
  if (cat.startsWith('תלמוד בבלי') || cat.startsWith('בבלי') || cat.startsWith('גמרא')) {
    const isComm = cat.includes('מפרש') || title.includes(' על ') || title.includes('חידושי') || title.includes('תוספות') || title.includes('רש"י');
    if (!isComm) return 2000 + ord;
    if (cat.includes('ראשונים')) return 13000 + ord;
    return 14000 + ord;
  }

  // 5. Talmud Yerushalmi foundational
  if (cat.startsWith('תלמוד ירושלמי') || cat.startsWith('ירושלמי')) return 3000 + ord;

  // 6. Midrash
  if (cat.startsWith('מדרש')) return 3500 + ord;

  // 7. Kabbalah & Zohar
  if (cat.startsWith('קבלה') || cat.startsWith('זהר') || cat.startsWith('זוהר')) return 4000 + ord;

  // 8. Halacha foundational (Rambam, Tur, Shulchan Aruch)
  if (cat.startsWith('הלכה') || cat.startsWith('רמב"ם') || cat.startsWith('טור') || cat.startsWith('שולחן ערוך')) {
    if (cat.includes('משנה תורה') && !cat.includes('מפרש') && !title.includes(' על ')) return 5000 + ord;
    if (cat.includes('טור') && !cat.includes('מפרש')) return 5500 + ord;
    if (cat.includes('שולחן ערוך') && !cat.includes('מפרש') && !cat.includes('נושאי')) return 6000 + ord;
    if (cat.includes('מפרש') && (cat.includes('רמב"ם') || cat.includes('משנה תורה'))) return 15000 + ord;
    return 16000 + ord;
  }

  // 9. Shut
  if (cat.startsWith('שו"ת') || cat.startsWith('שות')) return 17000 + ord;

  // 10. Machshava, Musar, Chassidus
  if (cat.startsWith('מחשב') || cat.startsWith('מוסר') || cat.startsWith('חסידות')) return 18000 + ord;

  return 25000 + ord;
}

/**
 * Helper to recursively flatten TocNodes for quick filtering
 */
function flattenTocWithLineIndex(nodes: TocNode[], parentPath?: string): Array<TocNode & { parentPath?: string }> {
  let result: Array<TocNode & { parentPath?: string }> = [];
  for (const node of nodes) {
    const idx = node.lineIndex ?? node.index;
    const currentPath = parentPath
      ? `${parentPath} ← ${node.title}`
      : (node.partCategory && node.partCategory !== node.title ? `${node.partCategory} ← ${node.title}` : node.title);

    if (idx && idx > 0) {
      result.push({
        ...node,
        parentPath: parentPath || (node.partCategory !== node.title ? node.partCategory : undefined)
      });
    }
    if (node.children && node.children.length > 0) {
      result = result.concat(flattenTocWithLineIndex(node.children, currentPath));
    }
  }
  return result;
}

/**
 * Structures flat or mixed TOC nodes into hierarchical Chapters/Simanim -> Sections/Seifim specifically for FindRefView.
 * Ensures that books like Hafetz Haim or books with Siman + Seif are neatly partitioned into categories.
 */
function structureTocForFindRef(rawToc: TocNode[]): TocNode[] {
  if (!rawToc || rawToc.length === 0) return [];

  // If already hierarchical with children, return as is
  const hasExistingChildren = rawToc.some(n => n.children && n.children.length > 0);
  if (hasExistingChildren) return rawToc;

  // 1. Check for compound titles like "סימן א סעיף א" or "סימן א: סעיף א"
  const compoundPattern = /^(סימן\s+[^\s,:-]+|פרק\s+[^\s,:-]+|כלל\s+[^\s,:-]+)[\s,:-]+(סעיף\s+.*|אות\s+.*|הלכה\s+.*|פסוק\s+.*|ס\"ק\s+.*)$/;
  const compoundMatches = rawToc.filter(n => compoundPattern.test(n.title.trim()));
  if (compoundMatches.length >= 3 && compoundMatches.length / rawToc.length >= 0.2) {
    const groups = new Map<string, TocNode>();
    for (const n of rawToc) {
      const m = n.title.trim().match(compoundPattern);
      if (m) {
        const parentTitle = m[1];
        const childTitle = m[2];
        if (!groups.has(parentTitle)) {
          groups.set(parentTitle, {
            title: parentTitle,
            index: n.index,
            lineIndex: n.lineIndex ?? n.index,
            level: 1,
            children: []
          });
        }
        groups.get(parentTitle)!.children!.push({
          ...n,
          title: childTitle,
          lineIndex: n.lineIndex ?? n.index
        });
      } else {
        groups.set(n.title, {
          ...n,
          lineIndex: n.lineIndex ?? n.index,
          children: []
        });
      }
    }
    return Array.from(groups.values());
  }

  // 2. Multi-level TOC (e.g. Hafetz Haim with 3 levels: 1=Part, 2=Klal/Chapter, 3=Seif)
  const levelSet = new Set(rawToc.map(n => n.level).filter((l): l is number => typeof l === 'number'));
  if (levelSet.size >= 2) {
    const sortedLevels = Array.from(levelSet).sort((a, b) => a - b);

    if (sortedLevels.length >= 3) {
      const topLevel = sortedLevels[0]; // e.g. 1 (Book Parts / Headers)
      const midLevel = sortedLevels[1]; // e.g. 2 (Chapters / Klalim / Simanim)

      const result: TocNode[] = [];
      let currentPartTitle = '';
      let currentChapter: TocNode | null = null;

      for (let i = 0; i < rawToc.length; i++) {
        const node = rawToc[i];
        const lvl = node.level ?? topLevel;

        if (lvl === topLevel) {
          currentPartTitle = node.title;
          const nextNode = rawToc[i + 1];
          const isContainerHeader = nextNode && (nextNode.level ?? topLevel) === midLevel;

          if (!isContainerHeader) {
            // Standalone top-level item (e.g. 'הקדמה', 'תשובות')
            currentChapter = {
              ...node,
              lineIndex: node.lineIndex ?? node.index,
              partCategory: currentPartTitle,
              children: []
            };
            result.push(currentChapter);
          } else {
            currentChapter = null;
          }
        } else if (lvl === midLevel) {
          currentChapter = {
            ...node,
            lineIndex: node.lineIndex ?? node.index,
            partCategory: currentPartTitle,
            children: []
          };
          result.push(currentChapter);
        } else {
          // Level 3 or deeper (Seifim / Sub-sections)
          if (currentChapter) {
            if (!currentChapter.children) currentChapter.children = [];
            currentChapter.children.push({
              ...node,
              lineIndex: node.lineIndex ?? node.index,
              partCategory: currentPartTitle
            });
          } else {
            result.push({
              ...node,
              lineIndex: node.lineIndex ?? node.index,
              partCategory: currentPartTitle,
              children: []
            });
          }
        }
      }
      return result;
    } else {
      // Exactly 2 levels (e.g. 1=Siman, 2=Seif)
      const minLevel = sortedLevels[0];
      const result: TocNode[] = [];
      let currentParent: TocNode | null = null;

      for (const node of rawToc) {
        const lvl = node.level ?? minLevel;
        if (lvl === minLevel) {
          currentParent = {
            ...node,
            lineIndex: node.lineIndex ?? node.index,
            children: []
          };
          result.push(currentParent);
        } else {
          if (currentParent) {
            if (!currentParent.children) currentParent.children = [];
            currentParent.children.push({
              ...node,
              lineIndex: node.lineIndex ?? node.index
            });
          } else {
            result.push({ ...node, lineIndex: node.lineIndex ?? node.index, children: [] });
          }
        }
      }
      return result;
    }
  }

  // 3. Fallback: Flat list with titles naming "סעיף" / "אות" / etc.
  const isSubPattern = /^(סעיף|סע'|סעי'|ס\"ק|אות|פסוק|הלכה|דין|קטע|הערה|הערות)\s+/;
  const isSingleLetterOrNum = /^[א-ת](\'|\")?$|^\d+$/;
  const hasSubTitles = rawToc.some(n => isSubPattern.test(n.title.trim()));

  if (hasSubTitles) {
    const result: TocNode[] = [];
    let currentParent: TocNode | null = null;

    for (const node of rawToc) {
      const isSub = isSubPattern.test(node.title.trim()) || (currentParent && isSingleLetterOrNum.test(node.title.trim()));
      if (isSub && currentParent) {
        if (!currentParent.children) currentParent.children = [];
        currentParent.children.push({
          ...node,
          lineIndex: node.lineIndex ?? node.index
        });
      } else {
        currentParent = {
          ...node,
          lineIndex: node.lineIndex ?? node.index,
          children: []
        };
        result.push(currentParent);
      }
    }
    return result;
  }

  return rawToc;
}

export const FindRefView: React.FC<FindRefViewProps> = ({ catalog, settings, onOpenBook }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'era' | 'title' | 'category'>('era');
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Real TOC state from database/book
  const [tocNodes, setTocNodes] = useState<TocNode[]>([]);
  const [isLoadingToc, setIsLoadingToc] = useState<boolean>(false);
  const [selectedChapterNode, setSelectedChapterNode] = useState<TocNode | null>(null);
  const [selectedSectionNode, setSelectedSectionNode] = useState<TocNode | null>(null);
  const [selectedPartCategory, setSelectedPartCategory] = useState<string>('all');
  const [tocFilterQuery, setTocFilterQuery] = useState<string>('');

  const isDark = settings?.theme === 'dark';

  const [visibleCount, setVisibleCount] = useState<number>(100);

  // Available book parts/categories (e.g. In Hafetz Haim: Peticha, Hilchot Lashon Hara, Hilchot Rechilut, Tziyurim)
  const availablePartCategories = useMemo(() => {
    const list: string[] = [];
    for (const n of tocNodes) {
      if (n.partCategory && n.partCategory.trim() && !list.includes(n.partCategory.trim())) {
        list.push(n.partCategory.trim());
      }
    }
    return list;
  }, [tocNodes]);

  // Chapters/Simanim filtered by selected part category
  const displayedChapterNodes = useMemo(() => {
    if (selectedPartCategory === 'all' || availablePartCategories.length <= 1) {
      return tocNodes;
    }
    return tocNodes.filter(n => n.partCategory === selectedPartCategory);
  }, [tocNodes, selectedPartCategory, availablePartCategories]);

  // Instant source books list in exact Otzaria catalogue tree order (pre-sorted from server or enriched with eraRank)
  const baseBooks = useMemo(() => {
    let source: BookItem[] = [];
    if (catalog?.sortedBooks && catalog.sortedBooks.length > 0) {
      source = catalog.sortedBooks;
    } else if (catalog?.books && catalog.books.length > 0) {
      source = catalog.books;
    }
    if (source.length === 0) return [];

    return source.map(b => ({
      ...b,
      eraRank: computeEraRank(b)
    }));
  }, [catalog]);

  function normalizeCat(s: string): string {
    if (!s) return '';
    return s.replace(/[\u05F4״"\']/g, '').replace(/[\u05F3׳]/g, '').trim().toLowerCase();
  }

  function isBookUnderTreeCategory(bookCatPath: string, bookTitle: string, selectedCat: string): boolean {
    if (!selectedCat || selectedCat === 'all') return true;
    const normCat = normalizeCat(bookCatPath || '');
    const normTitle = normalizeCat(bookTitle || '');
    const normTarget = normalizeCat(selectedCat);

    // Exact tree path prefix check (e.g. 'תנ"ך/תורה' matches 'תנ"ך')
    if (normCat === normTarget || normCat.startsWith(normTarget + '/')) {
      return true;
    }

    // Alias checks for special quick-filter buttons
    if (normTarget === 'שס' || normTarget === 'גמרא') {
      return normCat.startsWith('גמרא') || normTitle.includes('תלמוד בבלי') || normTitle.includes('תלמוד ירושלמי');
    }
    if (normTarget === 'רמבם') {
      return normCat.includes('רמבם') || normTitle.includes('משנה תורה');
    }
    if (normTarget === 'שולחן ערוך') {
      return normCat.includes('שולחן ערוך') || normTitle.includes('שולחן ערוך');
    }

    return false;
  }

  // Ultra-fast client-side filtering (2-4ms over 7000 items)
  const filteredBooks = useMemo(() => {
    let result = baseBooks;

    if (selectedCategory !== 'all') {
      result = result.filter(b => isBookUnderTreeCategory(b.categoryPath, b.title, selectedCategory));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        b =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q)) ||
          b.categoryPath.toLowerCase().includes(q)
      );
    }

    return result;
  }, [baseBooks, searchQuery, selectedCategory]);

  // Fast client sorting: When era is selected, books are sorted by precomputed eraRank in 0.5ms
  const sortedBooks = useMemo(() => {
    const list = [...filteredBooks];
    if (sortBy === 'era') {
      return list.sort((a, b) => ((a as any).eraRank ?? 99999) - ((b as any).eraRank ?? 99999));
    }

    if (sortBy === 'title') {
      return list.sort((a, b) => a.title.localeCompare(b.title, 'he'));
    }
    if (sortBy === 'category') {
      return list.sort((a, b) => {
        const normA = normalizeHebrew(a.categoryPath || '');
        const normB = normalizeHebrew(b.categoryPath || '');

        let idxA = ORDERED_TOP_CATEGORIES.findIndex(c => normA === normalizeHebrew(c) || normA.startsWith(normalizeHebrew(c) + '/'));
        let idxB = ORDERED_TOP_CATEGORIES.findIndex(c => normB === normalizeHebrew(c) || normB.startsWith(normalizeHebrew(c) + '/'));
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;

        if (idxA !== idxB) return idxA - idxB;
        const catComp = (a.categoryPath || '').localeCompare(b.categoryPath || '', 'he');
        if (catComp !== 0) return catComp;
        return a.title.localeCompare(b.title, 'he');
      });
    }
    return list;
  }, [filteredBooks, sortBy]);

  // Reset visibleCount back to 100 on filter or search changes for instant render response
  useEffect(() => {
    setVisibleCount(100);
  }, [searchQuery, selectedCategory, sortBy]);

  // Chunked visible subset for instant initial render
  const displayBooks = useMemo(() => {
    return sortedBooks.slice(0, visibleCount);
  }, [sortedBooks, visibleCount]);

  const virtualizer = useVirtualizer({
    count: displayBooks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  const handleBookScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 300) {
      if (visibleCount < sortedBooks.length) {
        setVisibleCount(prev => Math.min(prev + 200, sortedBooks.length));
      }
    }
  };

  // Automatically scroll back to top when filters or search change
  useEffect(() => {
    if (virtualizer && typeof virtualizer.scrollToOffset === 'function') {
      try {
        virtualizer.scrollToOffset(0);
      } catch {}
    }
  }, [searchQuery, selectedCategory, sortBy]);

  // Load real TOC when selectedBook changes
  useEffect(() => {
    if (!selectedBook) {
      setTocNodes([]);
      setSelectedChapterNode(null);
      setSelectedSectionNode(null);
      setSelectedPartCategory('all');
      return;
    }

    setIsLoadingToc(true);
    setTocFilterQuery('');
    setSelectedPartCategory('all');

    getBookToc(selectedBook.id)
      .then(res => {
        const fetchedToc = res.toc || [];
        const structured = structureTocForFindRef(fetchedToc);
        setTocNodes(structured);
        if (structured.length > 0) {
          setSelectedChapterNode(structured[0]);
          if (structured[0].children && structured[0].children.length > 0) {
            setSelectedSectionNode(structured[0].children[0]);
          } else {
            setSelectedSectionNode(null);
          }
        } else {
          setSelectedChapterNode(null);
          setSelectedSectionNode(null);
        }
      })
      .catch(err => {
        console.warn('Failed to load TOC for FindRefView:', err);
        setTocNodes([]);
      })
      .finally(() => {
        setIsLoadingToc(false);
      });
  }, [selectedBook?.id]);

  // Handle Chapter node click
  const handleSelectChapterNode = (node: TocNode) => {
    setSelectedChapterNode(node);
    if (node.children && node.children.length > 0) {
      setSelectedSectionNode(node.children[0]);
    } else {
      setSelectedSectionNode(null);
    }
  };

  // Open book at target line
  const handleOpenAtLine = (targetLine?: number, title?: string) => {
    if (!selectedBook) return;
    const finalLine = targetLine || selectedSectionNode?.lineIndex || selectedSectionNode?.index || selectedChapterNode?.lineIndex || selectedChapterNode?.index || 1;
    sysLogger.addLog(
      'info',
      'FindRef',
      `איתור מקור: "${selectedBook.title}" -> ${title || selectedSectionNode?.title || selectedChapterNode?.title || 'תחילה'} (שורה ${finalLine})`
    );
    onOpenBook(selectedBook.id, selectedBook.title, finalLine);
  };

  // Filtered TOC nodes when search text is entered in TOC search box
  const filteredTocList = useMemo(() => {
    if (!tocFilterQuery.trim() || tocNodes.length === 0) return [];
    const q = tocFilterQuery.trim().toLowerCase();
    const flat = flattenTocWithLineIndex(tocNodes);
    return flat.filter(n => n.title.toLowerCase().includes(q));
  }, [tocFilterQuery, tocNodes]);

  return (
    <div className={`flex-1 flex flex-col h-full select-none overflow-hidden ${
      isDark ? 'bg-[#18110D] text-stone-100' : 'bg-[#FAF8F5] text-stone-900'
    }`}>
      {/* Top Banner */}
      <div className={`px-6 py-3.5 flex items-center justify-between border-b shadow-xs ${
        isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
            isDark ? 'bg-amber-950 text-amber-300' : 'bg-amber-100/80 text-amber-900'
          }`}>
            <Compass className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className={`text-base font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>
              איתור מקור מהיר מתוך ראשי הפרקים
            </h2>
            <p className={`text-xs ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
              {selectedBook
                ? `ספר: ${selectedBook.title} ${selectedChapterNode ? `| ${selectedChapterNode.title}` : ''} ${selectedSectionNode ? `-> ${selectedSectionNode.title}` : ''}`
                : 'בחר ספר לקבלת תוכן העניינים וראשי הפרקים האמיתיים'}
            </p>
          </div>
        </div>

        {selectedBook && (
          <button
            onClick={() => handleOpenAtLine()}
            className="flex items-center gap-2 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <span>פתח ספר במיקום הנבחר</span>
            <CornerDownLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Container: 2 Columns */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Right Column: Book Selector with Search */}
        <div className={`w-full md:w-80 h-full min-h-0 border-l flex flex-col p-4 gap-3 shrink-0 overflow-hidden ${
          isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
        }`}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="חפש ספר (למשל: בראשית, ברכות, שולחן ערוך)..."
              className={`w-full rounded-lg pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-700/50 ${
                isDark
                  ? 'bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500'
                  : 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400'
              }`}
              autoFocus
            />
            <Search className={`w-4 h-4 absolute right-3 top-2.5 ${isDark ? 'text-stone-500' : 'text-stone-400'}`} />
          </div>

          {/* Quick Category Filter Pills */}
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'הכל' },
              { id: 'תנ"ך', label: 'תנ"ך' },
              { id: 'משנה', label: 'משנה' },
              { id: 'ש"ס', label: 'ש"ס' },
              { id: 'רמב"ם', label: 'רמב"ם' },
              { id: 'שולחן ערוך', label: 'הלכה' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-amber-800 text-white font-bold'
                    : isDark
                    ? 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Sorting Selector */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-200 dark:border-stone-800">
            <span className="font-semibold text-stone-500">מיון ספרים:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className={`rounded-lg px-2 py-1 text-xs font-serif ${
                isDark ? 'bg-stone-900 border border-stone-700 text-stone-200' : 'bg-stone-50 border border-stone-300 text-stone-800'
              }`}
            >
              <option value="era">סדר הדורות (תנ"ך ← חז"ל ← ראשונים)</option>
              <option value="title">סדר א"ב</option>
              <option value="category">לפי קטגוריה</option>
            </select>
          </div>

          <div className={`flex items-center justify-between text-[11px] font-medium px-1 ${
            isDark ? 'text-stone-400' : 'text-stone-500'
          }`}>
            <span>רשימת ספרים ({sortedBooks.length})</span>
          </div>

          {/* Books List with Virtualization */}
          <div ref={scrollRef} onScroll={handleBookScroll} className="flex-1 h-full min-h-0 overflow-y-auto pr-0.5 relative">
            {sortedBooks.length === 0 ? (
              <div className={`p-4 text-center text-xs ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
                לא נמצאו ספרים
              </div>
            ) : (
              <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vr) => {
                  const book = displayBooks[vr.index];
                  if (!book) return null;
                  const isSelected = selectedBook?.id === book.id;

                  return (
                    <div
                      key={`${book.id}-${vr.index}`}
                      data-index={vr.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vr.start}px)`,
                        willChange: 'transform',
                      }}
                      className="pb-1"
                    >
                      <button
                        onClick={() => setSelectedBook(book)}
                        className={`w-full text-right px-3 py-2.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-800 text-white font-bold shadow-xs'
                            : isDark
                            ? 'hover:bg-stone-800 text-stone-200'
                            : 'hover:bg-amber-50 text-stone-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <BookOpen
                            className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-200' : isDark ? 'text-stone-500' : 'text-stone-400'}`}
                          />
                          <span className="truncate">{book.title}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            isSelected
                              ? 'bg-amber-700/60 text-amber-100'
                              : isDark
                              ? 'bg-stone-800 text-stone-400'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {book.heEra || book.categoryPath.split('/')[0]}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Real TOC & Chapters View */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
          {selectedBook ? (
            <>
              {/* Selected Book Header Card */}
              <div className={`border rounded-2xl p-5 shadow-xs flex items-center justify-between ${
                isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
              }`}>
                <div>
                  <div className={`text-xs font-semibold mb-1 ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                    {selectedBook.categoryPath}
                  </div>
                  <h3 className={`text-xl font-bold font-serif ${isDark ? 'text-stone-100' : 'text-stone-900'}`}>
                    {selectedBook.title}
                  </h3>
                  {selectedBook.author && (
                    <div className={`text-xs mt-0.5 ${isDark ? 'text-stone-400' : 'text-stone-500'}`}>
                      מחבר: {selectedBook.author} {selectedBook.heEra ? `· תקופה: ${selectedBook.heEra}` : ''}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleOpenAtLine()}
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <span>פתח ספר זה</span>
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>

              {/* TOC Filter Search Field */}
              <div className="relative">
                <input
                  type="text"
                  value={tocFilterQuery}
                  onChange={e => setTocFilterQuery(e.target.value)}
                  placeholder={`סנן ראשי פרקים ב-${selectedBook.title} (למשל: פרק ג, הלכות שבת, סימן קנט)...`}
                  className={`w-full rounded-xl pr-9 pl-3 py-2.5 text-xs font-serif focus:outline-none focus:ring-2 focus:ring-amber-700/50 ${
                    isDark
                      ? 'bg-stone-900 border border-stone-700 text-stone-100 placeholder-stone-500'
                      : 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400'
                  }`}
                />
                <Search className={`w-4 h-4 absolute right-3 top-3 ${isDark ? 'text-stone-500' : 'text-stone-400'}`} />
              </div>

              {/* Loading TOC Indicator */}
              {isLoadingToc ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-2" />
                  <span className="text-xs font-serif font-bold text-stone-500">
                    טוען את ראשי הפרקים ותוכן העניינים של "{selectedBook.title}"...
                  </span>
                </div>
              ) : filteredTocList.length > 0 ? (
                /* Filtered Search Results from TOC */
                <div className={`border rounded-2xl p-5 shadow-xs flex flex-col gap-2 ${
                  isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
                }`}>
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">
                    תוצאות סינון בראשי הפרקים ({filteredTocList.length}):
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                    {filteredTocList.map((node, i) => {
                      const idx = node.lineIndex || node.index || 1;
                      return (
                        <button
                          key={i}
                          onClick={() => handleOpenAtLine(idx, node.title)}
                          className={`text-right p-3 rounded-xl border text-xs font-serif font-bold transition-all cursor-pointer flex items-center justify-between ${
                            isDark
                              ? 'bg-stone-900 border-stone-700 hover:border-amber-600 text-stone-200'
                              : 'bg-stone-50 border-stone-200 hover:border-amber-400 text-stone-800'
                          }`}
                        >
                          <div className="flex flex-col truncate">
                            {node.parentPath && (
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-sans font-normal truncate">
                                {node.parentPath}
                              </span>
                            )}
                            <span className="truncate">{node.title}</span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-sans font-normal shrink-0 mr-2">
                            שורה #{idx}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : tocNodes.length > 0 ? (
                /* Display REAL TOC Headings & Sections */
                <div className="flex flex-col gap-6">
                  {/* Level 1: Primary Chapter / Section Headings */}
                  <div className={`border rounded-2xl p-5 shadow-xs ${
                    isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
                  }`}>
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b pb-2 ${isDark ? 'border-stone-800' : 'border-stone-100'}`}>
                      <h4 className={`text-sm font-bold font-serif flex items-center gap-1.5 ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                        <ListTree className="w-4 h-4 text-amber-600" />
                        <span>שלב א': בחירת פרק / סימן / כלל</span>
                      </h4>
                      {selectedChapterNode && (
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          נבחר: {selectedChapterNode.title} {selectedChapterNode.partCategory && selectedChapterNode.partCategory !== selectedChapterNode.title ? `(${selectedChapterNode.partCategory})` : ''}
                        </span>
                      )}
                    </div>

                    {/* Book Parts Quick Filter Buttons (e.g. for Hafetz Haim: Peticha, Lashon Hara, Rechilut, Tziyurim) */}
                    {availablePartCategories.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <button
                          onClick={() => setSelectedPartCategory('all')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-serif transition-colors cursor-pointer ${
                            selectedPartCategory === 'all'
                              ? 'bg-amber-800 text-white font-bold shadow-xs'
                              : isDark
                              ? 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                              : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                          }`}
                        >
                          כל חלקי הספר ({tocNodes.length})
                        </button>
                        {availablePartCategories.map((part, pIdx) => {
                          const count = tocNodes.filter(n => n.partCategory === part).length;
                          const isPartActive = selectedPartCategory === part;
                          return (
                            <button
                              key={pIdx}
                              onClick={() => setSelectedPartCategory(part)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-serif transition-colors cursor-pointer flex items-center gap-1 ${
                                isPartActive
                                  ? 'bg-amber-800 text-white font-bold shadow-xs'
                                  : isDark
                                  ? 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                              }`}
                            >
                              <span>{part}</span>
                              <span className={`text-[10px] font-sans ${isPartActive ? 'text-amber-200' : 'text-stone-400'}`}>
                                ({count})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
                      {displayedChapterNodes.map((node, idx) => {
                        const isSelected = selectedChapterNode?.title === node.title && selectedChapterNode?.index === node.index;
                        const hasChildren = node.children && node.children.length > 0;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectChapterNode(node)}
                            className={`p-3 rounded-xl text-xs font-serif font-bold text-right transition-all border cursor-pointer flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? 'bg-amber-800 border-amber-800 text-white shadow-xs scale-[1.02]'
                                : isDark
                                ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200'
                                : 'bg-stone-50 hover:bg-amber-100/60 border-stone-200 text-stone-800'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 truncate w-full">
                              {node.partCategory && node.partCategory !== node.title && selectedPartCategory === 'all' && (
                                <span className={`text-[10px] font-sans font-normal truncate ${
                                  isSelected ? 'text-amber-200' : 'text-amber-700 dark:text-amber-400'
                                }`}>
                                  {node.partCategory}
                                </span>
                              )}
                              <span className="line-clamp-2">{node.title}</span>
                            </div>
                            {hasChildren && (
                              <span className={`text-[10px] font-sans font-normal shrink-0 ${isSelected ? 'text-amber-200' : 'text-stone-400'}`}>
                                {node.children!.length} סעיפים
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Level 2: Sub-sections / Verses / Halachot / Seifim */}
                  {selectedChapterNode && selectedChapterNode.children && selectedChapterNode.children.length > 0 && (
                    <div className={`border rounded-2xl p-5 shadow-xs ${
                      isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
                    }`}>
                      <div className={`flex items-center justify-between mb-3 border-b pb-2 ${isDark ? 'border-stone-800' : 'border-stone-100'}`}>
                        <h4 className={`text-sm font-bold font-serif ${isDark ? 'text-stone-200' : 'text-stone-800'}`}>
                          שלב ב': בחירת סעיף / הלכה בתוך "{selectedChapterNode.title}" {selectedChapterNode.partCategory && selectedChapterNode.partCategory !== selectedChapterNode.title ? `(${selectedChapterNode.partCategory})` : ''}
                        </h4>
                        {selectedSectionNode && (
                          <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                            נבחר: {selectedSectionNode.title}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1">
                        {selectedChapterNode.children.map((subNode, sIdx) => {
                          const isSelected = selectedSectionNode?.title === subNode.title && selectedSectionNode?.index === subNode.index;
                          const subIdx = subNode.lineIndex || subNode.index || 1;
                          const exists = !!subNode.title;
                          return (
                            <button
                              key={sIdx}
                              disabled={!exists}
                              onClick={() => {
                                if (!exists) return;
                                setSelectedSectionNode(subNode);
                                handleOpenAtLine(subIdx, subNode.title);
                              }}
                              className={`p-2.5 rounded-xl text-xs font-serif font-bold text-center transition-all border flex flex-col items-center justify-center gap-0.5 ${
                                !exists
                                  ? 'opacity-40 cursor-not-allowed border-dashed bg-stone-100 dark:bg-stone-900/50 text-stone-400 select-none'
                                  : isSelected
                                  ? 'bg-amber-800 border-amber-800 text-white shadow-xs scale-105 cursor-pointer'
                                  : isDark
                                  ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer'
                                  : 'bg-stone-50 hover:bg-amber-100/60 border-stone-200 text-stone-800 cursor-pointer'
                              }`}
                              title={!exists ? 'סעיף זה אינו קיים' : subNode.title}
                            >
                              <span className="truncate w-full">{subNode.title || `סעיף ${sIdx + 1}`}</span>
                              <span className={`text-[9px] font-sans font-normal ${!exists ? 'text-stone-500' : isSelected ? 'text-amber-200' : 'text-stone-400'}`}>
                                {exists ? `שורה #${subIdx}` : 'לא קיים'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quick Launch Button */}
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      onClick={() => handleOpenAtLine()}
                      className="px-6 py-3 bg-amber-800 hover:bg-amber-900 text-white rounded-2xl text-sm font-bold shadow-md flex items-center gap-2.5 transition-transform active:scale-95 cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>
                        פתח את {selectedBook.title}{' '}
                        {selectedSectionNode
                          ? `(${selectedSectionNode.title})`
                          : selectedChapterNode
                          ? `(${selectedChapterNode.title})`
                          : ''}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Fallback for books without pre-generated TOC tree */
                <div className={`border rounded-2xl p-6 shadow-xs flex flex-col items-center text-center gap-4 ${
                  isDark ? 'bg-[#211711] border-stone-800' : 'bg-white border-stone-200'
                }`}>
                  <BookOpen className="w-10 h-10 text-amber-600" />
                  <div>
                    <h4 className="text-base font-bold font-serif mb-1">
                      פתח את הספר "{selectedBook.title}"
                    </h4>
                    <p className="text-xs text-stone-500 max-w-md mx-auto">
                      ניתן לפתוח ספר זה ישירות וקורא הספרים יציג את הניווט המלא ואפשרויות הלימוד.
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenAtLine(1, 'תחילת הספר')}
                    className="px-6 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                  >
                    פתח את הספר מתחילתו
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Compass className={`w-12 h-12 mb-3 ${isDark ? 'text-stone-600' : 'text-stone-300'}`} />
              <h3 className={`text-base font-bold font-serif mb-1 ${isDark ? 'text-stone-300' : 'text-stone-600'}`}>
                בחר ספר מהרשימה בצד ימין
              </h3>
              <p className={`text-xs max-w-sm ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>
                לאחר בחירת הספר ייטענו ראשי הפרקים ותוכן העניינים האמיתיים של הספר למעבר ישיר ומדויק.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
