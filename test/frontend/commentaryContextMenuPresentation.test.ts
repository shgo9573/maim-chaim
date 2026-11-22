import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/components/CommentaryPanel.tsx', import.meta.url), 'utf8');
const menuStart = source.indexOf('{contextMenu && typeof document');
const menuEnd = source.indexOf('\n        document.body,', menuStart);
const menu = source.slice(menuStart, menuEnd);

test('commentary context menu puts the two implemented source quick actions in the icon row', () => {
  assert.ok(menuStart >= 0 && menuEnd > menuStart, 'commentary context menu is present');
  assert.ok(menu.includes('aria-label="פעולות מהירות"'));
  assert.ok(menu.includes("action.id === 'search-selection'"));
  assert.ok(menu.includes("action.id === 'copy-selection'"));
  assert.ok(menu.includes('<Library size={18} strokeWidth={1.8} />'));
  assert.ok(menu.includes('<Copy size={18} strokeWidth={1.8} />'));
  assert.ok(menu.includes('min-w-12 max-w-24'));
  assert.ok(menu.includes('role="menuitem"'));
});

test('commentary menu follows Otzaria menu width, radius, padding, elevation and row density', () => {
  assert.ok(menu.includes("width: isCommentaryContextMenu ? 'max-content' : 264"));
  assert.ok(menu.includes('minWidth: isCommentaryContextMenu ? 150 : undefined'));
  assert.ok(menu.includes('rounded-lg bg-surface-1 p-2 text-on-surface shadow-md'));
  assert.ok(menu.includes('flex min-h-9 w-full'));
  assert.ok(menu.includes('Eraser size={18}'));
  assert.ok(menu.includes('FileText size={18}'));
  assert.ok(menu.includes('FilePlus2 size={18}'));
});

test('commentary header is omitted while personal-note menus keep their existing header and styling', () => {
  assert.ok(menu.includes("contextMenu.kind !== 'commentary'"));
  assert.ok(menu.includes('rounded-xl border border-outline-variant bg-surface p-1.5 text-on-surface shadow-2xl'));
  assert.ok(menu.includes("contextMenu.kind === 'personal-note' ? 'הערה אישית' : 'עריכת הערה'"));
});

test('quick actions and list items still call the existing action handler', () => {
  assert.equal((menu.match(/runContextMenuAction\(action.id\)/g) || []).length, 2);
  assert.ok(source.includes('getCommentaryContextMenuActions({'));
});
