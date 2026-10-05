'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { AdvancedPrintConfig, PaperSize, ColorMode, PrintSides, PricingConfig } from '@/types';
import { UploadedFileState } from './FileUploader';
import { CanvaStudioCanvas, CanvaImageItem } from './CanvaStudioCanvas';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  HelpCircle,
  X,
  FileText,
  Sliders,
  Edit,
  Sparkles,
} from '@/components/ui/Icons';

interface AdobePrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  pageCount?: number;
  fileSignedUrl?: string;
  previewUrl?: string;
  fileType?: string;
  uploadedFile?: UploadedFileState | null;
  paperSize: PaperSize;
  colorMode: ColorMode;
  printSides: PrintSides;
  copies?: number;
  pricing?: PricingConfig;
  advancedConfig: AdvancedPrintConfig;
  onSaveAdvancedConfig: (updated: AdvancedPrintConfig) => void;
  onPaperSizeChange?: (val: PaperSize) => void;
  onColorModeChange?: (val: ColorMode) => void;
  onPrintSidesChange?: (val: PrintSides) => void;
  onCopiesChange?: (val: number) => void;
  onProceedToOrder?: () => void;
  onApplyCanvasLayout?: (file: File) => Promise<void> | void;
  batchFiles?: Array<{ name: string; file: File; id?: string }>;
}

// Cached PDF.js module promise so it's loaded only once across the whole app
let cachedPdfJs: any = null;
let cachedPdfJsPromise: Promise<any> | null = null;
export function getPdfJs() {
  if (cachedPdfJs) return Promise.resolve(cachedPdfJs);
  if (!cachedPdfJsPromise) {
    cachedPdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      cachedPdfJs = mod;
      // Keep PDF parsing in a dedicated browser worker. Resolving this module
      // URL lets Next bundle the PDF.js 6 ESM worker instead of executing an
      // old CommonJS worker-entry module in the page context.
      cachedPdfJs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return cachedPdfJs;
    });
  }
  return cachedPdfJsPromise;
}

// Global bounded LRU cache for parsed PDF documents to prevent memory exhaustion
const MAX_PARSED_DOCS = 2;
const parsedDocCache = new Map<string, any>();

function cacheParsedDoc(key: string, doc: any) {
  if (!key || !doc) return;
  if (parsedDocCache.has(key)) {
    parsedDocCache.delete(key);
  } else if (parsedDocCache.size >= MAX_PARSED_DOCS) {
    const oldestKey = parsedDocCache.keys().next().value;
    if (oldestKey) {
      const oldestDoc = parsedDocCache.get(oldestKey);
      try {
        oldestDoc?.cleanup?.();
        oldestDoc?.destroy?.();
      } catch {}
      parsedDocCache.delete(oldestKey);
    }
  }
  parsedDocCache.set(key, doc);
}

function clearCanvasCache(cache: Map<string, HTMLCanvasElement>) {
  cache.forEach((canvas) => {
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {}
  });
  cache.clear();
}

export const AdobePrintPreviewModal: React.FC<AdobePrintPreviewModalProps> = ({
  isOpen,
  onClose,
  fileName = 'Uploaded_Document.pdf',
  pageCount = 1,
  fileSignedUrl,
  previewUrl,
  fileType,
  uploadedFile,
  paperSize,
  colorMode,
  printSides,
  copies = 1,
  pricing,
  advancedConfig,
  onSaveAdvancedConfig,
  onPaperSizeChange,
  onColorModeChange,
  onPrintSidesChange,
  onCopiesChange,
  onProceedToOrder,
  onApplyCanvasLayout,
  batchFiles,
}) => {
  // --- Canva Studio State ---
  const [viewMode, setViewMode] = useState<'preview' | 'canva'>('preview');
  const [canvaSnapshotUrl, setCanvaSnapshotUrl] = useState<string | null>(null);
  const [savedCanvaItems, setSavedCanvaItems] = useState<CanvaImageItem[]>([]);

  // --- Sidebar Settings State ---
  const [modalCopies, setModalCopies] = useState<number>(copies || 1);
  const [modalLayout, setModalLayout] = useState<'PORTRAIT' | 'LANDSCAPE'>(
    advancedConfig.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT'
  );
  const [pageRangeMode, setPageRangeMode] = useState<'ALL' | 'RANGE'>(
    advancedConfig.pageRangeMode === 'RANGE' ? 'RANGE' : 'ALL'
  );
  const [customPageRange, setCustomPageRange] = useState<string>(
    advancedConfig.customPageRange || ''
  );
  const [modalColorMode, setModalColorMode] = useState<ColorMode>(colorMode || 'BW');

  // More Settings accordion
  const [showMoreSettings, setShowMoreSettings] = useState<boolean>(true);
  const [modalPaperSize, setModalPaperSize] = useState<PaperSize>(paperSize || 'A4');
  const [scaleMode, setScaleMode] = useState<'FIT' | 'ACTUAL' | 'CUSTOM'>(
    advancedConfig.pageScaling === 'ACTUAL'
      ? 'ACTUAL'
      : advancedConfig.pageScaling === 'CUSTOM'
      ? 'CUSTOM'
      : 'FIT'
  );
  const [customScalePercent, setCustomScalePercent] = useState<number>(
    advancedConfig.customScalePercent || 100
  );
  const [pagesPerSheet, setPagesPerSheet] = useState<'1' | '2' | '4'>(
    advancedConfig.pagesPerSheet === '2' || advancedConfig.pagesPerSheet === '4'
      ? advancedConfig.pagesPerSheet
      : '1'
  );
  const [modalPrintSides, setModalPrintSides] = useState<PrintSides>(printSides || 'SINGLE');
  const [watermark, setWatermark] = useState<'NONE' | 'CONFIDENTIAL' | 'DRAFT' | 'SAMPLE'>(
    advancedConfig.watermark || 'NONE'
  );

  // Mobile View Switcher (Settings vs Preview)
  const [mobileTab, setMobileTab] = useState<'preview' | 'settings'>('preview');

  // --- Canvas & Viewer State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotationAngle, setRotationAngle] = useState<number>(advancedConfig.rotationAngle || 0);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);

  // PDF Document rendering state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [pdfPageCount, setPdfPageCount] = useState<number>(pageCount || 1);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // In-memory raster caches for 0ms instantaneous canvas rendering & page navigation
  const pdfPageCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const imageElementCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const totalDocPages = pdfPageCount > 0 ? pdfPageCount : pageCount > 0 ? pageCount : 1;

  // Sync state with incoming props when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setModalCopies(copies || 1);
    setModalColorMode(colorMode || 'BW');
    setModalPaperSize(paperSize || 'A4');
    setModalPrintSides(printSides || 'SINGLE');
    setModalLayout(advancedConfig.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT');
    setPageRangeMode(advancedConfig.pageRangeMode === 'RANGE' ? 'RANGE' : 'ALL');
    setCustomPageRange(advancedConfig.customPageRange || '');
    setScaleMode(
      advancedConfig.pageScaling === 'ACTUAL'
        ? 'ACTUAL'
        : advancedConfig.pageScaling === 'CUSTOM'
        ? 'CUSTOM'
        : 'FIT'
    );
    setCustomScalePercent(advancedConfig.customScalePercent || 100);
    setPagesPerSheet(
      advancedConfig.pagesPerSheet === '2' || advancedConfig.pagesPerSheet === '4'
        ? advancedConfig.pagesPerSheet
        : '1'
    );
    setWatermark(advancedConfig.watermark || 'NONE');
    setCurrentPage(1);
    setZoomLevel(100);
    setRotationAngle(advancedConfig.rotationAngle || 0);
  }, [isOpen, copies, colorMode, paperSize, printSides, advancedConfig]);

  const buildUpdatedConfig = useCallback((): AdvancedPrintConfig => ({
    pageRangeMode,
    customPageRange,
    pagesPerSheet,
    pageScaling: scaleMode,
    customScalePercent,
    orientation: modalLayout === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT',
    rotationAngle: ((rotationAngle % 360) + 360) % 360,
    printQuality: advancedConfig.printQuality || 'STANDARD',
    watermark,
  }), [
    pageRangeMode,
    customPageRange,
    pagesPerSheet,
    scaleMode,
    customScalePercent,
    modalLayout,
    rotationAngle,
    advancedConfig.printQuality,
    watermark,
  ]);

  const applyAllSettings = useCallback((proceedToOrder = false) => {
    const updatedConfig = buildUpdatedConfig();
    onSaveAdvancedConfig(updatedConfig);
    if (onPaperSizeChange && modalPaperSize !== paperSize) {
      onPaperSizeChange(modalPaperSize);
    }
    if (onColorModeChange && modalColorMode !== colorMode) {
      onColorModeChange(modalColorMode);
    }
    if (onPrintSidesChange && modalPrintSides !== printSides) {
      onPrintSidesChange(modalPrintSides);
    }
    if (onCopiesChange && modalCopies !== copies) {
      onCopiesChange(modalCopies);
    }

    if (proceedToOrder) {
      if (onProceedToOrder) {
        onProceedToOrder();
      } else {
        onClose();
      }
    }
  }, [
    buildUpdatedConfig,
    onSaveAdvancedConfig,
    onPaperSizeChange,
    modalPaperSize,
    paperSize,
    onColorModeChange,
    modalColorMode,
    colorMode,
    onPrintSidesChange,
    modalPrintSides,
    printSides,
    onCopiesChange,
    modalCopies,
    copies,
    onProceedToOrder,
    onClose,
  ]);

  const handleCloseModal = useCallback(() => {
    applyAllSettings(false);
    onClose();
  }, [applyAllSettings, onClose]);

  // Lock body scroll and handle Esc key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleCloseModal();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleCloseModal]);

  // Create Object URL for uploaded local file
  useEffect(() => {
    if (uploadedFile?.file) {
      try {
        const url = URL.createObjectURL(uploadedFile.file);
        setLocalObjectUrl(url);
        return () => {
          URL.revokeObjectURL(url);
          setLocalObjectUrl(null);
        };
      } catch (e) {
        console.error('Failed to create object URL:', e);
      }
    } else {
      setLocalObjectUrl(null);
    }
  }, [uploadedFile?.file]);

  const activePreviewUrl =
    localObjectUrl || (uploadedFile?.file ? undefined : (previewUrl || fileSignedUrl || uploadedFile?.previewUrl || uploadedFile?.signedUrl));
  const isBw = modalColorMode === 'BW';

  const isImgFile = useMemo(() => {
    const name = (fileName || uploadedFile?.fileName || uploadedFile?.file?.name || '').toLowerCase();
    const type = (fileType || uploadedFile?.fileType || uploadedFile?.file?.type || '').toLowerCase();

    // If it is explicitly a PDF, NEVER treat as an image
    if (type === 'application/pdf' || type.includes('pdf') || name.endsWith('.pdf')) {
      return false;
    }

    return (
      type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(name)
    );
  }, [fileType, uploadedFile?.fileType, uploadedFile?.file, fileName, uploadedFile?.fileName]);

  const canvaInitialImages = useMemo(() => {
    const list: Array<{ url: string; name: string }> = [];
    if (activePreviewUrl && (isImgFile || !fileName?.toLowerCase().endsWith('.pdf'))) {
      list.push({ url: activePreviewUrl, name: fileName || 'Photo' });
    }
    if (batchFiles && batchFiles.length > 0) {
      batchFiles.forEach((b) => {
        if (b.file && (b.file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(b.name))) {
          try {
            list.push({ url: URL.createObjectURL(b.file), name: b.name });
          } catch {}
        }
      });
    }
    return list;
  }, [activePreviewUrl, isImgFile, fileName, batchFiles]);

  const handleApplyCanvaLayout = async (renderedFile: File, previewDataUrl?: string) => {
    if (previewDataUrl) {
      setCanvaSnapshotUrl(previewDataUrl);
      const img = new Image();
      img.src = previewDataUrl;
      imageElementCache.current.set(previewDataUrl, img);
    }
    try {
      const newUrl = URL.createObjectURL(renderedFile);
      setLocalObjectUrl(newUrl);
    } catch {}

    if (onApplyCanvasLayout) {
      await onApplyCanvasLayout(renderedFile);
    }
  };

  const isPdfFile = useMemo(() => {
    if (isImgFile) return false;
    const name = (fileName || uploadedFile?.fileName || uploadedFile?.file?.name || '').toLowerCase();
    const type = (fileType || uploadedFile?.fileType || uploadedFile?.file?.type || '').toLowerCase();

    return (
      type === 'application/pdf' ||
      type.includes('pdf') ||
      name.endsWith('.pdf') ||
      (!isImgFile && (!!uploadedFile || !!activePreviewUrl))
    );
  }, [isImgFile, fileType, uploadedFile, fileName, activePreviewUrl]);

  // Clear PDF rendering state and raster caches whenever document changes or modal opens
  useEffect(() => {
    if (!isOpen) return;
    setPdfDoc(null);
    setIsPdfLoading(isPdfFile);
    clearCanvasCache(pdfPageCache.current);
    imageElementCache.current.clear();
  }, [isOpen, uploadedFile?.file, uploadedFile?.uploadId, fileName, isPdfFile]);

  // --- Load actual uploaded PDF document ---
  useEffect(() => {
    if (!isOpen) return;
    if (!isPdfFile) return;

    let active = true;

    async function loadUploadedPdf() {
      try {
        const docCacheKey = uploadedFile?.file
          ? `${uploadedFile.file.name}_${uploadedFile.file.size}_${uploadedFile.file.lastModified}`
          : (uploadedFile?.uploadId && !uploadedFile.uploadId.startsWith('local-')
              ? uploadedFile.uploadId
              : activePreviewUrl) || '';

        if (docCacheKey && parsedDocCache.has(docCacheKey)) {
          const cachedDoc = parsedDocCache.get(docCacheKey);
          if (active) {
            setPdfDoc(cachedDoc);
            setPdfPageCount(cachedDoc.numPages);
            setIsPdfLoading(false);
          }
          return;
        }

        setIsPdfLoading(true);
        const pdfjs = await getPdfJs();

        let arrayBuffer: ArrayBuffer | undefined;
        if (uploadedFile?.file) {
          if (typeof uploadedFile.file.arrayBuffer === 'function') {
            arrayBuffer = await uploadedFile.file.arrayBuffer();
          } else {
            arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = reject;
              reader.readAsArrayBuffer(uploadedFile.file);
            });
          }
        } else if (activePreviewUrl) {
          const res = await fetch(activePreviewUrl);
          arrayBuffer = await res.arrayBuffer();
        }

        if (!active || !arrayBuffer) {
          if (active) setIsPdfLoading(false);
          return;
        }

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(arrayBuffer),
          stopAtErrors: false,
        });
        const doc = await loadingTask.promise;

        if (docCacheKey) {
          cacheParsedDoc(docCacheKey, doc);
        }

        if (active) {
          setPdfDoc(doc);
          setPdfPageCount(doc.numPages);
          setIsPdfLoading(false);
        }
      } catch (err) {
        console.error('Failed to load actual uploaded PDF for preview:', err);
        if (active) {
          setIsPdfLoading(false);
        }
      }
    }

    loadUploadedPdf();

    return () => {
      active = false;
    };
  }, [isOpen, isPdfFile, uploadedFile?.file, activePreviewUrl]);

  // Calculate selected pages array based on range mode
  const selectedPages = useMemo<number[]>(() => {
    if (pageRangeMode === 'ALL' || !customPageRange.trim()) {
      return Array.from({ length: totalDocPages }, (_, i) => i + 1);
    }
    try {
      const pageSet = new Set<number>();
      const parts = customPageRange.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-');
          const start = parseInt(startStr?.trim() || '', 10);
          const end = parseInt(endStr?.trim() || '', 10);
          if (!isNaN(start) && !isNaN(end)) {
            const minP = Math.max(1, Math.min(start, end));
            const maxP = Math.min(totalDocPages, Math.max(start, end));
            for (let p = minP; p <= maxP; p++) {
              pageSet.add(p);
            }
          }
        } else {
          const p = parseInt(trimmed, 10);
          if (!isNaN(p) && p >= 1 && p <= totalDocPages) {
            pageSet.add(p);
          }
        }
      }
      const sorted = Array.from(pageSet).sort((a, b) => a - b);
      return sorted.length > 0 ? sorted : Array.from({ length: totalDocPages }, (_, i) => i + 1);
    } catch {
      return Array.from({ length: totalDocPages }, (_, i) => i + 1);
    }
  }, [pageRangeMode, customPageRange, totalDocPages]);

  const selectedPageCount = selectedPages.length;

  // Number of pages per sheet (1, 2, or 4)
  const nUp = pagesPerSheet === '2' ? 2 : pagesPerSheet === '4' ? 4 : 1;

  // Total physical preview sheets needed to render selectedPages with nUp layout
  const totalSheetsToPreview = useMemo(() => {
    return Math.max(1, Math.ceil(selectedPages.length / nUp));
  }, [selectedPages.length, nUp]);

  // Keep currentPage within valid bounds when range or layout changes
  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalSheetsToPreview));
  }, [totalSheetsToPreview]);

  // Page numbers displayed on the currently viewed sheet
  const currentSheetPages = useMemo<number[]>(() => {
    const pages: number[] = [];
    for (let i = 0; i < nUp; i++) {
      const idx = (currentPage - 1) * nUp + i;
      if (idx < selectedPages.length) {
        pages.push(selectedPages[idx]);
      }
    }
    return pages;
  }, [currentPage, nUp, selectedPages]);

  // Dynamic calculation: "Total: X sheet(s) of paper"
  const totalSheets = useMemo(() => {
    const pagesOnSides = Math.ceil(selectedPageCount / nUp);
    const sidesFactor = modalPrintSides === 'DOUBLE' ? 2 : 1;
    const sheetsPerCopy = Math.ceil(pagesOnSides / sidesFactor);
    return Math.max(1, sheetsPerCopy * Math.max(1, modalCopies));
  }, [selectedPageCount, nUp, modalPrintSides, modalCopies]);

  // Aspect ratio calculation for the Paper Preview Canvas
  const isLandscape = modalLayout === 'LANDSCAPE';
  const paperAspectRatio = useMemo(() => {
    const size = (modalPaperSize || 'A4').toUpperCase();
    if (size === 'A3') return isLandscape ? 420 / 297 : 297 / 420;
    if (size === 'LEGAL') return isLandscape ? 14 / 8.5 : 8.5 / 14;
    if (size === 'LETTER') return isLandscape ? 11 / 8.5 : 8.5 / 11;
    if (size === 'TABLOID') return isLandscape ? 17 / 11 : 11 / 17;
    // Default A4
    return isLandscape ? 297 / 210 : 210 / 297;
  }, [modalPaperSize, isLandscape]);

  // Compute effective scale factor for drawing with deferred value for 120 FPS slider responsiveness
  const deferredCustomScale = useDeferredValue(customScalePercent);
  const effectiveScale = useMemo(() => {
    if (scaleMode === 'FIT') return 0.94;
    if (scaleMode === 'ACTUAL') return 1.0;
    return Math.min(3.0, Math.max(0.2, (deferredCustomScale || 100) / 100));
  }, [scaleMode, deferredCustomScale]);

  const drawPreviewUnavailable = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = '#475569';
      ctx.font = `600 ${Math.max(12, Math.round(width * 0.028))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Document preview is unavailable', x + width / 2, y + height / 2 - 10);
      ctx.fillStyle = '#64748b';
      ctx.font = `${Math.max(10, Math.round(width * 0.02))}px sans-serif`;
      ctx.fillText('Your original file will be used for printing.', x + width / 2, y + height / 2 + 16);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    },
    []
  );

  // Invalidate page raster cache when layout or paper changes
  useEffect(() => {
    pdfPageCache.current.clear();
    imageElementCache.current.clear();
  }, [isLandscape, pagesPerSheet, modalPaperSize]);

  // Helper to render uploaded image onto canvas slot
  const renderImageSlot = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      url: string,
      x: number,
      y: number,
      w: number,
      h: number
    ): Promise<void> => {
      const cachedImg = imageElementCache.current.get(url);
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        const imgAspect = cachedImg.width / cachedImg.height;
        const slotAspect = w / h;
        let drawW = w;
        let drawH = h;
        if (imgAspect > slotAspect) {
          drawH = w / imgAspect;
        } else {
          drawW = h * imgAspect;
        }
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        ctx.drawImage(cachedImg, drawX, drawY, drawW, drawH);
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        img.onload = () => {
          imageElementCache.current.set(url, img);
          const imgAspect = img.width / img.height;
          const slotAspect = w / h;
          let drawW = w;
          let drawH = h;
          if (imgAspect > slotAspect) {
            drawH = w / imgAspect;
          } else {
            drawW = h * imgAspect;
          }
          const drawX = x + (w - drawW) / 2;
          const drawY = y + (h - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          resolve();
        };
        img.onerror = () => {
          resolve();
        };
      });
    },
    []
  );

  // Helper to render real PDF page from uploaded document
  const renderPdfSlot = useCallback(
    async (
      ctx: CanvasRenderingContext2D,
      doc: any,
      pageNum: number,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      const cacheKey = `${doc.fingerprint || 'doc'}_${pageNum}_${Math.round(w)}_${Math.round(h)}`;
      const cached = pdfPageCache.current.get(cacheKey);
      if (cached) {
        const drawW = cached.width / 1.15;
        const drawH = cached.height / 1.15;
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        ctx.drawImage(cached, drawX, drawY, drawW, drawH);
        return;
      }

      try {
        const page = await doc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(w / unscaledViewport.width, h / unscaledViewport.height);
        const pixelRatio = 1.15;
        const viewport = page.getViewport({ scale: scale * pixelRatio });

        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.max(1, Math.min(3072, Math.round(viewport.width)));
        offCanvas.height = Math.max(1, Math.min(3072, Math.round(viewport.height)));
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return;

        await page.render({
          canvasContext: offCtx,
          viewport,
        }).promise;

        // Bounded LRU eviction for offscreen page canvases (max 8 pages)
        if (pdfPageCache.current.size >= 8) {
          const oldestKey = pdfPageCache.current.keys().next().value;
          if (oldestKey) {
            const oldCanvas = pdfPageCache.current.get(oldestKey);
            if (oldCanvas) {
              oldCanvas.width = 0;
              oldCanvas.height = 0;
            }
            pdfPageCache.current.delete(oldestKey);
          }
        }

        pdfPageCache.current.set(cacheKey, offCanvas);

        const drawW = viewport.width / pixelRatio;
        const drawH = viewport.height / pixelRatio;
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        ctx.drawImage(offCanvas, drawX, drawY, drawW, drawH);
      } catch (err) {
        console.error(`Error rendering PDF page ${pageNum}:`, err);
        drawPreviewUnavailable(ctx, x, y, w, h);
      }
    },
    [drawPreviewUnavailable]
  );

  // Swipe logic state
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    if (isLeftSwipe && currentPage < totalSheetsToPreview) {
      setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1));
    } else if (isRightSwipe && currentPage > 1) {
      setCurrentPage((p) => Math.max(1, p - 1));
    }
  }, [currentPage, totalSheetsToPreview]);

  // --- Main Canvas Render Effect ---
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crisp Retina-optimized canvas dimensions
    const baseW = isLandscape ? 960 : 680;
    const baseH = isLandscape ? 680 : 960;

    if (canvas.width !== baseW) canvas.width = baseW;
    if (canvas.height !== baseH) canvas.height = baseH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, baseW, baseH);

    // Apply Grayscale Filter if B&W
    ctx.filter = isBw ? 'grayscale(100%)' : 'none';

    // White paper base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseW, baseH);

    const nUp = pagesPerSheet === '2' ? 2 : pagesPerSheet === '4' ? 4 : 1;

    async function drawCanvas() {
      if (!ctx) return;

      for (let i = 0; i < nUp; i++) {
        if (cancelled) return;
        const pageIndex = (currentPage - 1) * nUp + i;
        if (pageIndex >= selectedPages.length) continue;
        const pageToDraw = selectedPages[pageIndex];

        let slotX = 0;
        let slotY = 0;
        let slotW = baseW;
        let slotH = baseH;

        if (nUp === 2) {
          if (isLandscape) {
            slotW = baseW / 2;
            slotH = baseH;
            slotX = i * slotW;
            slotY = 0;
          } else {
            slotW = baseW;
            slotH = baseH / 2;
            slotX = 0;
            slotY = i * slotH;
          }
        } else if (nUp === 4) {
          slotW = baseW / 2;
          slotH = baseH / 2;
          slotX = (i % 2) * slotW;
          slotY = Math.floor(i / 2) * slotH;
        }

        const padding = nUp > 1 ? 16 : 0;
        const targetW = slotW - padding * 2;
        const targetH = slotH - padding * 2;
        const targetX = slotX + padding;
        const targetY = slotY + padding;

        const scaledW = targetW * effectiveScale;
        const scaledH = targetH * effectiveScale;
        const offsetX = targetX + (targetW - scaledW) / 2;
        const offsetY = targetY + (targetH - scaledH) / 2;

        // Render actual uploaded document
        if (canvaSnapshotUrl) {
          await renderImageSlot(ctx, canvaSnapshotUrl, offsetX, offsetY, scaledW, scaledH);
        } else if (isImgFile && activePreviewUrl) {
          await renderImageSlot(ctx, activePreviewUrl, offsetX, offsetY, scaledW, scaledH);
        } else if (pdfDoc && pageToDraw <= pdfDoc.numPages) {
          await renderPdfSlot(ctx, pdfDoc, pageToDraw, offsetX, offsetY, scaledW, scaledH);
        } else {
          drawPreviewUnavailable(ctx, offsetX, offsetY, scaledW, scaledH);
        }

        // Slot boundary outline for multi-up layout
        if (nUp > 1) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(slotX + 4, slotY + 4, slotW - 8, slotH - 8);
          ctx.setLineDash([]);
        }
      }

      if (cancelled) return;

      // Watermark Stamp (if selected)
      if (watermark && watermark !== 'NONE') {
        ctx.save();
        ctx.translate(baseW / 2, baseH / 2);
        ctx.rotate(-Math.PI / 4);
        ctx.font = `900 ${Math.round(baseW * 0.08)}px sans-serif`;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.lineWidth = 6;
        ctx.strokeText(watermark, 0, 0);
        ctx.fillText(watermark, 0, 0);
        ctx.restore();
      }
    }

    let frameId: number | null = null;
    frameId = requestAnimationFrame(() => {
      void drawCanvas();
    });

    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [
    currentPage,
    isLandscape,
    modalPaperSize,
    modalColorMode,
    pagesPerSheet,
    scaleMode,
    customScalePercent,
    effectiveScale,
    watermark,
    isBw,
    fileName,
    totalDocPages,
    selectedPages,
    activePreviewUrl,
    isImgFile,
    pdfDoc,
    canvaSnapshotUrl,
    drawPreviewUnavailable,
    renderImageSlot,
    renderPdfSlot,
  ]);

  // Handle Apply and Close / Print
  const handlePrintApply = () => {
    applyAllSettings(true);
  };

  const enabledPapers = pricing?.enabled_papers || { a4: true, a3: true, legal: true, photo: true };
  const customPapers = (pricing?.custom_papers || []).filter((p) => p.enabled);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Print preview"
      className="fixed inset-0 z-50 bg-[#202124] text-slate-100 flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden font-sans select-none"
    >
      {/* =========================================================================
          MOBILE TOP NAVIGATION BAR
          Clean segmented control: [ 📄 Preview ] [ ⚙️ Settings ] + Quick Print Action
         ========================================================================= */}
      <header className="md:hidden bg-[#202124] border-b border-[#3c4043]/70 px-3 py-2 flex items-center justify-between shrink-0 shadow-sm z-30">
        <button
          type="button"
          onClick={handleCloseModal}
          className="min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#35363a] transition-colors"
          aria-label="Close and save"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Center Segmented Pill Controller */}
        <div className="flex bg-[#2b2d30] p-0.5 rounded-xl border border-slate-700/60 shadow-inner">
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileTab === 'preview'
                ? 'bg-[#1a73e8] text-white shadow-sm'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileTab === 'settings'
                ? 'bg-[#1a73e8] text-white shadow-sm'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Spacer on right to keep center segmented control balanced */}
        <div className="min-h-[38px] min-w-[38px]" aria-hidden="true" />
      </header>

      {/* =========================================================================
          LEFT SIDEBAR: Adobe Acrobat / Chromium Print Settings Panel
          (Side-by-side on desktop, dedicated view when settings active on mobile)
         ========================================================================= */}
      <aside
        className={`w-full md:w-[320px] lg:w-[340px] bg-[#202124] flex flex-col flex-1 min-h-0 md:flex-none border-r border-[#3c4043]/50 md:h-full overflow-hidden ${
          mobileTab === 'preview' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header: Title, Dynamic Sheet Count, Help Button */}
        <div className="flex items-start justify-between px-5 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-[#3c4043]/40 shrink-0">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight">Print &amp; Advanced Settings</h1>
            <p className="text-xs text-[#9aa0a6] font-normal mt-0.5">
              Total: {totalSheets} sheet{totalSheets === 1 ? '' : 's'} of paper
            </p>
          </div>
          <button
            type="button"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#35363a] transition-colors"
            title="Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Settings */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5 text-xs text-[#e8eaed]">
          {/* Canva Studio Quick Launch Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/80 via-indigo-950/70 to-slate-900 border border-purple-500/40 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-purple-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300 animate-spin [animation-duration:8s]" />
                <span>Canva Studio Mode</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-[9px] font-black text-purple-300 uppercase tracking-wider border border-purple-400/30">
                Custom Page
              </span>
            </div>
            <p className="text-[11px] text-purple-200/80 leading-relaxed font-medium">
              Rearrange, resize, rotate, and add multiple images on a single page.
            </p>
            <button
              type="button"
              onClick={() => {
                setViewMode('canva');
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setMobileTab('preview');
                }
              }}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span>{viewMode === 'canva' ? 'Editing in Canva Studio' : 'Open Canva Studio'}</span>
              <span>🎨</span>
            </button>
          </div>

          {/* 1. Copies with Stepper for easy mobile tapping */}
          <div className="space-y-1.5">
            <label className="block text-xs font-normal text-[#9aa0a6]">Copies</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalCopies((c) => Math.max(1, c - 1))}
                className="w-9 h-8 rounded-lg bg-[#2b2d30] hover:bg-[#35363a] border border-[#5f6368] text-white font-bold text-sm flex items-center justify-center active:scale-95 transition-all"
                title="Decrease copies"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={100}
                value={modalCopies}
                aria-label="Copies"
                onChange={(e) => setModalCopies(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 text-center px-2 py-1.5 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs font-bold focus:outline-none focus:border-[#8ab4f8]"
              />
              <button
                type="button"
                onClick={() => setModalCopies((c) => Math.min(100, c + 1))}
                className="w-9 h-8 rounded-lg bg-[#2b2d30] hover:bg-[#35363a] border border-[#5f6368] text-white font-bold text-sm flex items-center justify-center active:scale-95 transition-all"
                title="Increase copies"
              >
                +
              </button>
            </div>
          </div>

          {/* 2. Layout */}
          <div className="space-y-2">
            <label className="block text-xs font-normal text-[#9aa0a6]">Layout</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="radio"
                  name="layout"
                  checked={modalLayout === 'PORTRAIT'}
                  onChange={() => setModalLayout('PORTRAIT')}
                  className="accent-[#8ab4f8] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-[#e8eaed]">Portrait</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="radio"
                  name="layout"
                  checked={modalLayout === 'LANDSCAPE'}
                  onChange={() => setModalLayout('LANDSCAPE')}
                  className="accent-[#8ab4f8] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-[#e8eaed]">Landscape</span>
              </label>
            </div>
          </div>

          {/* 3. Pages */}
          <div className="space-y-2">
            <label className="block text-xs font-normal text-[#9aa0a6]">Pages</label>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="radio"
                  name="pages"
                  checked={pageRangeMode === 'ALL'}
                  onChange={() => setPageRangeMode('ALL')}
                  className="accent-[#8ab4f8] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-[#e8eaed]">All</span>
              </label>

              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="pages"
                  checked={pageRangeMode === 'RANGE'}
                  onChange={() => setPageRangeMode('RANGE')}
                  className="accent-[#8ab4f8] w-4 h-4 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  placeholder="e.g. 1-5, 8, 11-13"
                  value={customPageRange}
                  onFocus={() => setPageRangeMode('RANGE')}
                  onChange={(e) => {
                    setPageRangeMode('RANGE');
                    setCustomPageRange(e.target.value);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs placeholder:text-[#80868b] focus:outline-none focus:border-[#8ab4f8]"
                />
              </div>
            </div>
          </div>

          {/* 4. Color */}
          {pricing?.form_fields?.allowColorPrinting !== false && (
            <div className="space-y-1.5">
              <label className="block text-xs font-normal text-[#9aa0a6]">Color</label>
              <select
                value={modalColorMode}
                onChange={(e) => setModalColorMode(e.target.value as ColorMode)}
                className="w-full px-3 py-2 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
              >
                <option value="BW">Black and white</option>
                <option value="COLOR">Color</option>
              </select>
            </div>
          )}

          {/* 5. More / Fewer Settings Collapsible Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowMoreSettings(!showMoreSettings)}
              className="flex items-center gap-1.5 text-xs text-[#8ab4f8] hover:text-[#aecbfa] font-normal transition-colors cursor-pointer py-1"
            >
              {showMoreSettings ? (
                <>
                  <span>Fewer settings</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>More settings</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Collapsible Section */}
          {showMoreSettings && (
            <div className="space-y-5 pt-1 border-t border-[#3c4043]/30">
              {/* Paper Size */}
              <div className="space-y-1.5">
                <label className="block text-xs font-normal text-[#9aa0a6]">Paper size</label>
                <select
                  value={modalPaperSize}
                  onChange={(e) => setModalPaperSize(e.target.value as PaperSize)}
                  className="w-full px-3 py-2 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
                >
                  {enabledPapers.a4 !== false && <option value="A4">A4</option>}
                  {enabledPapers.legal !== false && <option value="LEGAL">Legal</option>}
                  {enabledPapers.a3 !== false && <option value="A3">Tabloid / A3</option>}
                  {customPapers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scale (%) */}
              <div className="space-y-2">
                <label className="block text-xs font-normal text-[#9aa0a6]">Scale (%)</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="radio"
                      name="scale"
                      checked={scaleMode === 'FIT'}
                      onChange={() => setScaleMode('FIT')}
                      className="accent-[#8ab4f8] w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-[#e8eaed]">Fit to printable area</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="radio"
                      name="scale"
                      checked={scaleMode === 'ACTUAL'}
                      onChange={() => setScaleMode('ACTUAL')}
                      className="accent-[#8ab4f8] w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-[#e8eaed]">Actual size</span>
                  </label>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="scale"
                      checked={scaleMode === 'CUSTOM'}
                      onChange={() => setScaleMode('CUSTOM')}
                      className="accent-[#8ab4f8] w-4 h-4 cursor-pointer shrink-0"
                    />
                    <input
                      type="number"
                      min={25}
                      max={400}
                      value={customScalePercent}
                      onFocus={() => setScaleMode('CUSTOM')}
                      onChange={(e) => {
                        setScaleMode('CUSTOM');
                        setCustomScalePercent(parseInt(e.target.value) || 100);
                      }}
                      className="w-20 px-2.5 py-1.5 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs font-sans focus:outline-none focus:border-[#8ab4f8]"
                    />
                  </div>
                </div>
              </div>

              {/* Pages per Sheet */}
              <div className="space-y-1.5">
                <label className="block text-xs font-normal text-[#9aa0a6]">Pages per sheet</label>
                <select
                  value={pagesPerSheet}
                  onChange={(e) => setPagesPerSheet(e.target.value as '1' | '2' | '4')}
                  className="w-full px-3 py-2 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                </select>
              </div>

              {/* Two-Sided Printing */}
              {pricing?.form_fields?.allowDoubleSided !== false && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-normal text-[#9aa0a6]">Two-sided</label>
                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={modalPrintSides === 'DOUBLE'}
                      onChange={(e) => setModalPrintSides(e.target.checked ? 'DOUBLE' : 'SINGLE')}
                      className="accent-[#8ab4f8] w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="text-xs text-[#e8eaed]">Print on both sides</span>
                  </label>
                </div>
              )}

              {/* Watermark */}
              <div className="space-y-1.5">
                <label className="block text-xs font-normal text-[#9aa0a6]">Security Watermark</label>
                <select
                  value={watermark}
                  onChange={(e) => setWatermark(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
                >
                  <option value="NONE">None</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="SAMPLE">SAMPLE</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions (Sticky at bottom of sidebar) */}
        <div className="md:hidden px-3 py-3.5 border-t border-[#3c4043]/40 flex items-center justify-between gap-2.5 shrink-0 bg-[#202124]">
          {/* On mobile settings tab: quick view preview link */}
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className="flex-1 px-2 py-3 rounded-xl bg-[#2b2d30] hover:bg-[#35363a] text-slate-200 text-sm font-bold border border-slate-600 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-transform"
          >
            <FileText className="w-4 h-4 text-[#8ab4f8]" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={handleCloseModal}
            className="flex-1 px-2 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold border border-slate-500 flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-transform"
            title="Save settings & Return"
          >
            Save
          </button>

          <button
            type="button"
            onClick={handlePrintApply}
            className="flex-[1.5] px-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-extrabold shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/40 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
          >
            <span>Pay</span>
            <span className="text-base leading-none">→</span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
          RIGHT WORKSPACE: Full Adobe Acrobat / Edge Preview Canvas Area
         ========================================================================= */}
      <main
        className={`flex-1 min-h-0 min-w-0 bg-[#323639] flex flex-col items-center justify-between p-3 sm:p-6 relative overflow-hidden h-full ${
          mobileTab === 'settings' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Info Bar */}
        <div className="w-full flex items-center justify-between text-xs text-[#9aa0a6] px-2 shrink-0 z-10 gap-2 flex-wrap pb-2 border-b border-[#3c4043]/50">
          <div className="flex items-center gap-2 truncate max-w-[200px] sm:max-w-xs">
            <span className="truncate font-mono text-[11px] text-white">
              {fileName}
            </span>
            {pageRangeMode === 'RANGE' && currentSheetPages.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-blue-500/20 text-blue-300 rounded border border-blue-500/30 shrink-0">
                {currentSheetPages.length === 1
                  ? `Page ${currentSheetPages[0]}`
                  : `Pages ${currentSheetPages.join(', ')}`}
              </span>
            )}
          </div>

          {/* Canva Studio vs Standard Preview Segmented Control */}
          <div className="flex items-center p-0.5 rounded-xl bg-[#202124] border border-[#3c4043] shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Standard Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('canva')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'canva'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                  : 'text-purple-300 hover:text-white'
              }`}
              title="Canva-style canvas editor: rearrange, resize, rotate, and add multiple images"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Canva Studio</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono hidden sm:inline-block">
              {modalPaperSize} • {modalLayout === 'LANDSCAPE' ? 'Landscape' : 'Portrait'} •{' '}
              {isBw ? 'B&W' : 'Color'}{rotationAngle !== 0 ? ` • ${rotationAngle}°` : ''}
            </span>
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-2 py-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-600/60 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
              title="Save settings & Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {viewMode === 'canva' ? (
          <CanvaStudioCanvas
            initialImages={canvaInitialImages}
            savedItems={savedCanvaItems}
            onItemsChange={setSavedCanvaItems}
            paperSize={modalPaperSize}
            isLandscape={isLandscape}
            paperAspectRatio={paperAspectRatio}
            isBw={isBw}
            zoomLevel={zoomLevel}
            onApplyLayout={handleApplyCanvaLayout}
            onCancel={() => setViewMode('preview')}
          />
        ) : (
          <>
            {/* Centered Document Canvas Container */}
        <div 
          className="flex-1 w-full flex items-center justify-center overflow-auto p-1 sm:p-4 my-auto relative touch-manipulation"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="relative bg-white shadow-[0_12px_40px_rgba(0,0,0,0.65)] transition-all duration-150 rounded-xs flex items-center justify-center overflow-hidden border border-slate-400/20 contain-paint"
            style={{
              aspectRatio: `${paperAspectRatio}`,
              width: isLandscape
                ? `${Math.round(440 * (zoomLevel / 100))}px`
                : `${Math.round(330 * (zoomLevel / 100))}px`,
              maxWidth: '92%',
              maxHeight: '68vh',
              transform: `rotate(${rotationAngle}deg) translateZ(0)`,
              willChange: 'transform',
              filter: isBw ? 'grayscale(100%)' : 'none',
            }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain block select-none pointer-events-none"
            />

            {/* Fallback Native PDF Embed if PDF.js parser is unavailable */}
            {!pdfDoc && !isPdfLoading && isPdfFile && activePreviewUrl && (
              <iframe
                src={`${activePreviewUrl}#page=${currentSheetPages[0] || 1}&toolbar=0&navpanes=0&scrollbar=0`}
                className="absolute inset-0 w-full h-full border-none pointer-events-none rounded-xs"
                title="Document Preview"
              />
            )}

            {/* Document Loading Overlay */}
            {isPdfLoading && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-20 pointer-events-none">
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs shadow-xl">
                  <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="font-medium">Rendering document...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Floating Navigation & Zoom Bar (Optimized for Mobile) */}
        <div className="bg-[#202124]/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#3c4043] flex items-center gap-2 sm:gap-3 text-xs text-white shadow-xl z-20 shrink-0 mb-1 touch-manipulation">
          {/* Page Navigator */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer touch-manipulation"
              title="Previous sheet"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-[11px] px-1 text-slate-300">
              <strong className="text-white">{currentPage}</strong> /{' '}
              {totalSheetsToPreview}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1))
              }
              disabled={currentPage >= totalSheetsToPreview}
              className="p-1 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer touch-manipulation"
              title="Next sheet"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="w-[1px] h-3.5 bg-[#3c4043]" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
              className="p-1 rounded-full hover:bg-slate-700 cursor-pointer touch-manipulation"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="text-[10px] sm:text-[11px] font-mono text-slate-300 hover:text-white px-0.5 sm:px-1 touch-manipulation"
              title="Reset Zoom"
            >
              {zoomLevel}%
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 20))}
              className="p-1 rounded-full hover:bg-slate-700 cursor-pointer touch-manipulation"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-3.5 bg-[#3c4043]" />

          {/* Rotate View */}
          <button
            type="button"
            onClick={() => setRotationAngle((r) => (r + 90) % 360)}
            className="p-1 rounded-full hover:bg-slate-700 cursor-pointer touch-manipulation"
            title="Rotate View 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
          </>
        )}

        {/* Bottom Quick-Action Bar in Preview Canvas: Edit on left side, Confirm & Pay on right bottom */}
        <div className="w-full px-3 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-2.5 md:gap-3 z-20 shrink-0 bg-[#202124]/95 backdrop-blur-md border-t border-[#3c4043]/70 shadow-lg touch-manipulation">
          {/* Left Side: Edit Button */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setMobileTab('settings');
              } else {
                const sidebar = document.querySelector('aside');
                sidebar?.scrollIntoView({ behavior: 'smooth' });
                const firstInput = sidebar?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select, button');
                firstInput?.focus();
              }
            }}
            className="flex-1 md:flex-none h-11 md:h-auto py-2 md:py-3 px-3 md:px-6 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-900 border border-slate-600/80 md:border-2 md:border-indigo-400/60 md:hover:border-indigo-300 text-white text-xs sm:text-sm md:text-base font-bold flex items-center justify-center md:justify-start gap-2 md:gap-2.5 shadow-xs md:shadow-md md:shadow-black/40 md:ring-1 md:ring-indigo-500/20 transition-all cursor-pointer active:scale-95 touch-manipulation"
            title="Edit Print Settings"
          >
            <Edit className="w-4 h-4 md:w-5 md:h-5 text-indigo-300 shrink-0" />
            <span className="font-extrabold tracking-wide">Edit</span>
            <span className="hidden md:inline-block text-xs text-slate-300 font-medium border-l border-slate-600/90 pl-2.5 ml-0.5">
              {modalPaperSize} • {isBw ? 'B&W' : 'Color'} • {modalCopies}x
            </span>
          </button>

          {/* Right Bottom: Confirm & Pay Button */}
          <button
            type="button"
            onClick={handlePrintApply}
            className="flex-[1.4] md:flex-none h-11 md:h-auto py-2 md:py-3 px-4 md:px-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm md:text-base font-extrabold shadow-md md:shadow-lg shadow-emerald-950/60 ring-1 md:ring-2 ring-emerald-400/50 hover:ring-emerald-300 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-1.5 md:gap-2 md:ml-auto touch-manipulation"
          >
            <span>Confirm &amp; Pay</span>
            <span className="text-base md:text-lg leading-none">→</span>
          </button>
        </div>
      </main>
    </div>
  );
};
