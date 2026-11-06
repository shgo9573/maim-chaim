export interface BookItem {
  id: number | string;
  title: string;
  categoryPath: string;
  author?: string;
  heCategories?: string;
  heEra?: string;
  fileType: string;
  order?: number;
  orderIndex?: number;
  hasToc?: boolean;
  hasLinks?: boolean;
  remotePath?: string;
  heDesc?: string;
  pubDate?: string;
  pubPlace?: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  path: string;
  children?: CategoryNode[];
  books?: BookItem[];
}

export interface CatalogData {
  categories: CategoryNode[];
  books: BookItem[];
  sortedBooks?: BookItem[];
  totalBooksCount?: number;
  categoriesCount?: number;
}

export interface TocNode {
  title: string;
  index: number;
  lineIndex?: number;
  level?: number;
  children?: TocNode[];
  partCategory?: string;
}

export interface CommentaryLink {
  sourceBook: string;
  category: string;
  line: number;
  text: string;
  dibburHamatchil?: string;
  isLineMatch?: boolean;
}

export interface BookFacetCount {
  bookId: number | string;
  title: string;
  category?: string;
  categoryPath?: string;
  count: number;
}

export interface SearchResultItem {
  bookId: number | string;
  bookTitle: string;
  categoryPath: string;
  lineIndex: number;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  resultsCount: number;
  totalBooks?: number;
  hasMore?: boolean;
  bookCounts?: BookFacetCount[];
  results: SearchResultItem[];
}

export interface ServerStatus {
  status: 'initializing' | 'downloading' | 'busy' | 'ready' | 'error';
  mode?: 'sqlite_local' | 'cloud_online';
  step?: string;
  progress?: number;
  downloadedBytes?: number;
  totalBooks: number;
  storageUsageMB: number;
  databasePath?: string;
  databaseSize?: string;
  databaseEngine?: string;
  lastUpdated: string;
  message?: string;
}

export interface TabItem {
  id: string;
  type: 'library' | 'search' | 'book' | 'bookmarks' | 'find' | 'tools' | 'history' | 'settings' | 'tzurat-hadaf' | 'admin';
  title: string;
  bookId?: number | string;
  bookTitle?: string;
  initialLine?: number;
  initialSearch?: string;
  initialHighlight?: string;
  initialWordRange?: { start: number; end: number };
  initialDaf?: string;
}

export interface BookmarkItem {
  id: string;
  bookId: number | string;
  bookTitle: string;
  lineIndex: number;
  snippet: string;
  note?: string;
  createdAt: string;
}

export interface CustomDailyStudy {
  id: string;
  title: string;
  bookTitle: string;
  bookId?: number | string;
  paceType: 'page' | 'daf' | 'chapter' | 'siman' | 'custom';
  unitsPerDay?: number;
  totalUnits?: number;
  currentUnit?: number;
  startDate?: string;
  description?: string;
  active: boolean;
}

export interface ReaderSettings {
  // גופנים ומראה (Text & Typography)
  fontFamily: string; // ברירת מחדל בתוכנה: FrankRuhlCLM
  fontBold?: boolean; // הדגשת גופן הספר הראשי
  fontSize: number; // גודל גופן הספר (15-60)
  commentaryFontFamily?: string; // ברירת מחדל בתוכנה: NotoRashiHebrew
  commentaryFontBold?: boolean; // הדגשת גופן המפרשים
  commentaryFontSize?: number; // גודל גופן המפרשים (10-40)
  theme: 'light' | 'sepia' | 'dark' | 'system';
  seedColor?: string; // צבע בסיס ראשי של הממשק

  // 1. מבנה העמוד והקריאה (Layout & Reading)
  lineHeight: number; // 1.0 עד 3.0
  textMaxWidth: '70%' | '75%' | '80%' | '85%' | '90%' | '95%' | '100%';
  continuousReadingMode: boolean; // קריאה רציפה בתנ"ך ובתלמוד (רצף מול שורות בודדות)
  defaultContinuousReadingMode?: boolean;

  // 2. מדיניות ניקוד, טעמים ושמות קדושים (Text Policy)
  showNikud: boolean;
  nikudPolicy: 'all' | 'none' | 'tanakh_only';
  showTeamim: boolean;
  showPunctuation: boolean;
  holyNameReplacement: "ה'" | "יי" | "ד'" | "יהוה";
  showCommentaryMarkers: boolean; // ציוני מפרשים בגוף הטקסט
  commentaryViewMode?: 'auto' | 'side_panel' | 'inline'; // אופן תצוגת מפרשים: חלונית צד, משולב בטקסט, אוטומטי
  defaultCommentaryOpen?: boolean; // פתיחת פאנל מפרשים אוטומטית בפתיחת ספר
  sidebarMode?: 'pinned' | 'openOnBook' | 'closed'; // חלונית ניווט בין כותרות

  // 3. הגדרות העתקה (Copy & Export)
  copyWithHeaders?: 'none' | 'book_name' | 'book_and_path';
  copyIncludeHeader: 'always' | 'never' | 'ask';
  copyHeaderFormat:
    | 'same_line_after_brackets'
    | 'same_line_after_no_brackets'
    | 'same_line_before_brackets'
    | 'same_line_before_no_brackets'
    | 'separate_line_after'
    | 'separate_line_before'
    | 'title_and_ref'
    | 'title_only'
    | 'full_path';

  // 4. עיצוב ממשק ומראה (Design & Chrome)
  compactMenuMode?: boolean; // צפיפות ממשק: רגיל / מצומצם
  readingTabsPlacement?: 'top' | 'side'; // מיקום כרטיסיות עיון: למעלה / בצד
  talmudBavliOpenFormat?: 'text' | 'pdf'; // פורמט פתיחת תלמוד בבלי: טקסט / PDF צורת הדף
  pdfBookViewByDefault?: boolean; // פתיחת PDF בתצוגת ספר כפול

  // 5. ספרייה ואינדקס (Library & Index)
  libraryViewMode: 'list' | 'grid';
  showBookPreview: boolean;
  showHebrewBooks?: boolean; // הצגת ספרי היברובוקס
  showOtzarHachochma?: boolean; // הצגת ספרי אוצר החכמה
  mergeUserBooksIntoLibrary?: boolean; // מיזוג ספרים אישיים לעץ הספרייה
  autoUpdateIndex?: boolean; // עדכון אינדקס אוטומטי

  // 6. לוח שנה וזמני היום (Calendar & Daily Study)
  calendarLocation: string; // ירושלים, בני ברק, צפת, חיפה, באר שבע, ניו יורק, לונדון
  calendarType?: 'combined' | 'hebrew' | 'gregorian';
  zmanimMethod: 'gra' | 'mga' | 'baal_hatanya';
  candleLightingMinutes?: number; // דקות הדלקת נרות שבת (20, 30, 40)
  showDailyStudy: boolean;
  halachaYomitScheduleType?: 'dirshu_mishna_berura' | 'shulchan_aruch' | 'kitzur_shulchan_aruch' | 'rambam_halacha';
  chofetzChaimScheduleType?: 'world_three_times' | 'world_annual' | 'world_biannual' | 'daily_order';
  dailyStudyTracks?: {
    dafYomi: boolean;
    parasha: boolean;
    chofetzChaim: boolean;
    halachaYomit: boolean;
  };
  customDailyStudies?: CustomDailyStudy[];

  // 7. מחשבון גימטריה (Gematria)
  gematriaMethod: 'standard' | 'small' | 'atbash' | 'albam';
  gematriaIncludeSofiyot: boolean;
  gematriaMaxResults?: number;
  gematriaFilterDuplicates?: boolean;
  gematriaWholeVerseOnly?: boolean;

  // 8. תיקון קוראים (Tikkun Korim)
  tiqqunShowColumns: boolean;
  tiqqunHighlightKamatzKatan: boolean;
  tiqqunNusach?: 'ashkenaz' | 'sefarad' | 'edot_hamizrach';
  tiqqunNusachLand?: 'israel' | 'diaspora';
  tiqqunStartupMode?: 'current_parasha' | 'last_location';

  // 9. קיצורי מקשים (Keyboard Shortcuts)
  shortcuts: {
    nextPage: string;
    prevPage: string;
    nextChapter: string;
    prevChapter: string;
    searchBook: string;
    searchGlobal: string;
    toggleCommentary: string;
    toggleToc: string;
    increaseFont: string;
    decreaseFont: string;
  };

  // 10. מערכת ופר-ספר (System & Per-Book)
  perBookSettingsEnabled: boolean;
  rollingBackupsEnabled: boolean;
  autoRestoreSession?: boolean; // שחזור אוטומטי של ספרים פתוחים מהביקור האחרון
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  autoRestoreSession: true,
  // פונט ברירת המחדל של ספר באוצריא: FrankRuhlCLM
  fontFamily: 'FrankRuhlCLM',
  fontBold: false,
  fontSize: 22,
  // פונט ברירת המחדל של מפרשים באוצריא: NotoRashiHebrew (כתב רש"י)
  commentaryFontFamily: 'NotoRashiHebrew',
  commentaryFontBold: false,
  commentaryFontSize: 18,
  theme: 'sepia',
  seedColor: '#92400E', // ענבר/חום תורני
  lineHeight: 1.8,
  textMaxWidth: '90%',
  continuousReadingMode: false,
  defaultContinuousReadingMode: false,
  showNikud: true,
  nikudPolicy: 'all',
  showTeamim: true,
  showPunctuation: true,
  holyNameReplacement: "ה'",
  showCommentaryMarkers: true,
  commentaryViewMode: 'auto',
  defaultCommentaryOpen: false,
  sidebarMode: 'pinned',
  copyWithHeaders: 'book_and_path',
  copyIncludeHeader: 'always',
  copyHeaderFormat: 'same_line_after_brackets',
  compactMenuMode: false,
  readingTabsPlacement: 'top',
  talmudBavliOpenFormat: 'text',
  pdfBookViewByDefault: false,
  libraryViewMode: 'grid',
  showBookPreview: true,
  showHebrewBooks: true,
  showOtzarHachochma: false,
  mergeUserBooksIntoLibrary: false,
  autoUpdateIndex: true,
  calendarLocation: 'ירושלים',
  calendarType: 'combined',
  zmanimMethod: 'gra',
  candleLightingMinutes: 20,
  showDailyStudy: true,
  halachaYomitScheduleType: 'dirshu_mishna_berura',
  chofetzChaimScheduleType: 'world_three_times',
  dailyStudyTracks: {
    dafYomi: true,
    parasha: true,
    chofetzChaim: true,
    halachaYomit: true
  },
  customDailyStudies: [],
  gematriaMethod: 'standard',
  gematriaIncludeSofiyot: false,
  gematriaMaxResults: 50,
  gematriaFilterDuplicates: true,
  gematriaWholeVerseOnly: false,
  tiqqunShowColumns: true,
  tiqqunHighlightKamatzKatan: true,
  tiqqunNusach: 'ashkenaz',
  tiqqunNusachLand: 'israel',
  tiqqunStartupMode: 'current_parasha',
  shortcuts: {
    nextPage: 'PageDown',
    prevPage: 'PageUp',
    nextChapter: 'Alt+ArrowDown',
    prevChapter: 'Alt+ArrowUp',
    searchBook: 'Ctrl+F',
    searchGlobal: 'Ctrl+Shift+F',
    toggleCommentary: 'Ctrl+M',
    toggleToc: 'Ctrl+T',
    increaseFont: 'Ctrl+=',
    decreaseFont: 'Ctrl+-'
  },
  perBookSettingsEnabled: true,
  rollingBackupsEnabled: true
};
