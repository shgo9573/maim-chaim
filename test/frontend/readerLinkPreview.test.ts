import assert from 'node:assert/strict';
import test from 'node:test';
import { placeReaderLinkPreview } from '../../src/utils/readerLinkPreview';

const viewport = { width: 1200, height: 800 };

test('RTL preview opens to the left of the reference item when space is available', () => {
  const position = placeReaderLinkPreview(
    { left: 700, right: 940, top: 180, bottom: 220 },
    viewport,
    'rtl',
  );

  assert.deepEqual(position, { left: 372, top: 180, width: 320, maxHeight: 240 });
});

test('LTR preview opens to the right of the reference item when space is available', () => {
  const position = placeReaderLinkPreview(
    { left: 120, right: 360, top: 180, bottom: 220 },
    viewport,
    'ltr',
  );

  assert.deepEqual(position, { left: 368, top: 180, width: 320, maxHeight: 240 });
});

test('preview flips to the other side when the preferred side has no room', () => {
  const position = placeReaderLinkPreview(
    { left: 20, right: 250, top: 180, bottom: 220 },
    viewport,
    'rtl',
  );

  assert.deepEqual(position, { left: 258, top: 180, width: 320, maxHeight: 240 });
});

test('preview stays inside the viewport near the lower-right corner', () => {
  const position = placeReaderLinkPreview(
    { left: 1080, right: 1190, top: 760, bottom: 790 },
    viewport,
    'rtl',
  );

  assert.deepEqual(position, { left: 752, top: 552, width: 320, maxHeight: 240 });
});

test('preview width and height shrink to fit a narrow mobile viewport', () => {
  const position = placeReaderLinkPreview(
    { left: 4, right: 40, top: 700, bottom: 730 },
    { width: 360, height: 640 },
    'rtl',
  );

  assert.deepEqual(position, { left: 32, top: 392, width: 320, maxHeight: 240 });
});

test('very small viewports never produce negative dimensions or off-screen coordinates', () => {
  const position = placeReaderLinkPreview(
    { left: 0, right: 30, top: 0, bottom: 20 },
    { width: 20, height: 24 },
    'rtl',
  );

  assert.deepEqual(position, { left: 8, top: 8, width: 4, maxHeight: 8 });
});
