import DOMPurify from 'dompurify';

/**
 * רשימת תגיות HTML מאושרות ובטוחות עבור ספרי קודש ומפרשים באוצריא
 */
export const ALLOWED_BOOK_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'span', 'div', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'mark', 'small', 'big', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'a'
];

/**
 * רשימת תכונות (attributes) מאושרות עבור עיצוב טקסט וקישורים פנימיים
 */
export const ALLOWED_BOOK_ATTR = [
  'class', 'style', 'id', 'href', 'title', 'target', 'rel',
  'data-line', 'data-book', 'data-ref', 'data-word-index', 'data-amud'
];

/**
 * מחטא תוכן ספרים ומפרשים מפני התקפות XSS תוך שמירה על עיצוב הטקסט, כותרות והדגשות
 */
export function sanitizeBookHtml(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
  
  return DOMPurify.sanitize(dirtyHtml, {
    ALLOWED_TAGS: ALLOWED_BOOK_TAGS,
    ALLOWED_ATTR: ALLOWED_BOOK_ATTR,
    ALLOW_DATA_ATTR: true,
  });
}

/**
 * מחטא קטעי תקציר מתוצאות חיפוש ומאפשר רק תגיות הדגשה בטוחות
 */
export function sanitizeSnippetHtml(snippet: string): string {
  if (!snippet || typeof snippet !== 'string') return '';
  
  // המרת תגיות הדגשה מקודדות לצורת HTML
  const normalized = snippet
    .replace(/&lt;b&gt;/gi, '<b>')
    .replace(/&lt;\/b&gt;/gi, '</b>')
    .replace(/&lt;em&gt;/gi, '<b>')
    .replace(/&lt;\/em&gt;/gi, '</b>')
    .replace(/<em>/gi, '<b>')
    .replace(/<\/em>/gi, '</b>');

  return DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: ['b', 'strong', 'mark', 'span', 'em', 'small', 'i'],
    ALLOWED_ATTR: ['class']
  });
}
