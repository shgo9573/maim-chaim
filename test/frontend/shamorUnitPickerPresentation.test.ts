import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const picker = readFileSync(new URL('../../src/components/ShamorUnitPicker.tsx', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../src/components/ShamorZachor.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('Shamor range endpoints use the source-style anchored searchable dropdown', () => {
  assert.ok(screen.includes('<ShamorUnitPicker ariaLabel="יחידת התחלה"'));
  assert.ok(screen.includes('<ShamorUnitPicker ariaLabel="יחידת סיום"'));
  assert.ok(!screen.includes('<datalist'));
  assert.ok(!screen.includes('list="shamor-unit-options"'));
  assert.ok(styles.includes('@source "./components/ShamorUnitPicker.tsx";'));
});

test('unit picker exposes an accessible listbox and keyboard navigation', () => {
  assert.ok(picker.includes('aria-haspopup="dialog"'));
  assert.ok(picker.includes('role="combobox"'));
  assert.ok(picker.includes('role="listbox"'));
  assert.ok(picker.includes('role="option"'));
  assert.ok(picker.includes('aria-activedescendant'));
  assert.ok(picker.includes("event.key === 'ArrowDown'"));
  assert.ok(picker.includes("event.key === 'ArrowUp'"));
  assert.ok(picker.includes("event.key === 'Enter'"));
  assert.ok(picker.includes("event.key === 'Escape'"));
});

test('unit picker keeps exact selection callbacks and closes on outside interaction', () => {
  assert.ok(picker.includes('onChange(nextQuery)'));
  assert.ok(picker.includes('onChange(option.value)'));
  assert.ok(picker.includes("document.addEventListener('pointerdown'"));
  assert.ok(picker.includes('useVirtualizer'));
  assert.ok(picker.includes("virtualizer.scrollToIndex(nextIndex, { align: 'auto' })"));
  assert.ok(screen.includes('findShamorUnitOptionIndex(selected.units, value)'));
});
