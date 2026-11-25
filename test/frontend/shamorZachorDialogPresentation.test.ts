import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../../src/components/ShamorZachor.tsx', import.meta.url), 'utf8');

test('add-books dialog follows the Otzaria large-dialog frame', () => {
  assert.ok(component.includes('sm:max-w-[720px]'));
  assert.ok(component.includes('sm:max-h-[85vh]'));
  assert.ok(component.includes('sm:rounded-lg'));
  assert.ok(component.includes('Library size={20}'));
  assert.ok(component.includes('בחר ספרים מעץ הספרייה. הספרים שייבחרו יתווספו לרשימת "בתהליך".'));
  assert.ok(component.includes('placeholder="חיפוש ספר..."'));
});

test('category and book rows retain Otzaria tree indentation and icon hierarchy', () => {
  assert.ok(component.includes('paddingInlineStart: `${16 + depth * 24}px`'));
  assert.ok(component.includes('paddingInlineStart: `${8 + depth * 24}px`'));
  assert.ok(component.includes('<ChevronRight size={16}'));
  assert.ok(component.includes('<Folder size={20}'));
  assert.ok(component.includes('<BookOpen size={16}'));
  assert.ok(component.includes('text-[15px]'));
  assert.ok(!component.includes('{node.count}'));
});

test('selection count and add action remain visible without decorative controls', () => {
  assert.ok(component.includes('נבחרו {selectedAddIds.length}'));
  assert.ok(component.includes('<Plus size={18}'));
  assert.ok(component.includes('`הוסף (${selectedAddIds.length})`'));
});
