// src/services/talmudPages.ts — מגיש דף בודד מתוך סריקת המסכת, בלי להוריד את כל הכרך
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildOcrRows, dafToPage, pageToDaf, readPageTextItems, type OcrPage } from '../utils/dafOcr.js';

export type Amud = 'a' | 'b';

export type DafPage = { buffer: Buffer; page: number; cached: boolean };

/**
 * How many tractate volumes may stay parsed in memory at once.
 * A parsed volume is what makes a second page request cost milliseconds.
 */
const SOURCE_CACHE_LIMIT = 2;

const sourceCache = new Map<string, Promise<PDFDocument>>();

function rememberSource(filePath: string, doc: PDFDocument) {
  sourceCache.delete(filePath);
  sourceCache.set(filePath, Promise.resolve(doc));
  while (sourceCache.size > SOURCE_CACHE_LIMIT) {
    const oldest = sourceCache.keys().next().value;
    if (!oldest) break;
    sourceCache.delete(oldest);
  }
}

function loadSource(filePath: string): Promise<PDFDocument> {
  const known = sourceCache.get(filePath);
  if (known) {
    // Refresh its place in the LRU order.
    sourceCache.delete(filePath);
    sourceCache.set(filePath, known);
    return known;
  }
  const loading = fs.promises
    .readFile(filePath)
    .then((bytes) => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }))
    .catch((error) => {
      sourceCache.delete(filePath);
      throw error;
    });
  sourceCache.set(filePath, loading);
  return loading;
}

/** Drops the parsed volumes, e.g. after the local library was replaced. */
export function clearTalmudPageCache() {
  sourceCache.clear();
}

/**
 * A page that was written halfway — a process killed mid-write, a disk that filled up —
 * still looks like a PDF by its size, but the browser paints it as an empty sheet: the
 * trailer is missing, so most of its objects are lost. Such a file is re-cut.
 */
export function isCompletePdf(buffer: Buffer): boolean {
  // Nothing this small can hold a page, and a real daf is hundreds of kilobytes.
  if (buffer.length <= 200) return false;
  if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) return false;
  return buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'));
}

/**
 * Whether a cut daf can actually be opened, not merely whether it ends properly.
 * A file that was cached in an earlier run can carry a valid header and footer and still
 * fail to parse, and the browser then shows „cannot display” for that one daf only.
 */
export async function isReadableDafPdf(buffer: Buffer): Promise<boolean> {
  if (!isCompletePdf(buffer)) return false;
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount() === 1;
  } catch {
    return false;
  }
}

function isUsablePdf(filePath: string): boolean {
  try {
    return isCompletePdf(fs.readFileSync(filePath));
  } catch {
    return false;
  }
}

/**
 * Returns one daf as a stand-alone one-page PDF.
 *
 * The full tractate scan is 20–40 MB, and a reader that only wants daf מ״ז downloaded
 * the whole volume every time. The page is cut once on the server and then cached on
 * disk, so opening a daf costs a single page instead of the whole tractate.
 */
export async function sliceDafPage(options: {
  sourcePath: string;
  cacheDir: string;
  slug: string;
  startDaf: number;
  daf: number;
  amud: Amud;
  /** Cut the daf again even if a file for it is already cached. */
  fresh?: boolean;
  maxPage?: number;
}): Promise<DafPage | null> {
  const { sourcePath, cacheDir, slug, startDaf, daf, amud } = options;
  if (!fs.existsSync(sourcePath)) return null;

  const pageNumber = dafToPage(daf, amud, startDaf);
  if (options.maxPage && pageNumber > options.maxPage) return null;

  const cachedPath = path.join(cacheDir, `${slug}_${daf}_${amud}.pdf`);
  if (!options.fresh && isUsablePdf(cachedPath)) {
    return { buffer: await fs.promises.readFile(cachedPath), page: pageNumber, cached: true };
  }

  const source = await loadSource(sourcePath);
  if (pageNumber > source.getPageCount()) return null;

  const single = await PDFDocument.create();
  const [page] = await single.copyPages(source, [pageNumber - 1]);
  single.addPage(page);
  const buffer = Buffer.from(await single.save());

  try {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    // Write under a temporary name first, so a half-written file is never served.
    const temporary = `${cachedPath}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, buffer);
    await fs.promises.rename(temporary, cachedPath);
  } catch (error: any) {
    console.warn('[TalmudPages] Could not persist the sliced daf:', error.message);
  }

  return { buffer, page: pageNumber, cached: false };
}

export type OcrIndex = { pages: OcrPage[]; total: number };

type IndexJob = {
  pages: OcrPage[];
  done: boolean;
  nextPage: number;
  total: number;
  error?: string;
};

const indexJobs = new Map<string, IndexJob>();

function indexCachePath(cacheDir: string, slug: string) {
  return path.join(cacheDir, `${slug}_ocr.json`);
}

function readCachedIndex(cacheDir: string, slug: string): OcrPage[] | null {
  try {
    const raw = fs.readFileSync(indexCachePath(cacheDir, slug), 'utf8');
    const parsed = JSON.parse(raw) as { pages?: OcrPage[] };
    return Array.isArray(parsed.pages) && parsed.pages.length ? parsed.pages : null;
  } catch {
    return null;
  }
}

function writeCachedIndex(cacheDir: string, slug: string, pages: OcrPage[]) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(indexCachePath(cacheDir, slug), JSON.stringify({ pages }));
  } catch (error: any) {
    console.warn('[TalmudPages] Could not persist the OCR index:', error.message);
  }
}

/** Reads the text layer of a page as readable rows, in reading order. */
async function pageText(doc: pdfjsLib.PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const items = await readPageTextItems(page);
  return buildOcrRows(items).map((row) => row.text).join('\n');
}

/**
 * Builds (once per tractate) an index of what the OCR of every page actually says.
 * The text layer of the scan is the OCR, so this is the searchable text of the print.
 * Progress is kept in memory and the finished index on disk, so later searches are
 * instant and two readers never build the same tractate twice.
 */
export function startOcrIndex(options: {
  sourcePath: string;
  cacheDir: string;
  slug: string;
  startDaf: number;
  maxDaf: number;
}): IndexJob {
  const { sourcePath, cacheDir, slug, startDaf } = options;
  const running = indexJobs.get(slug);
  if (running && !running.error) return running;

  const cached = readCachedIndex(cacheDir, slug);
  if (cached) {
    const job: IndexJob = { pages: cached, done: true, nextPage: cached.length, total: cached.length };
    indexJobs.set(slug, job);
    return job;
  }

  const job: IndexJob = { pages: [], done: false, nextPage: 0, total: 0 };
  indexJobs.set(slug, job);

  void (async () => {
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      const bytes = await fs.promises.readFile(sourcePath);
      doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
      job.total = doc.numPages;
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const text = await pageText(doc, pageNumber);
        const { daf, amud } = pageToDaf(pageNumber, startDaf);
        // Pages past the last daf of the tractate (blank leaves, indexes) are not part of it.
        if (daf > options.maxDaf) continue;
        job.pages.push({ daf, amud, page: pageNumber, text });
        job.nextPage = pageNumber;
      }
      writeCachedIndex(cacheDir, slug, job.pages);
      job.done = true;
    } catch (error: any) {
      job.error = error?.message || 'index failed';
      console.warn('[TalmudPages] OCR index failed:', job.error);
      indexJobs.delete(slug);
    } finally {
      if (doc) await doc.destroy().catch(() => undefined);
    }
  })();

  return job;
}

export function ocrIndexStatus(slug: string): IndexJob | undefined {
  return indexJobs.get(slug);
}
