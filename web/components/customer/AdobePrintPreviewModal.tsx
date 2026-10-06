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
  HelpCircle,
  X,
  FileText,
  Sliders,
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
  onApplyCanvasLayout?: (file: File, pageCount: number) => Promise<void> | void;
  batchFiles?: Array<{ name: string; file: File; id?: string; pageCount?: number; copies?: number }>;
  savedCanvaItems?: CanvaImageItem[];
  onCanvaItemsChange?: (items: CanvaImageItem[]) => void;
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
  savedCanvaItems: propsSavedCanvaItems,
  onCanvaItemsChange: propsOnCanvaItemsChange,
}) => {
  // --- Canva Studio State ---
  const [viewMode, setViewMode] = useState<'preview' | 'canva'>('preview');
  const [canvaSnapshotUrl, setCanvaSnapshotUrl] = useState<string | null>(null);
  const [canvaSnapshotUrls, setCanvaSnapshotUrls] = useState<string[]>([]);
  const [draftCanvaItems, setDraftCanvaItems] = useState<CanvaImageItem[]>(() => propsSavedCanvaItems ?? []);
  const [appliedCanvaItems, setAppliedCanvaItems] = useState<CanvaImageItem[]>(() => propsSavedCanvaItems ?? []);
  const [isCanvaApplied, setIsCanvaApplied] = useState<boolean>(() => Boolean(propsSavedCanvaItems && propsSavedCanvaItems.length > 0));
  const [canvaInitialImages, setCanvaInitialImages] = useState<Array<{ url: string; name: string }>>([]);
  const [batchPdfDocuments, setBatchPdfDocuments] = useState<Map<number, any>>(new Map());

  // Clean, customer-friendly display document title (no robotic Batch_Order or internal filenames)
  const displayFileName = useMemo(() => {
    const raw = fileName || uploadedFile?.fileName || uploadedFile?.file?.name || '';
    if (!raw) return 'Print Document';
    if (/^Batch[_-]/i.test(raw) || /Batch_Order/i.test(raw)) {
      if (batchFiles && batchFiles.length > 0) {
        return batchFiles[0].name;
      }
      return 'Print Document';
    }
    if (/^Canva_Design_\d+/i.test(raw)) {
      return 'Custom Design.pdf';
    }
    return raw;
  }, [fileName, uploadedFile, batchFiles]);

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
  const [showMoreSettings, setShowMoreSettings] = useState<boolean>(false);
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

  // Top Navigation View Switcher (Preview vs Settings vs Canva Studio)
  const [activeTab, setActiveTab] = useState<'preview' | 'settings' | 'canva'>('preview');

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

  const canvaMaxPage = useMemo(() => {
    if (isCanvaApplied && appliedCanvaItems && appliedCanvaItems.length > 0) {
      return Math.max(1, ...appliedCanvaItems.map((it) => (it.pageIndex ?? 0) + 1));
    }
    if (batchFiles && batchFiles.length > 0) {
      return batchFiles.length;
    }
    return 1;
  }, [isCanvaApplied, appliedCanvaItems, batchFiles]);

  const totalDocPages = useMemo(() => {
    if (isCanvaApplied) {
      if (canvaSnapshotUrls.length > 0) return canvaSnapshotUrls.length;
      if (pdfPageCount > 0) return pdfPageCount;
      if (appliedCanvaItems.length > 0) return canvaMaxPage;
    }
    // Until Apply: show original / previous version page count
    if (pdfPageCount > 0) return pdfPageCount;
    if (batchFiles && batchFiles.length > 0) return batchFiles.length;
    if (pageCount && pageCount > 0) return pageCount;
    return 1;
  }, [isCanvaApplied, canvaSnapshotUrls.length, pdfPageCount, appliedCanvaItems, canvaMaxPage, batchFiles, pageCount]);

  // Keep a page-by-page source map for mixed uploads. Previewing source PDF
  // pages directly avoids blank pages from PDFs whose resources are altered
  // when a batch is merged for printing.
  const batchPageSources = useMemo(() => {
    const pages: Array<{ fileIndex: number; pageNumber: number; isPdf: boolean }> = [];
    batchFiles?.forEach((file, fileIndex) => {
      const isPdf = file.file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const pageTotal = Math.max(1, file.pageCount || 1);
      const copies = Math.max(1, file.copies || 1);
      for (let copy = 0; copy < copies; copy++) {
        for (let pageNumber = 1; pageNumber <= pageTotal; pageNumber++) {
          pages.push({ fileIndex, pageNumber, isPdf });
        }
      }
    });
    return pages;
  }, [batchFiles]);

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
    setShowMoreSettings(false);
  }, [isOpen, copies, colorMode, paperSize, printSides, advancedConfig]);

  // Reset Canva applied state when opening fresh documents without applied Canva layout
  useEffect(() => {
    if (!isOpen) return;
    // Do not discard an in-memory editor draft while the parent is receiving
    // the matching saved layout. That short React update window previously
    // made images disappear after switching Preview -> Canva Studio.
    if (
      (!propsSavedCanvaItems || propsSavedCanvaItems.length === 0) &&
      draftCanvaItems.length === 0 &&
      appliedCanvaItems.length === 0
    ) {
      setIsCanvaApplied(false);
      setCanvaSnapshotUrl(null);
      setCanvaSnapshotUrls([]);
      setDraftCanvaItems([]);
      setAppliedCanvaItems([]);
    }
  }, [
    isOpen,
    uploadedFile?.file,
    uploadedFile?.uploadId,
    fileName,
    propsSavedCanvaItems,
    draftCanvaItems.length,
    appliedCanvaItems.length,
  ]);

  // The page-level state is the durable copy of a completed layout. If this
  // modal receives it after a preview transition, restore an empty local
  // draft instead of opening the editor with an empty canvas.
  useEffect(() => {
    if (!propsSavedCanvaItems || propsSavedCanvaItems.length === 0) return;
    setDraftCanvaItems((current) => current.length === 0 ? propsSavedCanvaItems : current);
    setAppliedCanvaItems((current) => current.length === 0 ? propsSavedCanvaItems : current);
    setIsCanvaApplied(true);
  }, [propsSavedCanvaItems]);

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

  // Canvas Studio edits images. Convert every PDF page in a mixed batch to a
  // temporary image so PDFs appear beside uploaded photos instead of being
  // silently omitted from the editor.
  useEffect(() => {
    if (!isOpen || (propsSavedCanvaItems && propsSavedCanvaItems.length > 0)) return;

    let active = true;
    const prepareCanvaImages = async () => {
      const sourceFiles = batchFiles?.length
        ? batchFiles.map((item) => ({ file: item.file, name: item.name }))
        : uploadedFile?.file
        ? [{ file: uploadedFile.file, name: uploadedFile.fileName || uploadedFile.file.name }]
        : [];
      const prepared: Array<{ url: string; name: string }> = [];

      for (const source of sourceFiles) {
        const isPdf = source.file.type === 'application/pdf' || source.name.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          const url = URL.createObjectURL(source.file);
          // This URL is stored on the editable Canva item after Apply. Do not
          // revoke it while the page is open, or reopening the editor would
          // leave the saved item present but visually blank.
          prepared.push({ url, name: source.name });
          continue;
        }

        try {
          const pdfjs = await getPdfJs();
          const doc = await pdfjs.getDocument({ data: new Uint8Array(await source.file.arrayBuffer()) }).promise;

          for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
            if (!active) return;
            const page = await doc.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(1.5, 1200 / Math.max(baseViewport.width, baseViewport.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            const context = canvas.getContext('2d');
            if (!context) continue;
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            prepared.push({
              url: canvas.toDataURL('image/jpeg', 0.92),
              name: `${source.name} — Page ${pageNumber}`,
            });
          }
          doc.cleanup?.();
        } catch (error) {
          console.error(`Unable to prepare ${source.name} for Canvas Studio:`, error);
        }
      }

      if (sourceFiles.length === 0 && activePreviewUrl && isImgFile) {
        prepared.push({ url: activePreviewUrl, name: fileName || 'Photo' });
      }
      if (active) setCanvaInitialImages(prepared);
    };

    void prepareCanvaImages();
    return () => {
      active = false;
    };
  }, [isOpen, batchFiles, uploadedFile?.file, activePreviewUrl, isImgFile, fileName, propsSavedCanvaItems]);

  const handleApplyCanvaLayout = async (
    renderedFile: File,
    previewDataUrl?: string,
    allPagePreviews?: string[],
    appliedItems?: CanvaImageItem[]
  ) => {
    setIsCanvaApplied(true);
    const itemsToSave = appliedItems || draftCanvaItems;
    setAppliedCanvaItems(itemsToSave);
    setDraftCanvaItems(itemsToSave);
    propsOnCanvaItemsChange?.(itemsToSave);

    if (previewDataUrl) {
      setCanvaSnapshotUrl(previewDataUrl);
      const img = new Image();
      img.src = previewDataUrl;
      imageElementCache.current.set(previewDataUrl, img);
    }
    if (allPagePreviews && allPagePreviews.length > 0) {
      setCanvaSnapshotUrls(allPagePreviews);
      allPagePreviews.forEach((url) => {
        const img = new Image();
        img.src = url;
        imageElementCache.current.set(url, img);
      });
    }
    try {
      const newUrl = URL.createObjectURL(renderedFile);
      setLocalObjectUrl(newUrl);
    } catch {}

    // Snapshot JPEGs are ready now, so return to the preview immediately.
    // PDF.js is only a fallback for that preview and can parse the generated
    // PDF in the background without keeping the Apply overlay on screen.
    setViewMode('preview');
    setActiveTab('preview');
    setCurrentPage(1);
    setIsPdfLoading(false);

    void (async () => {
      try {
        const pdfjs = await getPdfJs();
        const arrayBuffer = await renderedFile.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        setPdfDoc(doc);
        setPdfPageCount(doc.numPages);
      } catch (err) {
        console.error('Error loading Canva layout PDF in preview:', err);
      }
    })();

    // The upload is prepared by the parent in the background. It is shared
    // with checkout, so a customer can continue configuring their print while
    // the network request completes.
    if (onApplyCanvasLayout) {
      void Promise.resolve(onApplyCanvasLayout(renderedFile, Math.max(1, allPagePreviews?.length || 1))).catch((err) => {
        console.error('Error preparing Canva layout upload:', err);
      });
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
    if (isCanvaApplied) return;
    setPdfDoc(null);
    setIsPdfLoading(isPdfFile);
    clearCanvasCache(pdfPageCache.current);
    imageElementCache.current.clear();
  }, [isOpen, uploadedFile?.file, uploadedFile?.uploadId, fileName, isPdfFile, isCanvaApplied]);

  // Load original PDFs in a mixed batch independently of the compiled print
  // PDF. PDF.js can then render their pages exactly as Canvas Studio does.
  useEffect(() => {
    if (!isOpen || !batchFiles?.length) {
      setBatchPdfDocuments(new Map());
      return;
    }

    let active = true;
    const loadBatchPdfDocuments = async () => {
      const pdfEntries = batchFiles
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => file.file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
      if (pdfEntries.length === 0) {
        if (active) setBatchPdfDocuments(new Map());
        return;
      }

      try {
        const pdfjs = await getPdfJs();
        const documents = await Promise.all(
          pdfEntries.map(async ({ file, index }) => {
            const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.file.arrayBuffer()) }).promise;
            return [index, doc] as const;
          })
        );
        if (active) setBatchPdfDocuments(new Map(documents));
      } catch (error) {
        console.error('Failed to load an original PDF page for preview:', error);
        if (active) setBatchPdfDocuments(new Map());
      }
    };

    void loadBatchPdfDocuments();
    return () => {
      active = false;
    };
  }, [isOpen, batchFiles]);

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
        const imgAspect = cachedImg.naturalWidth / cachedImg.naturalHeight;
        const slotAspect = w / h;
        let drawW = w;
        let drawH = h;
        let drawX = x;
        let drawY = y;
        if (Math.abs(imgAspect - slotAspect) > 0.03) {
          if (imgAspect > slotAspect) {
            drawH = w / imgAspect;
            drawY = y + (h - drawH) / 2;
          } else {
            drawW = h * imgAspect;
            drawX = x + (w - drawW) / 2;
          }
        }
        ctx.drawImage(cachedImg, drawX, drawY, drawW, drawH);
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        img.onload = () => {
          imageElementCache.current.set(url, img);
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const slotAspect = w / h;
          let drawW = w;
          let drawH = h;
          let drawX = x;
          let drawY = y;
          if (Math.abs(imgAspect - slotAspect) > 0.03) {
            if (imgAspect > slotAspect) {
              drawH = w / imgAspect;
              drawY = y + (h - drawH) / 2;
            } else {
              drawW = h * imgAspect;
              drawX = x + (w - drawW) / 2;
            }
          }
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

  // Helper to render Canva Studio items directly onto preview canvas slot
  const renderCanvaPageItems = useCallback(
    async (
      ctx: CanvasRenderingContext2D,
      pageItems: CanvaImageItem[],
      slotX: number,
      slotY: number,
      slotW: number,
      slotH: number
    ): Promise<void> => {
      // Clean white paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(slotX, slotY, slotW, slotH);

      for (const item of pageItems) {
        let img = item.originalImg || imageElementCache.current.get(item.src);
        if (!img || !img.complete || img.naturalWidth === 0) {
          try {
            img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.crossOrigin = 'anonymous';
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = item.src;
            });
            imageElementCache.current.set(item.src, img);
          } catch {
            continue;
          }
        }

        const ix = slotX + (item.x / 100) * slotW;
        const iy = slotY + (item.y / 100) * slotH;
        const iw = (item.width / 100) * slotW;
        const ih = (item.height / 100) * slotH;

        ctx.save();
        ctx.translate(ix + iw / 2, iy + ih / 2);
        if (item.rotation) {
          ctx.rotate((item.rotation * Math.PI) / 180);
        }

        const cropLeft = item.cropLeft || 0;
        const cropRight = item.cropRight || 0;
        const cropTop = item.cropTop || 0;
        const cropBottom = item.cropBottom || 0;

        const sx = (cropLeft / 100) * img.naturalWidth;
        const sy = (cropTop / 100) * img.naturalHeight;
        const sw = (Math.max(1, 100 - cropLeft - cropRight) / 100) * img.naturalWidth;
        const sh = (Math.max(1, 100 - cropTop - cropBottom) / 100) * img.naturalHeight;

        ctx.drawImage(img, sx, sy, sw, sh, -iw / 2, -ih / 2, iw, ih);
        ctx.restore();
      }
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

  // Swipe and wheel page navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const lastWheelTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndX.current = null;
    touchEndY.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diffX = touchStartX.current - touchEndX.current;
    const diffY = (touchStartY.current ?? 0) - (touchEndY.current ?? 0);
    const isHorizontal = Math.abs(diffX) > Math.abs(diffY);

    if (isHorizontal) {
      if (diffX > 40 && currentPage < totalSheetsToPreview) {
        setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1));
      } else if (diffX < -40 && currentPage > 1) {
        setCurrentPage((p) => Math.max(1, p - 1));
      }
    } else {
      if (diffY > 50 && currentPage < totalSheetsToPreview) {
        setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1));
      } else if (diffY < -50 && currentPage > 1) {
        setCurrentPage((p) => Math.max(1, p - 1));
      }
    }
  }, [currentPage, totalSheetsToPreview]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 25) return;
    const now = Date.now();
    if (now - lastWheelTime.current < 260) return;
    lastWheelTime.current = now;

    if (e.deltaY > 0 && currentPage < totalSheetsToPreview) {
      setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1));
    } else if (e.deltaY < 0 && currentPage > 1) {
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

    // Crisp Retina-optimized canvas dimensions matching paperAspectRatio exactly
    const baseDimension = 1200;
    const baseW = isLandscape
      ? baseDimension
      : Math.max(1, Math.round(baseDimension * paperAspectRatio));
    const baseH = isLandscape
      ? Math.max(1, Math.round(baseDimension / paperAspectRatio))
      : baseDimension;

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

        // Render actual uploaded document or customized Canva layout
        if (isCanvaApplied && canvaSnapshotUrls.length > 0) {
          const pageSnapshot = canvaSnapshotUrls[pageToDraw - 1] || (pageToDraw === 1 ? canvaSnapshotUrl : null);
          if (pageSnapshot) {
            await renderImageSlot(ctx, pageSnapshot, offsetX, offsetY, scaledW, scaledH);
          } else if (pdfDoc && pageToDraw <= pdfDoc.numPages) {
            await renderPdfSlot(ctx, pdfDoc, pageToDraw, offsetX, offsetY, scaledW, scaledH);
          } else {
            drawPreviewUnavailable(ctx, offsetX, offsetY, scaledW, scaledH);
          }
        } else if (isCanvaApplied && pdfDoc && pageToDraw <= pdfDoc.numPages) {
          await renderPdfSlot(ctx, pdfDoc, pageToDraw, offsetX, offsetY, scaledW, scaledH);
        } else {
          // UNTIL TAPPING APPLY: Render previous / original uploaded document!
          const batchSource = batchPageSources[pageToDraw - 1];
          if (batchSource && batchFiles?.[batchSource.fileIndex]?.file) {
            const sourceFile = batchFiles[batchSource.fileIndex];
            if (batchSource.isPdf) {
              const sourcePdf = batchPdfDocuments.get(batchSource.fileIndex);
              if (sourcePdf) {
                await renderPdfSlot(ctx, sourcePdf, batchSource.pageNumber, offsetX, offsetY, scaledW, scaledH);
              } else {
                drawPreviewUnavailable(ctx, offsetX, offsetY, scaledW, scaledH);
              }
            } else if (sourceFile.file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(sourceFile.name)) {
              const bUrl = URL.createObjectURL(sourceFile.file);
              await renderImageSlot(ctx, bUrl, offsetX, offsetY, scaledW, scaledH);
              URL.revokeObjectURL(bUrl);
            } else {
              drawPreviewUnavailable(ctx, offsetX, offsetY, scaledW, scaledH);
            }
          } else if (pdfDoc && pageToDraw <= pdfDoc.numPages) {
            await renderPdfSlot(ctx, pdfDoc, pageToDraw, offsetX, offsetY, scaledW, scaledH);
          } else if (isImgFile && activePreviewUrl) {
            await renderImageSlot(ctx, activePreviewUrl, offsetX, offsetY, scaledW, scaledH);
          } else {
            drawPreviewUnavailable(ctx, offsetX, offsetY, scaledW, scaledH);
          }
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
    canvaSnapshotUrls,
    isCanvaApplied,
    appliedCanvaItems,
    batchFiles,
    batchPageSources,
    batchPdfDocuments,
    viewMode,
    renderCanvaPageItems,
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
          TOP NAVIGATION BAR: [ 📄 Preview ] [ ⚙️ Settings ] [ ✨ Canva Studio ]
         ========================================================================= */}
      <header className="bg-[#202124] border-b border-[#3c4043]/70 px-3 sm:px-4 py-2 flex items-center justify-between shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCloseModal}
            className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#35363a] transition-colors cursor-pointer"
            aria-label="Close and save"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="font-mono text-xs text-white hidden sm:inline-block truncate max-w-[280px]">
            {displayFileName}
          </span>
        </div>

        {/* Center Segmented Pill Controller: [ Preview ] [ Settings ] [ Canva Studio ] */}
        <div className="flex bg-[#2b2d30] p-0.5 rounded-xl border border-slate-700/60 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setActiveTab('preview');
              setViewMode('preview');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'preview' && viewMode === 'preview'
                ? 'bg-[#1a73e8] text-white shadow-sm'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('canva');
              setViewMode('canva');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'canva' || activeTab === 'canva'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                : 'text-purple-300 hover:text-white'
            }`}
            title="Open Canva Studio editor"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Canva Studio</span>
          </button>
        </div>

        {/* Right Paper Specs */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-[#9aa0a6] hidden sm:inline-block">
            {modalPaperSize} • {modalLayout === 'LANDSCAPE' ? 'Landscape' : 'Portrait'} • {isBw ? 'B&W' : 'Color'}
          </span>
        </div>
      </header>

      {/* =========================================================================
          LEFT SIDEBAR: Adobe Acrobat / Chromium Print Settings Panel
          (Side-by-side on desktop, dedicated view when settings active on mobile)
         ========================================================================= */}
      <aside
        className={`w-full md:w-[320px] lg:w-[340px] bg-[#202124] flex flex-col flex-1 min-h-0 md:flex-none border-r border-[#3c4043]/50 md:h-full overflow-hidden ${
          activeTab === 'settings'
            ? 'flex'
            : viewMode === 'canva'
            ? 'hidden'
            : 'hidden md:flex'
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

          {/* 3. Pages Selection / Range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">Pages to Print</label>
              <span className="text-[11px] font-mono text-[#8ab4f8]">
                {pageRangeMode === 'ALL' ? `All (${totalDocPages} ${totalDocPages === 1 ? 'page' : 'pages'})` : `${selectedPages.length} selected`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#2b2d30] rounded-xl border border-[#5f6368]/60">
              <button
                type="button"
                onClick={() => setPageRangeMode('ALL')}
                className={`py-2 px-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pageRangeMode === 'ALL'
                    ? 'bg-[#1a73e8] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                All Pages ({totalDocPages})
              </button>
              <button
                type="button"
                onClick={() => setPageRangeMode('RANGE')}
                className={`py-2 px-2 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  pageRangeMode === 'RANGE'
                    ? 'bg-[#1a73e8] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                Custom Range
              </button>
            </div>

            {pageRangeMode === 'RANGE' && (
              <div className="p-3 bg-[#1e2022] rounded-xl border border-slate-700/80 space-y-2 animate-fadeIn">
                <input
                  type="text"
                  placeholder="e.g. 1-3, 5"
                  value={customPageRange}
                  onChange={(e) => {
                    setPageRangeMode('RANGE');
                    setCustomPageRange(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#2b2d30] border border-[#5f6368] text-white text-xs placeholder:text-[#80868b] focus:outline-none focus:border-[#8ab4f8]"
                />
                <p className="text-[10px] text-slate-400">
                  Type individual pages or ranges separated by commas (e.g. 1-2, 4).
                </p>
              </div>
            )}
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

              {/* Page Scale & Fit Setting */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">
                    Page Scaling (Print Zoom)
                  </label>
                  <span className="text-[11px] font-mono text-[#8ab4f8]">
                    {scaleMode === 'FIT' ? 'Fit (94%)' : scaleMode === 'ACTUAL' ? '100% (1:1)' : `${customScalePercent}%`}
                  </span>
                </div>

                {/* 3 Clear Segmented Options */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#2b2d30] rounded-xl border border-[#5f6368]/60">
                  <button
                    type="button"
                    onClick={() => setScaleMode('FIT')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      scaleMode === 'FIT'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    Fit to Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleMode('ACTUAL')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      scaleMode === 'ACTUAL'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    Actual (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleMode('CUSTOM')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      scaleMode === 'CUSTOM'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {/* Short Helper Explanation */}
                <p className="text-[11px] text-[#9aa0a6] leading-normal">
                  {scaleMode === 'FIT' && '✓ Automatically fits full page onto paper with clean white margins.'}
                  {scaleMode === 'ACTUAL' && '✓ Prints at exact original 100% document dimensions.'}
                  {scaleMode === 'CUSTOM' && '✓ Manually resize document content on the paper sheet.'}
                </p>

                {/* Custom Scale Slider & Stepper */}
                {scaleMode === 'CUSTOM' && (
                  <div className="p-3 bg-[#1e2022] rounded-xl border border-slate-700/80 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Scale factor:</span>
                      <div className="flex items-center gap-1.5 font-mono font-bold text-white">
                        <button
                          type="button"
                          onClick={() => setCustomScalePercent((s) => Math.max(25, s - 5))}
                          className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs"
                          title="Decrease scale"
                        >
                          -
                        </button>
                        <span className="w-12 text-center text-indigo-300">{customScalePercent}%</span>
                        <button
                          type="button"
                          onClick={() => setCustomScalePercent((s) => Math.min(200, s + 5))}
                          className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs"
                          title="Increase scale"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={25}
                      max={200}
                      step={5}
                      value={customScalePercent}
                      onChange={(e) => setCustomScalePercent(parseInt(e.target.value, 10) || 100)}
                      className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />

                    {/* Quick Preset Chips */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      {[50, 75, 90, 100, 125, 150].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setCustomScalePercent(pct)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                            customScalePercent === pct
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pages per Sheet */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">Pages per sheet</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#2b2d30] rounded-xl border border-[#5f6368]/60">
                  <button
                    type="button"
                    onClick={() => setPagesPerSheet('1')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pagesPerSheet === '1'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    1 Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagesPerSheet('2')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pagesPerSheet === '2'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    2 Side-by-side
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagesPerSheet('4')}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pagesPerSheet === '4'
                        ? 'bg-[#1a73e8] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    4 in Grid
                  </button>
                </div>
                <p className="text-[11px] text-[#9aa0a6]">
                  {pagesPerSheet === '1' && 'Print one full document page per paper sheet.'}
                  {pagesPerSheet === '2' && 'Print 2 pages side-by-side on each sheet (saves paper).'}
                  {pagesPerSheet === '4' && 'Print 4 pages in a 2×2 grid on each sheet.'}
                </p>
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
            onClick={() => setActiveTab('preview')}
            className="flex-1 px-2 py-3 rounded-xl bg-[#2b2d30] hover:bg-[#35363a] text-slate-200 text-sm font-bold border border-slate-600 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-transform"
          >
            <FileText className="w-4 h-4 text-[#8ab4f8]" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={handlePrintApply}
            className="flex-1 px-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-extrabold shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/40 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
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
        className={`flex-1 min-h-0 min-w-0 bg-[#323639] flex flex-col items-center justify-between relative overflow-hidden h-full ${
          viewMode === 'canva' ? 'p-0 w-full h-full' : 'p-3 sm:p-6'
        } ${
          activeTab === 'settings' ? 'hidden md:flex' : 'flex'
        }`}
      >

        {viewMode === 'canva' ? (
          <CanvaStudioCanvas
            initialImages={canvaInitialImages}
            savedItems={
              draftCanvaItems.length > 0
                ? draftCanvaItems
                : appliedCanvaItems.length > 0
                ? appliedCanvaItems
                : propsSavedCanvaItems
            }
            onItemsChange={setDraftCanvaItems}
            paperSize={modalPaperSize}
            isLandscape={isLandscape}
            paperAspectRatio={paperAspectRatio}
            isBw={isBw}
            zoomLevel={zoomLevel}
            onApplyLayout={handleApplyCanvaLayout}
          />
        ) : (

          <>
            {/* Centered Document Canvas Container */}
        <div 
          className="flex-1 w-full flex items-center justify-center overflow-auto p-1 sm:p-4 my-auto relative touch-manipulation"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <div
            className="relative bg-white shadow-[0_12px_40px_rgba(0,0,0,0.65)] transition-all duration-150 rounded-xs flex items-center justify-center overflow-hidden border border-slate-400/20 contain-paint"
            style={{
              aspectRatio: `${paperAspectRatio}`,
              width: isLandscape
                ? `${Math.round(860 * (zoomLevel / 100))}px`
                : `${Math.round(620 * (zoomLevel / 100))}px`,
              maxWidth: '96%',
              maxHeight: '84vh',
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

        {/* Bottom page counter */}
        <div className="bg-[#202124]/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#3c4043] flex items-center text-xs text-white shadow-xl z-20 shrink-0 mb-1 touch-manipulation">
          {/* Page Navigator */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 sm:px-2 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer touch-manipulation flex items-center gap-1"
              title="Previous page (Scroll up or click)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-[11px] px-1 text-slate-300">
              <strong className="text-white">{currentPage}</strong> /{' '}
              {totalSheetsToPreview}
              {pageRangeMode === 'RANGE' && currentSheetPages.length > 0 && (
                <span className="ml-1.5 px-1 py-0.5 text-[9px] font-mono bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                  {currentSheetPages.length === 1
                    ? `P.${currentSheetPages[0]}`
                    : `P.${currentSheetPages.join(',')}`}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalSheetsToPreview, p + 1))
              }
              disabled={currentPage >= totalSheetsToPreview}
              className="p-1 sm:px-2 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer touch-manipulation flex items-center gap-1"
              title="Next page (Scroll down or click)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>
          </>
        )}

        {/* Bottom Quick-Action Bar in Preview Canvas: Settings on left side, Confirm & Pay on right bottom (Only visible in Preview mode) */}
        {viewMode !== 'canva' && (
          <div className="w-full px-3 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-2.5 md:gap-3 z-20 shrink-0 bg-[#202124]/95 backdrop-blur-md border-t border-[#3c4043]/70 shadow-lg touch-manipulation">
            {/* Left Side: Settings Button */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setActiveTab('settings');
                } else {
                  const sidebar = document.querySelector('aside');
                  sidebar?.scrollIntoView({ behavior: 'smooth' });
                  const firstInput = sidebar?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select, button');
                  firstInput?.focus();
                }
              }}
              className="flex-1 md:flex-none h-11 md:h-auto py-2 md:py-3 px-3 md:px-6 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-900 border border-slate-600/80 md:border-2 md:border-indigo-400/60 md:hover:border-indigo-300 text-white text-xs sm:text-sm md:text-base font-bold flex items-center justify-center md:justify-start gap-2 md:gap-2.5 shadow-xs md:shadow-md md:shadow-black/40 md:ring-1 md:ring-indigo-500/20 transition-all cursor-pointer active:scale-95 touch-manipulation"
              title="Print Settings"
            >
              <Sliders className="w-4 h-4 md:w-5 md:h-5 text-indigo-300 shrink-0" />
              <span className="font-extrabold tracking-wide">Settings</span>
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
        )}
      </main>
    </div>
  );
};
