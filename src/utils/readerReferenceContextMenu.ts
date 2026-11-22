import type { CommentaryLink } from '../types';

export interface ReaderReferenceMenuItem {
  key: string;
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

const TYPE_ALIASES: Record<string, string> = {
  SUPERCOMMENTARY: 'SUPER_COMMENTARY',
  MISHNAHINTALMUD: 'MISHNAH_IN_TALMUD',
  RELATEDPASSAGE: 'RELATED_PASSAGE',
  QUOTATIONAUTO: 'QUOTATION_AUTO',
  QUOTATIONAUTOTANAKH: 'QUOTATION_AUTO_TANAKH',
  SIFREIMITZVOT: 'SIFREI_MITZVOT',
};

const TYPE_LABELS: Record<string, string> = {
  REFERENCE: 'עיון',
  QUOTATION: 'ציטוט',
  MESORAT_HASHAS: 'מסורת הש״ס',
  EIN_MISHPAT: 'עין משפט',
  MISHNAH_IN_TALMUD: 'משנה בתלמוד',
  RELATED: 'נושא קרוב',
  RELATED_PASSAGE: 'קטע קשור',
  OTHER: 'לא מסווג',
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
  const normalized = raw.toUpperCase().replace(/[\s-]+/gu, '_');
  return TYPE_ALIASES[normalized] ?? normalized;
}

/** Matches Otzaria's reader split: dependent-text links are commentaries;
 * unanchored non-dependent links are references; SOURCE is virtual. */
export function isReaderReferenceLink(
  category: string | undefined,
  start?: unknown,
  end?: unknown,
): boolean {
  if (start != null || end != null) return false;
  const raw = (category ?? '').trim();
  if (HEBREW_DEPENDENT_TYPES.has(raw)) return false;
  const type = normalizeConnectionType(raw);
  return type !== 'SOURCE' && !DEPENDENT_TEXT_TYPES.has(type);
}

export function readerConnectionTypeLabel(category: string | undefined): string {
  const raw = (category ?? '').trim();
  if (!raw) return 'לא מסווג';
  if (/[\u0590-\u05FF]/u.test(raw)) return raw;
  const normalized = normalizeConnectionType(raw);
  return TYPE_LABELS[normalized] ?? raw;
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

/** Deduplicates by target book and line, preserving source order. */
export function groupReaderReferenceLinks(
  links: readonly CommentaryLink[],
): ReaderReferenceMenuItem[] {
  const seen = new Set<string>();
  const items: ReaderReferenceMenuItem[] = [];

  for (const link of links) {
    const title = link.sourceBook.trim();
    if (!title || !Number.isInteger(link.line) || link.line < 1) continue;
    const key = title + '\u0000' + link.line;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      title,
      categoryLabel: readerConnectionTypeLabel(link.category),
      line: link.line,
      reference: link.dibburHamatchil?.trim() || '',
      preview: plainPreview(link.text),
    });
  }

  return items;
}
