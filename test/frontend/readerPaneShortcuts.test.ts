import assert from 'node:assert/strict';
import test from 'node:test';
import { getReaderPaneShortcutAction, type ReaderPaneShortcutEvent } from '../../src/utils/readerPaneShortcuts';

function keyEvent(overrides: Partial<ReaderPaneShortcutEvent> = {}): ReaderPaneShortcutEvent {
  return {
    key: 'c',
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    defaultPrevented: false,
    repeat: false,
    ...overrides,
  };
}

test('Ctrl+Shift+C toggles the commentary pane', () => {
  assert.equal(getReaderPaneShortcutAction(keyEvent()), 'toggle-commentary');
  assert.equal(getReaderPaneShortcutAction(keyEvent({ key: 'C' })), 'toggle-commentary');
});

test('Ctrl+Shift+L toggles the navigation pane', () => {
  assert.equal(getReaderPaneShortcutAction(keyEvent({ key: 'l' })), 'toggle-navigation');
});

test('Meta+Shift shortcuts work on Mac keyboards', () => {
  assert.equal(
    getReaderPaneShortcutAction(keyEvent({ ctrlKey: false, metaKey: true })),
    'toggle-commentary',
  );
  assert.equal(
    getReaderPaneShortcutAction(keyEvent({ key: 'l', ctrlKey: false, metaKey: true })),
    'toggle-navigation',
  );
});

test('pane shortcuts require the exact modifier family', () => {
  assert.equal(getReaderPaneShortcutAction(keyEvent({ ctrlKey: false })), null);
  assert.equal(getReaderPaneShortcutAction(keyEvent({ shiftKey: false })), null);
  assert.equal(getReaderPaneShortcutAction(keyEvent({ altKey: true })), null);
  assert.equal(getReaderPaneShortcutAction(keyEvent({ defaultPrevented: true })), null);
  assert.equal(getReaderPaneShortcutAction(keyEvent({ repeat: true })), null);
  assert.equal(getReaderPaneShortcutAction(keyEvent({ key: 'x' })), null);
});
