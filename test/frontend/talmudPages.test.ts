import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { isCompletePdf, isReadableDafPdf, sliceDafPage } from '../../src/services/talmudPages';

/**
 * A miniature stand-in for a tractate volume: the first daf is PDF page 1 and the
 * pages alternate a/b, exactly like the scans the server keeps on disk.
 */
async function buildVolume(directory: string) {
  const doc = await PDFDocument.create();
  for (let page = 0; page < 6; page += 1) {
    const sheet = doc.addPage([595, 842]);
    sheet.drawText(`page ${page + 1}`, { x: 40, y: 800, size: 12 });
  }
  const bytes = await doc.save();
  const file = path.join(directory, 'nedarim.pdf');
  writeFileSync(file, bytes);
  return file;
}

test('cuts a single daf out of the volume and keeps it for the next visit', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'talmud-pages-'));
  try {
    const sourcePath = await buildVolume(directory);
    const cacheDir = path.join(directory, 'cache');
    const options = { sourcePath, cacheDir, slug: 'nedarim', startDaf: 2, daf: 4, amud: 'b' as const };

    const first = await sliceDafPage(options);
    assert.ok(first);
    // daf ד ע״ב is the sixth page of the volume (first daf is page 1, pages alternate).
    assert.equal(first.page, 6);
    const single = await PDFDocument.load(first.buffer);
    assert.equal(single.getPageCount(), 1);
    assert.deepEqual(single.getPage(0).getSize(), { width: 595, height: 842 });
    assert.ok(first.buffer.length < readFileSync(sourcePath).length, 'the daf is smaller than the volume');

    const cachedPath = path.join(cacheDir, 'nedarim_4_b.pdf');
    assert.ok(existsSync(cachedPath), 'the sliced daf is written to the cache directory');

    const second = await sliceDafPage(options);
    assert.ok(second);
    assert.deepEqual(second.buffer, first.buffer);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('maps each daf to its own page and refuses pages the volume does not have', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'talmud-pages-'));
  try {
    const sourcePath = await buildVolume(directory);
    const cacheDir = path.join(directory, 'cache');
    const base = { sourcePath, cacheDir, slug: 'nedarim', startDaf: 2 };

    assert.equal((await sliceDafPage({ ...base, daf: 2, amud: 'a' }))?.page, 1);
    assert.equal((await sliceDafPage({ ...base, daf: 2, amud: 'b' }))?.page, 2);
    assert.equal((await sliceDafPage({ ...base, daf: 4, amud: 'a' }))?.page, 5);

    // The volume ends in the middle of daf ד, so the next amud is simply unavailable.
    assert.equal(await sliceDafPage({ ...base, daf: 5, amud: 'a' }), null);
    assert.equal(await sliceDafPage({ ...base, sourcePath: path.join(directory, 'missing.pdf'), daf: 2, amud: 'a' }), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a page that was written halfway is not served', async () => {
  // A file cut short keeps its size but loses its trailer, and the browser paints it as
  // an empty sheet. Such a file must be recognised, so it is re-cut instead of shown.
  const dir = mkdtempSync(path.join(tmpdir(), 'daf-pdf-'));
  try {
    const sourcePath = path.join(dir, 'volume.pdf');
    const volume = await PDFDocument.create();
    for (let page = 0; page < 4; page += 1) volume.addPage([595, 842]);
    writeFileSync(sourcePath, await volume.save());

    const options = { sourcePath, cacheDir: path.join(dir, 'cache'), slug: 'demo', startDaf: 2, daf: 2, amud: 'a' as const };
    const sliced = await sliceDafPage(options);
    assert.ok(sliced);
    assert.equal(isCompletePdf(sliced.buffer), true);

    // The first slice is cached; a truncated cache file is replaced by a real one.
    const cachedPath = path.join(dir, 'cache', 'demo_2_a.pdf');
    writeFileSync(cachedPath, sliced.buffer.subarray(0, Math.floor(sliced.buffer.length / 2)));
    assert.equal(isCompletePdf(readFileSync(cachedPath)), false);
    const again = await sliceDafPage(options);
    assert.ok(again);
    assert.equal(again.cached, false);
    assert.equal(isCompletePdf(readFileSync(cachedPath)), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects buffers that are too small, not a PDF, or unfinished', () => {
  const header = Buffer.from('%PDF-1.7\n');
  const trailer = Buffer.from('\nstartxref\n0\n%%EOF\n');
  const filler = Buffer.alloc(20000, 0x20);

  assert.equal(isCompletePdf(Buffer.concat([header, filler, trailer])), true);
  assert.equal(isCompletePdf(Buffer.concat([header, filler])), false);
  assert.equal(isCompletePdf(Buffer.concat([Buffer.from('GIF89a'), filler, trailer])), false);
  assert.equal(isCompletePdf(Buffer.concat([header, Buffer.alloc(100), trailer])), false);
});

// A file can carry a proper header and footer and still be unopenable — the browser then
// shows „cannot display this page” for that one daf while every other daf is fine.
test('a cut with a header and footer but no readable page is rejected', async () => {
  const broken = Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.from('garbage body that no parser can turn into a page\n'.repeat(20)),
    Buffer.from('%%EOF\n'),
  ]);
  assert.equal(isCompletePdf(broken), true);
  assert.equal(await isReadableDafPdf(broken), false);
});

test('a cut that truly holds one daf is accepted', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const bytes = Buffer.from(await doc.save());
  assert.equal(await isReadableDafPdf(bytes), true);
});

test('fresh=1 cuts the daf again instead of reusing the cached file', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'otzaria-fresh-'));
  try {
    const source = await buildVolume(directory);
    const cacheDir = path.join(directory, 'cache');
    const first = await sliceDafPage({ sourcePath: source, cacheDir, slug: 'nedarim', startDaf: 2, daf: 2, amud: 'a' });
    assert.equal(first?.cached, false);
    const second = await sliceDafPage({ sourcePath: source, cacheDir, slug: 'nedarim', startDaf: 2, daf: 2, amud: 'a' });
    assert.equal(second?.cached, true);
    const again = await sliceDafPage({ sourcePath: source, cacheDir, slug: 'nedarim', startDaf: 2, daf: 2, amud: 'a', fresh: true });
    assert.equal(again?.cached, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
