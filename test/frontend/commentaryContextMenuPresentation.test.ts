import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../src/components/CommentaryPanel.tsx', import.meta.url),
  'utf8',
);
const iconSource = readFileSync(
  new URL('../../src/components/ReaderActionIcon.tsx', import.meta.url),
  'utf8',
);
const menuStart = source.indexOf('{contextMenu && typeof document');
const menuEnd = source.indexOf('\n        document.body,', menuStart);
const menu = source.slice(menuStart, menuEnd);

test('commentary quick actions reuse the reader Fluent library and copy glyphs', () => {
  assert.ok(menuStart >= 0 && menuEnd > menuStart, 'commentary context menu is present');
  assert.ok(source.includes("import ReaderActionIcon from './ReaderActionIcon';"));
  assert.ok(menu.includes("<ReaderActionIcon name={action.id === 'search-selection' ? 'library' : 'copy'} />"));
  assert.ok(iconSource.includes('data-icon={`fluent-${name}-24-regular`}'));
  assert.ok(iconSource.includes('width={18} height={18}'));
});

test('commentary context menu uses the reader menu surface and vertical padding', () => {
  assert.ok(menu.includes('rounded-lg bg-surface-2 py-2 text-on-surface shadow-md'));
  assert.ok(!menu.includes('rounded-lg bg-surface-1 p-2 text-on-surface shadow-md'));
  assert.ok(menu.includes('flex min-h-9 w-full'));
  assert.ok(menu.includes('Eraser size={18}'));
  assert.ok(menu.includes('FileText size={18}'));
  assert.ok(menu.includes('FilePlus2 size={18}'));
});

test('quick actions retain the existing order and do not introduce unimplemented actions', () => {
  assert.ok(source.includes("action.id === 'search-selection' || action.id === 'copy-selection'"));
  assert.ok(source.includes("action.id !== 'search-selection' && action.id !== 'copy-selection'"));
  assert.ok(menu.includes('aria-label="פעולות מהירות"'));
  assert.ok(menu.includes('min-w-12 max-w-24'));
  assert.ok(menu.includes('role="menuitem"'));
});

test('personal-note and personal-note-editor menus keep their separate presentation', () => {
  assert.ok(menu.includes("contextMenu.kind !== 'commentary'"));
  assert.ok(menu.includes('rounded-xl border border-outline-variant bg-surface p-1.5 text-on-surface shadow-2xl'));
  assert.ok(menu.includes("contextMenu.kind === 'personal-note' ? 'הערה אישית' : 'עריכת הערה'"));
});

test('quick actions and list items retain their existing callbacks and menu semantics', () => {
  assert.equal((menu.match(/runContextMenuAction\(action.id\)/g) || []).length, 2);
  assert.ok(source.includes('getCommentaryContextMenuActions({'));
  assert.ok(menu.includes('role="none"'));
});
