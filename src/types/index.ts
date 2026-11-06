export type CategoryType =
  | 'תנ"ך'
  | 'משנה'
  | 'תלמוד בבלי'
  | 'תלמוד ירושלמי'
  | 'מדרש'
  | 'רמב"ם'
  | 'הלכה'
  | 'מוסר ומחשבה'
  | 'קבלה'
  | 'שו"ת'
  | 'סידור ותפילה'
  | 'ספרים אישיים';

export interface Commentary {
  id: string;
  author: string;
  title: string;
  lineIndex: number; // 0-based line/verse index in chapter
  text: string;
  type?: 'rashi' | 'tosafot' | 'ramban' | 'ibn_ezra' | 'bartenura' | 'other';
}

export interface Line {
  index: number;
  numberHe: string; // e.g., 'א', 'ב'
  text: string; // Text with Nikud
  textPlain?: string; // Text without Nikud
  commentaries?: Commentary[];
}

export interface Chapter {
  id: string;
  title: string; // e.g. "פרק א", "בראשית", "דף ב ע"א"
  lines: Line[];
}

export interface Book {
  id: string;
  title: string; // e.g. "בראשית", "ברכות", "שולחן ערוך"
  author?: string; // e.g. "משה רבנו", "רבי יהודה הנשיא", "רב יוסף קארו"
  category: CategoryType;
  subCategory?: string; // e.g. "חמישה חומשי תורה", "סדר זרעים"
  description?: string;
  era?: string; // e.g. "תנאים", "אמוראים", "ראשונים", "אחרונים"
  chapters: Chapter[];
  isCustom?: boolean;
  fileFormat?: 'txt' | 'docx' | 'pdf';
  hasNikud?: boolean;
}

export interface Bookmark {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  lineIndex: number;
  lineText: string;
  createdAt: string; // ISO String
  note?: string;
  label?: string;
}

export interface PersonalNote {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  lineIndex: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingTab {
  id: string;
  type: 'library' | 'reader' | 'search' | 'bookmarks' | 'calendar' | 'custom_book';
  title: string;
  bookId?: string;
  chapterIndex?: number;
  lineIndex?: number;
  splitBookId?: string; // For dual book view
  splitChapterIndex?: number;
  searchQuery?: string;
}

export interface SearchResult {
  bookId: string;
  bookTitle: string;
  category: CategoryType;
  chapterIndex: number;
  chapterTitle: string;
  lineIndex: number;
  lineText: string;
  matchScore?: number;
}

export interface BookFacetCount {
  bookId: number;
  title: string;
  category?: string;
  categoryPath?: string;
  count: number;
}

export interface SearchResultItem {
  bookId: number;
  bookTitle: string;
  categoryPath: string;
  lineIndex: number;
  snippet: string;
}

export type FontFamily = 'frank' | 'rashi' | 'serif' | 'sans';
export type ReaderTheme = 'classic' | 'sepia' | 'dark' | 'blue';
export type CommentaryMode = 'side' | 'bottom' | 'inline' | 'none';

export interface DisplaySettings {
  fontSize: number; // e.g., 18 to 36
  lineHeight: number; // e.g., 1.4 to 2.2
  fontFamily: FontFamily;
  theme: ReaderTheme;
  showNikud: boolean;
  commentaryMode: CommentaryMode;
  showLineNumbers: boolean;
  splitView: boolean;
  showAcronymTooltip: boolean;
}

export interface DailyStudyItem {
  type: 'daf_yomi' | 'mishnah_yomi' | 'parasha' | 'rambam';
  title: string;
  bookTitle: string;
  bookId: string;
  portion: string;
  chapterIndex: number;
  description: string;
}
