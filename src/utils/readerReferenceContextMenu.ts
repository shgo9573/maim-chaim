import type { CommentaryLink } from '../types';

export interface ReaderReferenceMenuItem {
  key: string;
  bookId?: number | string;
  title: string;
  categoryLabel: string;
  line: number;
  reference: string;
  preview: string;
}

const DEPENDENT_TEXT_TYPES = new Set([
  'COMMENTARY',
  'SUPER_COMMENTARY',
  'TARGUM',
  'MIDRASH',
  'PARSHANUT',
  'DIBUR_HAMATCHIL',
  'ELUCIDATION',
  'EXPLICATION',
  'FOOTNOTES',
]);

const HEBREW_DEPENDENT_TYPES = new Set([
  'מפרש',
  'פירוש',
  'תרגום',
  'מדרש',
  'פרשנות',
  'דיבור המתחיל',
  'ביאור',
  'הערות שוליים',
]);

const HEBREW_TYPE_ALIASES: Record<string, string> = {
  'פירוש': 'COMMENTARY',
  'תרגום': 'TARGUM',
  'הפניה': 'REFERENCE',
  'מקור': 'SOURCE',
  'אחר': 'OTHER',
};

const TYPE_ALIASES: Record<string, string> = {
  SUPERCOMMENTARY: 'SUPER_COMMENTARY',
  MISHNAHINTALMUD: 'MISHNAH_IN_TALMUD',
  RELATEDPASSAGE: 'RELATED_PASSAGE',
  QUOTATIONAUTO: 'QUOTATION_AUTO',
  QUOTATIONAUTOTANAKH: 'QUOTATION_AUTO_TANAKH',
  SIFREIMITZVOT: 'SIFREI_MITZVOT',
  SIFREI_MITSVOT: 'SIFREI_MITZVOT',
  ELLUCIDATION: 'ELUCIDATION',
  FOOTNOTE: 'FOOTNOTES',
  NONE: 'OTHER',
  'EIN_MISHPAT_/_NER_MITSVAH': 'EIN_MISHPAT',
  'EIN_MISHPAT_/_NER_MITZVAH': 'EIN_MISHPAT',
};

const TYPE_LABELS: Record<string, string> = {
  COMMENTARY: 'פירוש',
  SUPER_COMMENTARY: 'פירוש על פירוש',
  TARGUM: 'תרגום',
  MIDRASH: 'מדרש',
  PARSHANUT: 'פרשנות',
  DIBUR_HAMATCHIL: 'דיבור המתחיל',
  ELUCIDATION: 'ביאור',
  EXPLICATION: 'ביאור',
  FOOTNOTES: 'הערות שוליים',
  SOURCE: 'מקור',
  REFERENCE: 'עיון',
  QUOTATION: 'ציטוט',
  MESORAT_HASHAS: 'מסורת הש״ס',
  EIN_MISHPAT: 'עין משפט',
  MISHNAH_IN_TALMUD: 'משנה בתלמוד',
  RELATED: 'נושא קרוב',
  RELATED_PASSAGE: 'קטע קשור',
  OTHER: 'לא מסווג',
  NONE: 'לא מסווג',
  SIFREI_MITZVOT: 'ספרי מצוות',
  ESSAY: 'מאמר',
  ALLUSION: 'אזכור',
  LAW: 'פסיקת הלכה',
  LITURGY: 'תפילה',
  LINKER: 'אוטומטי',
  SUMMARY: 'סיכום',
  QUOTATION_AUTO: 'ציטוט אוטומטי',
  QUOTATION_AUTO_TANAKH: 'ציטוט אוטומטי מהתנ״ך',
};

function normalizeConnectionType(category: string | undefined): string {
  const raw = (category ?? '').trim();
  if (!raw) return 'OTHER';
  const normalized = HEBREW_TYPE_ALIASES[raw] ?? raw.toUpperCase().replace(/[\s-]+/gu, '_');
  return TYPE_ALIASES[normalized] ?? normalized;
}

/** Mirrors Otzaria LinkTypes.isDependentTextLink. */
export function isReaderDependentTextLink(category: string | undefined): boolean {
  const raw = (category ?? '').trim();
  return HEBREW_DEPENDENT_TYPES.has(raw) || DEPENDENT_TEXT_TYPES.has(normalizeConnectionType(raw));
}

/** Mirrors TargetLineLinksService._partition: virtual SOURCE and inline ranges
 * are not reference-menu entries; all other non-dependent links are references. */
export function isReaderReferenceLink(
  category: string | undefined,
  start?: unknown,
  end?: unknown,
): boolean {
  if (start != null || end != null) return false;
  const type = normalizeConnectionType(category);
  return type !== 'SOURCE' && !isReaderDependentTextLink(category);
}

export function readerConnectionTypeLabel(category: string | undefined): string {
  const raw = (category ?? '').trim();
  const normalized = normalizeConnectionType(raw);
  return TYPE_LABELS[normalized] ?? (raw || 'לא מסווג');
}

function plainPreview(value: string): string {
  const plain = (value || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/\s+/gu, ' ')
    .trim();
  return plain.length > 160 ? plain.slice(0, 157).trimEnd() + '…' : plain;
}

/** Deduplicates by exact target ID when available, otherwise title and line. */
export function groupReaderReferenceLinks(
  links: readonly CommentaryLink[],
): ReaderReferenceMenuItem[] {
  const seen = new Set<string>();
  const items: ReaderReferenceMenuItem[] = [];

  for (const link of links) {
    const title = link.sourceBook.trim();
    if (!title || !Number.isInteger(link.line) || link.line < 1) continue;
    const bookId = link.targetBookId;
    const key = (bookId == null ? title : String(bookId)) + '\u0000' + link.line;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      ...(bookId == null ? {} : { bookId }),
      title,
      categoryLabel: readerConnectionTypeLabel(link.category),
      line: link.line,
      reference: link.dibburHamatchil?.trim() || '',
      preview: plainPreview(link.text),
    });
  }

  return items;
}
