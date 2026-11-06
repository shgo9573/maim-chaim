import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Bundle the matching PDF.js worker with the site instead of depending on an external CDN.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

export type PdfTextLayerItem = { str?: string; x: number; y: number; w: number; h: number; fontSize: number };

/**
 * A canvas the browser cannot allocate — which happens on very wide windows, on
 * fullscreen displays and at high device pixel ratios — is not an error: drawing into
 * it is silently ignored and the reader is left with an empty page. The painted page is
 * therefore kept well below the browser's canvas limits.
 */
const MAX_CANVAS_PIXELS = 32_000_000;
const MAX_CANVAS_SIDE = 8192;

/** A daf that has not even opened by now is treated as failed, so the reader is not stuck. */
const PDF_LOAD_TIMEOUT_MS = 30000;
/** A paint that never finishes (a scan this browser cannot decode) gives way to the server's picture. */
const RENDER_TIMEOUT_MS = 45000;

/** Below this share of dark pixels the page is blank: a real daf is around 10%. */
const BLANK_PAGE_INK = 0.002;

/** Share of dark pixels in a page, measured on a small copy so it stays cheap. */
function measureInk(page: HTMLCanvasElement): number {
  const probe = document.createElement('canvas');
  probe.width = 180;
  probe.height = Math.max(1, Math.round((probe.width * page.height) / Math.max(1, page.width)));
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, probe.width, probe.height);
  ctx.drawImage(page, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let ink = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] < 200 && data[index + 1] < 200 && data[index + 2] < 200) ink += 1;
  }
  return ink / (probe.width * probe.height);
}

/** A one-line reason for the reader, and something specific to quote to support. */
function describePdfError(error: any): string {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  if (/Jbig2/i.test(name + message)) return 'פענוח תמונת הסריקה של הדף נכשל (JBIG2).';
  if (/Jpx|JPEG2000/i.test(name + message)) return 'פענוח תמונת הסריקה של הדף נכשל (JPEG 2000).';
  if (/Unexpected server response \((\d+)\)/.test(message)) {
    return `השרת לא החזיר את הדף (${message.match(/Unexpected server response \((\d+)\)/)?.[1]}).`;
  }
  if (/MissingPDF/i.test(name + message)) return 'קובץ הדף לא נמצא בשרת.';
  if (/InvalidPDF|Invalid PDF/i.test(name + message)) return 'קובץ הדף פגום.';
  if (/worker/i.test(message)) return 'רכיב הקריאה של PDF לא נטען.';
  return message ? message.slice(0, 140) : 'שגיאה לא ידועה בטעינת הדף.';
}

interface SimplePdfViewerProps {
  url: string;
  imageUrl?: string;
  /** A server-rendered picture of the same page, used when the browser cannot paint the PDF. */
  fallbackImageUrl?: string;
  textFallbackUrl?: string;
  overlay?: React.ReactNode;
  onPageTextContent?: (items: PdfTextLayerItem[], pageWidth: number, pageHeight: number) => void;
  zoomLevel?: number; // percentage, default 100
  rotation?: number; // 0, 90, 180, 270
  pdfInvert?: boolean;
  isDarkTheme?: boolean;
  pageNumber?: number;
  onPageChange?: (newPage: number, totalPages: number) => void;
  title?: string;
  /** 'width' fills the width (vertical scroll), 'height' shows the whole page. */
  fitMode?: 'width' | 'height';
}

export const SimplePdfViewer: React.FC<SimplePdfViewerProps> = ({
  url,
  imageUrl,
  fallbackImageUrl,
  textFallbackUrl,
  overlay,
  onPageTextContent,
  zoomLevel = 100,
  rotation = 0,
  pdfInvert = false,
  isDarkTheme = false,
  pageNumber = 1,
  onPageChange,
  title,
  fitMode = 'width'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Why the page could not be shown — short, for the reader, and logged in full.
  const [problem, setProblem] = useState<string | null>(null);
  // Set when this daf is asked for again after the server handed back something unusable.
  const [freshPdfUrl, setFreshPdfUrl] = useState<string | null>(null);
  const activePdfUrl = freshPdfUrl ?? url;
  // A page the PDF could not paint is shown as the server's own picture of that page,
  // so a missing or undecodable scan never turns into an empty grey page.
  const [serverImageUrl, setServerImageUrl] = useState<string | null>(null);
  const activeImageUrl = imageUrl ?? serverImageUrl ?? undefined;
  const [renderFailed, setRenderFailed] = useState<boolean>(false);
  // Bumped when the reader asks for the page to be drawn again.
  const [renderNonce, setRenderNonce] = useState<number>(0);
  const [useImageMode, setUseImageMode] = useState<boolean>(!!imageUrl);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderedPdfImage, setRenderedPdfImage] = useState<{ url: string; width: number; height: number; rotation: number } | null>(null);
  const renderedPdfImageUrlRef = useRef<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const pdfDocUrlRef = useRef<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(pageNumber);
  const latestPageNumberRef = useRef(pageNumber);
  latestPageNumberRef.current = pageNumber;

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight - 120 : 800
  });

  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (renderedPdfImageUrlRef.current) {
        URL.revokeObjectURL(renderedPdfImageUrlRef.current);
        renderedPdfImageUrlRef.current = null;
      }
    };
  }, []);

  // ResizeObserver to track container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sync the requested page without reloading the full PDF document.
  useEffect(() => {
    const requested = Math.max(1, Math.floor(pageNumber || 1));
    const bounded = pdfDoc ? Math.min(requested, totalPages) : requested;
    if (bounded !== currentPage) setCurrentPage(bounded);
  }, [pageNumber, pdfDoc, totalPages]);

  // Every daf starts from a clean slate. Without this, a daf that could not be shown
  // left its error behind, and moving forward or back kept the reader stuck on it.
  useEffect(() => {
    setServerImageUrl(null);
    setRenderFailed(false);
    setErrorMsg(null);
    setProblem(null);
    setIsLoading(true);
    setImageLoaded(false);
    setImageNaturalSize(null);
    setRenderedPdfImage(null);
    setFreshPdfUrl(null);
    if (renderedPdfImageUrlRef.current) {
      URL.revokeObjectURL(renderedPdfImageUrlRef.current);
      renderedPdfImageUrlRef.current = null;
    }
  }, [url, pageNumber]);

  // Handle image mode loading
  useEffect(() => {
    if (activeImageUrl) {
      setUseImageMode(true);
      setIsLoading(true);
      setErrorMsg(null);
      setImageLoaded(false);
      setImageNaturalSize(null);

      const img = new Image();
      img.onload = () => {
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);
        setIsLoading(false);
        if (onPageChange) onPageChange(1, 1);
      };
      img.onerror = () => {
        // A server picture that fails is the end of the road: retrying the PDF that
        // could not be painted would only start the same loop again.
        if (activeImageUrl === serverImageUrl) {
          console.warn('[SimplePdfViewer] Server picture of the page failed to load:', activeImageUrl);
          setIsLoading(false);
          setProblem('גם התמונה שהשרת הכין לדף הזה לא נטענה.');
          setErrorMsg('לא ניתן היה להציג את הדף.');
          return;
        }
        console.warn('[SimplePdfViewer] Page image failed to load, falling back to PDF stream:', activeImageUrl);
        setUseImageMode(false);
      };
      img.src = activeImageUrl;
    } else {
      setUseImageMode(false);
    }
  }, [activeImageUrl, serverImageUrl]);

  // Load PDF document from URL when not using image mode
  useEffect(() => {
    if (useImageMode) return;

    const pdfUrl = freshPdfUrl ?? url;

    let isMounted = true;
    setIsLoading(true);
    setErrorMsg(null);
    pdfDocUrlRef.current = null;
    setPdfDoc(null);
    setRenderedPdfImage(null);
    setServerImageUrl(null);
    setRenderFailed(false);
    if (renderedPdfImageUrlRef.current) {
      URL.revokeObjectURL(renderedPdfImageUrlRef.current);
      renderedPdfImageUrlRef.current = null;
    }

    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;
    const loadPdf = async () => {
      try {
        // Load by URL instead of buffering the entire PDF in JS memory. PDF.js can use
        // HTTP byte ranges so a large volume is fetched on demand from the local server.
        // Tzurat HaDaf asks for one daf at a time, which the server cuts for itself.
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/standard_fonts/`
        });

        // A server still cutting the daf, or a stalled worker, must end in an error the
        // reader can act on rather than a spinner that never stops.
        let loadTimer: ReturnType<typeof setTimeout> | undefined;
        let doc: pdfjsLib.PDFDocumentProxy;
        try {
          doc = await Promise.race([
            loadingTask.promise,
            new Promise<never>((_, reject) => {
              loadTimer = setTimeout(() => {
                void loadingTask.destroy().catch(() => undefined);
                reject(new Error('הדף לא נטען בזמן.'));
              }, PDF_LOAD_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (loadTimer) clearTimeout(loadTimer);
        }
        if (!isMounted) {
          void doc.destroy();
          return;
        }
        loadedDoc = doc;

        const requestedPage = Math.max(1, Math.floor(latestPageNumberRef.current || 1));
        const selectedPage = Math.min(requestedPage, doc.numPages);
        pdfDocUrlRef.current = pdfUrl;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(selectedPage);
        setIsLoading(false);

        if (onPageChange) {
          onPageChange(selectedPage, doc.numPages);
        }
      } catch (err: any) {
        console.error('[SimplePdfViewer] Error loading PDF:', pdfUrl, err);
        if (!isMounted) return;
        setIsLoading(false);
        // A cut that was cached on the server in an earlier run can be unreadable while
        // every other daf is fine. Asking for it once more makes the server cut it again.
        if (!freshPdfUrl && /\/api\/tzurat-hadaf\/page\b/.test(url)) {
          const retryUrl = `${url}${url.includes('?') ? '&' : '?'}fresh=1&ts=${Date.now()}`;
          console.warn('[SimplePdfViewer] This daf could not be read; asking the server to cut it again:', retryUrl);
          setFreshPdfUrl(retryUrl);
          return;
        }
        // The PDF itself could not be read here (a missing daf, a server error, a file
        // this browser refuses). The server's picture of the same page can still be shown.
        if (fallbackImageUrl) {
          console.warn('[SimplePdfViewer] The PDF did not load; showing the server picture of the page');
          setServerImageUrl(fallbackImageUrl);
          return;
        }
        setProblem(describePdfError(err));
        setErrorMsg(err?.message || 'לא ניתן לטעון את תצוגת ה-PDF');
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      // Each page is its own document now, so leaving it alive would keep a worker per daf.
      const opened = loadedDoc;
      loadedDoc = null;
      if (opened) {
        if (pdfDocUrlRef.current === pdfUrl) pdfDocUrlRef.current = null;
        void opened.destroy().catch(() => undefined);
      }
    };
  }, [url, freshPdfUrl, useImageMode]);

  // In image mode, read the matching one-daf PDF only for text coordinates.
  // The displayed scan and bubble geometry therefore belong to the same requested daf.
  useEffect(() => {
    if (!useImageMode || !textFallbackUrl || !onPageTextContent) return;
    let cancelled = false;
    let textDoc: pdfjsLib.PDFDocumentProxy | null = null;
    const extractPage = async (page: any) => {
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      const text = await page.getTextContent();
      const items: PdfTextLayerItem[] = [];
      for (const raw of text.items as any[]) {
        if (!raw || typeof raw.str !== 'string' || !raw.transform) continue;
        const transform = raw.transform as number[];
        const [x, baseline] = viewport.convertToViewportPoint(transform[4], transform[5]);
        const h = Math.max(0.4, Number(raw.height) || Math.hypot(transform[2] || 0, transform[3] || 0));
        items.push({
          str: raw.str,
          x,
          y: baseline - h,
          w: Math.abs(Number(raw.width) || 0),
          h,
          fontSize: Math.hypot(transform[2] || 0, transform[3] || 0) || Math.abs(transform[3] || 0),
        });
      }
      return { items, width: viewport.width, height: viewport.height };
    };
    const loadText = async () => {
      try {
        const task = pdfjsLib.getDocument({
          url: textFallbackUrl,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
        });
        textDoc = await task.promise;
        if (cancelled) return;
        const page = await textDoc.getPage(1);
        const extracted = await extractPage(page);
        if (!cancelled) onPageTextContent(extracted.items, extracted.width, extracted.height);
      } catch (error) {
        if (!cancelled) console.warn('[SimplePdfViewer] Could not read per-daf text layer for image overlay:', error);
      } finally {
        if (textDoc) {
          await textDoc.destroy().catch(() => undefined);
          textDoc = null;
        }
      }
    };
    void loadText();
    return () => {
      cancelled = true;
      if (textDoc) void textDoc.destroy().catch(() => undefined);
    };
  }, [useImageMode, activeImageUrl, textFallbackUrl, onPageTextContent]);

  // Read the selected page's text layer once per page for the bubble overlay.
  // The page may be shown as the server's picture while the PDF itself is loaded — the
  // bubbles still belong to that PDF page, so its text layer is read either way.
  useEffect(() => {
    if ((useImageMode && !serverImageUrl) || !pdfDoc || !onPageTextContent || pdfDocUrlRef.current !== activePdfUrl ||
        currentPage !== Math.min(Math.max(1, Math.floor(pageNumber || 1)), pdfDoc.numPages)) return;
    let cancelled = false;
    const extractPage = async (page: any) => {
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      const text = await page.getTextContent();
      const items: PdfTextLayerItem[] = [];
      for (const raw of text.items as any[]) {
        if (!raw || typeof raw.str !== 'string' || !raw.transform) continue;
        const transform = raw.transform as number[];
        const [x, baseline] = viewport.convertToViewportPoint(transform[4], transform[5]);
        const h = Math.max(0.4, Number(raw.height) || Math.hypot(transform[2] || 0, transform[3] || 0));
        items.push({
          str: raw.str,
          x,
          y: baseline - h,
          w: Math.abs(Number(raw.width) || 0),
          h,
          fontSize: Math.hypot(transform[2] || 0, transform[3] || 0) || Math.abs(transform[3] || 0),
        });
      }
      return { items, width: viewport.width, height: viewport.height };
    };
    const readPageText = async () => {
      let fallbackDoc: pdfjsLib.PDFDocumentProxy | null = null;
      try {
        const page = await pdfDoc.getPage(Math.min(Math.max(1, currentPage), pdfDoc.numPages));
        let extracted = await extractPage(page);
        // Prefer the per-daf PDF for bubble geometry whenever it exposes a usable
        // text layer. The full-volume PDF can contain a large but unusable scan/OCR
        // layer, so counting words alone from that file is not a reliable quality test.
        // The visible page remains the local full-volume PDF; only overlay coordinates
        // and text matching come from the same daf's single-page PDF.
        const usefulWords = extracted.items.filter(item => typeof item.str === 'string' && item.str.trim().length > 0).length;
        if (!cancelled && textFallbackUrl && textFallbackUrl !== url) {
          try {
            const task = pdfjsLib.getDocument({
              url: textFallbackUrl,
              cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
              cMapPacked: true,
              standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
            });
            fallbackDoc = await task.promise;
            if (!cancelled) {
              const fallbackPage = await fallbackDoc.getPage(1);
              const fallback = await extractPage(fallbackPage);
              const fallbackWords = fallback.items.filter(item => typeof item.str === 'string' && item.str.trim().length > 0).length;
              // A per-daf layer with 80+ words is usable even if the full tractate
              // has more extracted strings. For sparse layers, prefer the source
              // with more text rather than replacing a good layer with an empty one.
              if (fallbackWords >= 80 || (usefulWords < 80 && fallbackWords > usefulWords)) {
                extracted = fallback;
              }
            }
          } catch (fallbackError) {
            if (!cancelled) console.warn('[SimplePdfViewer] Per-daf text fallback failed:', fallbackError);
          } finally {
            if (fallbackDoc) {
              await fallbackDoc.destroy().catch(() => undefined);
              fallbackDoc = null;
            }
          }
        }
        if (!cancelled && pdfDocUrlRef.current === activePdfUrl && latestPageNumberRef.current === pageNumber) {
          onPageTextContent(extracted.items, extracted.width, extracted.height);
        }
      } catch (error) {
        if (!cancelled) console.warn('[SimplePdfViewer] Unable to read PDF text layer:', error);
      }
    };
    void readPageText();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, pageNumber, useImageMode, serverImageUrl, onPageTextContent, textFallbackUrl, url, activePdfUrl]);

  /**
   * Whether the page asks for anything to be drawn at all. A page with no text and no
   * images is simply empty, and an empty page must be shown as it is; one that does ask
   * for drawing but comes out blank is a page this browser could not paint.
   */
  const pageContentKind = async (page: any): Promise<{ draws: boolean; image: boolean }> => {
    try {
      const ops = await page.getOperatorList();
      const fns = ops.fnArray as number[];
      const images = new Set<number>([
        pdfjsLib.OPS.paintImageXObject,
        pdfjsLib.OPS.paintInlineImageXObject,
        pdfjsLib.OPS.paintImageMaskXObject,
        pdfjsLib.OPS.paintImageXObjectRepeat,
        pdfjsLib.OPS.paintImageMaskXObjectRepeat,
      ].filter((value) => typeof value === 'number'));
      const texts = new Set<number>([pdfjsLib.OPS.showText, pdfjsLib.OPS.showSpacedText]);
      return {
        image: fns.some((fn) => images.has(fn)),
        draws: fns.some((fn) => images.has(fn) || texts.has(fn)),
      };
    } catch {
      return { draws: true, image: false };
    }
  };

  // Render the PDF with PDF.js to an off-screen canvas, then display it as an image.
  // This matches the supplied ZIP's layout: the image keeps the PDF's natural aspect ratio,
  // while the clickable bubble layer uses the exact same page frame.
  useEffect(() => {
    if (useImageMode || renderFailed || !pdfDoc || pdfDocUrlRef.current !== activePdfUrl ||
        currentPage !== Math.min(Math.max(1, Math.floor(pageNumber || 1)), pdfDoc.numPages)) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const pageNumToRender = Math.min(Math.max(1, currentPage), pdfDoc.numPages);
        const page = await pdfDoc.getPage(pageNumToRender);
        if (!isMounted || pdfDocUrlRef.current !== activePdfUrl || latestPageNumberRef.current !== pageNumber) return;

        const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
        const availWidth = Math.max(300, containerSize.width - 32);
        const availHeight = Math.max(400, containerSize.height - 32);
        const fitWidthScale = availWidth / unscaledViewport.width;
        const fitHeightScale = availHeight / unscaledViewport.height;
        // Fill the width and scroll vertically, or show the whole page at once.
        const autoFitScale = fitMode === 'height' ? fitHeightScale : fitWidthScale;
        const userScale = autoFitScale * (zoomLevel / 100);
        const dpr = window.devicePixelRatio || 1;
        // Render at a higher pixel density than the CSS display size to reduce scan softness.
        const renderResolutionScale = Math.min(3.5, Math.max(dpr, 2.5));
        // …but never past what the browser can actually paint.
        const capScale = Math.min(
          Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, unscaledViewport.width * unscaledViewport.height)),
          MAX_CANVAS_SIDE / Math.max(unscaledViewport.width, unscaledViewport.height),
        );
        const paintScale = Math.max(0.5, Math.min(userScale * renderResolutionScale, capScale));

        const displayWidth = unscaledViewport.width * userScale;
        const displayHeight = unscaledViewport.height * userScale;

        const paintPage = async (scale: number) => {
          const viewport = page.getViewport({ scale, rotation });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('לא ניתן ליצור משטח ציור ל-PDF');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const task = page.render({ canvasContext: ctx, viewport, background: '#ffffff' } as any);
          renderTaskRef.current = task;
          // A scan the browser struggles to decode (a very large JBIG2 image, a device low on
          // memory) can leave the paint running forever with nothing on screen. Past this
          // point the page is treated as failed so the reader gets the picture instead.
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              task.promise,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  try { task.cancel(); } catch {}
                  reject(new Error('הציור של הדף לא הסתיים בזמן.'));
                }, RENDER_TIMEOUT_MS);
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
          return canvas;
        };

        const content = await pageContentKind(page);
        let renderCanvas = await paintPage(paintScale);
        let ink = measureInk(renderCanvas);
        // A scanned daf is 10–20% ink, so an almost uniform sheet means the paint itself
        // failed — a canvas the browser refused, or a scan it could not decode and only
        // the paper fill of which was drawn. Such a page is painted again at a smaller
        // size, which is often all a page that ran out of memory needs.
        const blank = () => content.draws && ink < (content.image ? 0.01 : BLANK_PAGE_INK);
        const attempts = [Math.max(1, paintScale * 0.6), Math.min(1.5, paintScale)];
        for (const scale of attempts) {
          if (!blank()) break;
          console.warn('[SimplePdfViewer] The page came out blank; painting it again', {
            url,
            page: pageNumToRender,
            canvas: [renderCanvas.width, renderCanvas.height],
            scale,
            ink,
          });
          renderCanvas = await paintPage(scale);
          ink = measureInk(renderCanvas);
        }

        if (!isMounted || pdfDocUrlRef.current !== activePdfUrl || latestPageNumberRef.current !== pageNumber) return;

        if (blank()) {
          console.warn('[SimplePdfViewer] The page could not be painted here', {
            url,
            page: pageNumToRender,
            canvas: [renderCanvas.width, renderCanvas.height],
            ink,
            fallback: Boolean(fallbackImageUrl),
          });
          if (fallbackImageUrl) {
            setIsLoading(false);
            setServerImageUrl(fallbackImageUrl);
            return;
          }
          setIsLoading(false);
          setProblem('הדפדפן לא הצליח לצייר את הסריקה של הדף, ולשרת אין תמונה חלופית.');
          setRenderFailed(true);
          return;
        }

        const blob = await new Promise<Blob>((resolve, reject) => {
          renderCanvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('לא ניתן להמיר את הדף לתמונה'));
          }, 'image/png');
        });

        if (!isMounted || pdfDocUrlRef.current !== activePdfUrl || latestPageNumberRef.current !== pageNumber) return;

        const nextUrl = URL.createObjectURL(blob);
        const previousUrl = renderedPdfImageUrlRef.current;
        renderedPdfImageUrlRef.current = nextUrl;
        setRenderFailed(false);
        setServerImageUrl(null);
        setRenderedPdfImage({
          url: nextUrl,
          width: displayWidth,
          height: displayHeight,
          rotation
        });
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        renderCanvas.width = 0;
        renderCanvas.height = 0;
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
        console.warn('[SimplePdfViewer] Page render error:', err);
        if (!isMounted) return;
        setIsLoading(false);
        // A page that cannot be drawn at all is still readable as the server's picture.
        if (fallbackImageUrl) {
          setServerImageUrl(fallbackImageUrl);
        } else {
          setRenderFailed(true);
        }
      }
    };

    void renderPage();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, currentPage, pageNumber, url, activePdfUrl, zoomLevel, rotation, containerSize, useImageMode, fitMode, fallbackImageUrl, renderNonce, renderFailed]);

  // Fit the high-resolution one-daf scan into the stage, as in the supplied ZIP.
  // The page can scroll when the user deliberately increases the zoom.
  const imageDisplaySize = useMemo(() => {
    if (!imageNaturalSize) return null;
    const rotated = Math.abs(rotation) % 180 === 90;
    const fitWidth = rotated ? imageNaturalSize.height : imageNaturalSize.width;
    const fitHeight = rotated ? imageNaturalSize.width : imageNaturalSize.height;
    const availableWidth = Math.max(300, containerSize.width - 36);
    const availableHeight = Math.max(300, containerSize.height - 36);
    const fitScale = Math.min(availableWidth / fitWidth, availableHeight / fitHeight, 1.45);
    const scale = fitScale * (zoomLevel / 100);
    return {
      width: fitWidth * scale,
      height: fitHeight * scale,
      imageWidth: imageNaturalSize.width * scale,
      imageHeight: imageNaturalSize.height * scale,
    };
  }, [imageNaturalSize, containerSize.width, containerSize.height, zoomLevel, rotation]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className={`w-full h-full min-w-0 flex flex-col ${zoomLevel > 100 ? 'items-start' : 'items-center'} justify-start overflow-auto relative select-none p-1.5 sm:p-3 ${
        isDarkTheme ? 'bg-[#120D0A]' : 'bg-stone-900/10'
      }`}
    >
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100/90 dark:bg-stone-900/90 z-20 backdrop-blur-xs">
          <div className="w-10 h-10 border-4 border-amber-800 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-serif font-bold text-amber-950 dark:text-amber-300">
            טוען את צורת הדף…
          </p>
        </div>
      )}

      {/* The page could not be shown. The reader can always try again, open the file,
          and — most importantly — keep moving between dapim. */}
      {(errorMsg || renderFailed) && !isLoading && (
        <div className="my-auto p-6 max-w-md text-center bg-white dark:bg-stone-900 border border-amber-300 dark:border-stone-700 rounded-2xl shadow-lg">
          <p className="text-sm font-bold text-amber-950 dark:text-amber-200 mb-2">
            לא הצלחנו להציג את הדף הזה
          </p>
          <p className="text-xs text-stone-600 dark:text-stone-400 mb-2">
            אפשר לנסות שוב, לדפדף לדף אחר, או לפתוח את הקובץ עצמו בחלון חדש.
          </p>
          {(problem || errorMsg) && (
            <p className="mb-4 text-[11px] text-stone-400 dark:text-stone-500 break-words">
              {problem || errorMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setProblem(null);
                setRenderFailed(false);
                setServerImageUrl(null);
                setIsLoading(true);
                setRenderNonce(value => value + 1);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-800 text-white rounded-xl text-xs font-bold hover:bg-amber-900 transition-colors"
            >
              נסה שוב
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold hover:bg-amber-50 dark:hover:bg-stone-800 transition-colors"
            >
              פתח PDF בחלון חדש
            </a>
          </div>
        </div>
      )}

      {/* One-daf scan with the selectable bubble overlay attached to the same page frame. */}
      {useImageMode && imageLoaded && !errorMsg && imageDisplaySize && (
        <div
          className={`my-3 sm:my-4 relative shrink-0 overflow-hidden rounded-xl border shadow-2xl ${isDarkTheme ? 'border-stone-800 bg-stone-950' : 'border-amber-200/80 bg-white'}`}
          style={{ width: imageDisplaySize.width + 2, height: imageDisplaySize.height + 2, filter: pdfInvert ? 'invert(0.92) hue-rotate(180deg) contrast(1.05)' : 'none' }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: imageDisplaySize.imageWidth,
              height: imageDisplaySize.imageHeight,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
          >
            <img
              ref={imageRef}
              src={activeImageUrl}
              alt={title || 'צורת הדף'}
              draggable={false}
              className="absolute inset-0 block h-full w-full select-none"
            />
            {overlay && <div className="absolute inset-0 z-10">{overlay}</div>}
          </div>
        </div>
      )}

      {/* PDF rendered to an image, matching the proportions used by the supplied ZIP. */}
      {!useImageMode && !errorMsg && renderedPdfImage && (
        <div
          className={`my-3 sm:my-4 shadow-2xl rounded-xl overflow-hidden border shrink-0 relative ${
            isDarkTheme ? 'border-stone-800 bg-stone-950' : 'border-amber-200/80 bg-white'
          }`}
          style={{
            width: renderedPdfImage.width,
            height: renderedPdfImage.height,
            filter: pdfInvert ? 'invert(0.92) hue-rotate(180deg)' : 'none'
          }}
        >
          <img
            ref={imageRef}
            src={renderedPdfImage.url}
            alt={title || 'צורת הדף'}
            draggable={false}
            className="block select-none"
            style={{ width: renderedPdfImage.width, height: 'auto', maxWidth: 'none', maxHeight: 'none' }}
          />
          {overlay && (
            <div
              className="absolute left-1/2 top-1/2 z-10"
              style={{
                width: Math.abs(renderedPdfImage.rotation) % 180 === 90 ? renderedPdfImage.height : renderedPdfImage.width,
                height: Math.abs(renderedPdfImage.rotation) % 180 === 90 ? renderedPdfImage.width : renderedPdfImage.height,
                transform: `translate(-50%, -50%) rotate(${renderedPdfImage.rotation}deg)`,
              }}
            >
              {overlay}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SimplePdfViewer;
