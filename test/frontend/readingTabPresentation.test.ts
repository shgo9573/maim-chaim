import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readingScreen = readFileSync(new URL('../../src/components/ReadingScreen.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('רצועת הטאבים שומרת על מידות ואייקונים הקרובים למקור אוצריא', () => {
  assert.match(readingScreen, /max-w-\\[140px\\]/);
  assert.match(readingScreen, /min-w-\\[60px\\]/);
  assert.match(readingScreen, /rounded-t-lg/);
  assert.match(readingScreen, /Pin size=\\{14\\}/);
  assert.match(readingScreen, /SearchIcon size=\\{14\\}/);
  assert.match(readingScreen, /X size=\\{12\\}/);
  assert.match(readingScreen, /bg-sec-container text-on-sec-container/);
});

test('כותרת חיפוש מציגה את השאילתה לצד אייקון החיפוש, בלי קידומת כפולה', () => {
  assert.match(readingScreen, /const displayTitle = t\\.kind === 'search'/);
  assert.match(readingScreen, /title=\\{displayTitle\\}/);
});

test('כפתור הסגירה מתאים לריחוף, מיקוד, מגע ורוחב צר', () => {
  assert.match(styles, /\\.reader-tab-close/);
  assert.match(styles, /@container \\(min-width: 80px\\)/);
  assert.match(styles, /@media \\(hover: none\\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(readingScreen, /data-active=\\{isActive\\}/);
  assert.match(readingScreen, /data-selected=\\{isSelected\\}/);
});
