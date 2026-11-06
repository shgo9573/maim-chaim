export type ID = number | string;

export interface BookItem {
  id: ID;
  title: string;
  categoryPath: string;
  author?: string;
  heCategories?: string;
  heEra?: string;
  fileType?: string;
  order?: number;
  hasToc?: boolean;
  hasLinks?: boolean;
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
  /** IDs hidden by the backend because they are mapped to restricted sources. */
  excludedBookIds?: Array<string | number>;
}

export interface ContentLine {
  lineIndex: number;
  content: string;
  heRef?: string;
}

export interface ContentResponse {
  id: ID;
  title: string;
  lines: ContentLine[];
  totalLines: number;
}

export interface TocEntry {
  title: string;
  index: number;
  level?: number;
}

export interface CommentaryLink {
  sourceBook: string;
  category: string;
  line: number;
  text: string;
  dibburHamatchil?: string;
  isLineMatch?: boolean;
}

export interface LinksResponse {
  id: ID;
  line: number;
  dafLabel?: string;
  links: CommentaryLink[];
  allLinks?: CommentaryLink[];
  availableCommentators?: string[];
}

export interface SearchResultItem {
  bookId: ID;
  bookTitle: string;
  categoryPath: string;
  lineIndex: number;
  snippet: string;
  reference?: string;
}

export interface SearchResponse {
  query: string;
  resultsCount: number;
  totalBooks?: number;
  /** Number of raw API rows consumed before the client-side exclusions. */
  scannedCount?: number;
  results: SearchResultItem[];
}

export interface RecentSearchItem {
  query: string;
  searchedAt: string;
}

export interface ServerStatus {
  status: string;
  mode?: string;
  message?: string;
  totalBooks: number;
  storageUsageMB: number;
  databaseSize?: string;
  databaseEngine?: string;
  lastUpdated?: string;
}

export interface BookmarkItem {
  id: string;
  bookId: ID;
  bookTitle: string;
  lineIndex: number;
  textSnippet: string;
  description?: string;
  category?: string;
  heRef?: string;
  createdAt: string;
}

export interface ReadingHistoryItem {
  id: string;
  bookId: ID;
  bookTitle: string;
  category?: string;
  lastPosition?: number;
  lastSection?: string;
  lastReadAt: string;
}

export interface ReaderSettings {
  fontFamily: string;
  fontSize: number;
  commentaryFontFamily: string;
  commentaryFontSize: number;
  theme: 'light' | 'sepia' | 'dark';
  lineHeight: number;
  textMaxWidth: '70%' | '80%' | '90%' | '100%';
  continuousReadingMode: boolean;
  showNikud: boolean;
  nikudPolicy: 'all' | 'none' | 'tanakh_only';
  showTeamim: boolean;
  showPunctuation: boolean;
  holyNameReplacement: string;
  showCommentaryMarkers: boolean;
  commentaryViewMode: 'auto' | 'side_panel' | 'inline';
  copyIncludeHeader: 'always' | 'never' | 'ask';
  copyHeaderFormat: 'title_and_ref' | 'title_only' | 'full_path';
  libraryViewMode: 'list' | 'grid';
  showBookPreview: boolean;
  gematriaMethod: 'standard' | 'small' | 'atbash' | 'albam';
  gematriaIncludeSofiyot: boolean;
  perBookSettingsEnabled: boolean;
  rollingBackupsEnabled: boolean;
  commentaryFiltersByBook?: Record<string, { hidden: string[]; category: string }>;
  personalNotes?: PersonalNote[];
  hiddenHistoryIds?: string[];
  seedColor?: string;
  uiBrightness?: number;
  /** show the source reference (heRef) above each line in the reader – off by default */
  showLineRefs?: boolean;
  /** default reader panel widths are percentages of the available reader width */
  commentaryPanelWidth?: number;
  navigationPanelWidth?: number;
  commentaryOpenByDefault?: boolean;
  /** optional per-book overrides, used only when perBookSettingsEnabled is on */
  perBookLayoutSettings?: Record<string, {
    commentaryPanelWidth?: number;
    navigationPanelWidth?: number;
    commentaryOpen?: boolean;
  }>;
  calendarLocation?: string;
  zmanimMethod?: 'gra' | 'mga' | 'baal_hatanya';
  dailyStudyTracks?: Record<string, boolean>;
  dailyStudyOrder?: string[];
  interfaceLanguage?: 'he' | 'en';
  halachaYomitScheduleType?: 'dirshu_mishna_berura' | 'shulchan_aruch' | 'kitzur_shulchan_aruch' | 'rambam_halacha';
  chofetzChaimScheduleType?: 'world_three_times' | 'world_biannual';
  customStudies?: CustomStudy[];
  studyProgress?: Record<string, { done: string[]; unit: number; updatedAt: string }>;
  dailyNotificationsEnabled?: boolean;
  dailyNotificationTime?: string;
  [key: string]: unknown;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: 'Frank Ruhl Hofshi',
  fontSize: 22,
  commentaryFontFamily: 'Frank Ruhl Hofshi',
  commentaryFontSize: 17,
  theme: 'light',
  lineHeight: 1.7,
  textMaxWidth: '100%',
  continuousReadingMode: false,
  showNikud: true,
  nikudPolicy: 'all',
  showTeamim: true,
  showPunctuation: true,
  holyNameReplacement: 'יהוה',
  showCommentaryMarkers: true,
  commentaryViewMode: 'auto',
  copyIncludeHeader: 'never',
  copyHeaderFormat: 'title_and_ref',
  libraryViewMode: 'list',
  showBookPreview: true,
  gematriaMethod: 'standard',
  gematriaIncludeSofiyot: false,
  perBookSettingsEnabled: false,
  rollingBackupsEnabled: true,
  dailyNotificationsEnabled: false,
  dailyNotificationTime: '08:00',
  interfaceLanguage: 'he',
  dailyStudyOrder: ['dafYomi', 'chofetzChaim', 'mishnaYomi', 'rambam', 'halachaYomit', 'parasha'],
  chofetzChaimScheduleType: 'world_three_times',
  commentaryPanelWidth: 19,
  navigationPanelWidth: 16,
  commentaryOpenByDefault: true,
  showLineRefs: false,
};

export interface Highlight {
  text?: string;
  line?: number;
  from?: number;
  to?: number;
  /** every matching line in this book, for in-book result navigation */
  matches?: number[];
}

export interface BookTab {
  id: string;
  kind: 'book';
  bookId: ID;
  title: string;
  category?: string;
  line: number;
  jump?: { line: number; n: number };
  highlight?: Highlight;
}

export interface CustomStudy {
  id: string;
  title: string;
  bookId: ID;
  bookTitle: string;
  /** TOC level used as the unit (0 = top level, 1 = second level ...) */
  level: number;
  levelLabel: string;
  unitsPerDay: number;
  /** line indexes of every unit, in order */
  units: { title: string; index: number }[];
  current: number;
  startDate: string;
  active: boolean;
}

export interface PersonalNote {
  id: string;
  bookId: ID;
  line: number;
  heRef?: string;
  text: string;
  updatedAt: string;
}

export interface SearchTab {
  id: string;
  kind: 'search';
  title: string;
  query: string;
}

export interface TzuratHaDafTab {
  id: string;
  kind: 'tzurat-hadaf';
  title: string;
  bookId: ID;
  tractate: string;
  daf: number;
  amud: 'a' | 'b';
}

export type Tab = BookTab | SearchTab | TzuratHaDafTab;
export type Screen = 'library' | 'find' | 'reading' | 'more' | 'settings' | 'admin';
