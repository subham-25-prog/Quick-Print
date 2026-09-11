'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AdvancedPrintConfig, PaperSize, ColorMode, PrintSides, PricingConfig } from '@/types';
import { UploadedFileState } from './FileUploader';
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
}) => {
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
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);

  // PDF Document rendering state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);
  const [pdfPageCount, setPdfPageCount] = useState<number>(pageCount || 1);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    setRotationAngle(0);
  }, [isOpen, copies, colorMode, paperSize, printSides, advancedConfig]);

  // Lock body scroll and handle Esc key
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  // Create Object URL for uploaded local file
  useEffect(() => {
    if (uploadedFile?.file) {
      try {
        const url = URL.createObjectURL(uploadedFile.file);
        setLocalObjectUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to create object URL:', e);
      }
    }
  }, [uploadedFile]);

  const activePreviewUrl =
    localObjectUrl || previewUrl || fileSignedUrl || uploadedFile?.previewUrl || uploadedFile?.signedUrl;
  const isBw = modalColorMode === 'BW';

  const isImgFile = useMemo(() => {
    return (
      fileType?.startsWith('image/') ||
      uploadedFile?.fileType?.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp)$/i.test(fileName)
    );
  }, [fileType, uploadedFile?.fileType, fileName]);

  const isPdfFile = useMemo(() => {
    if (isImgFile) return false;
    const name = (fileName || uploadedFile?.fileName || '').toLowerCase();
    const type = (fileType || uploadedFile?.fileType || '').toLowerCase();
    return (
      type === 'application/pdf' ||
      type.includes('pdf') ||
      name.endsWith('.pdf') ||
      (!isImgFile && (!!uploadedFile || !!activePreviewUrl))
    );
  }, [isImgFile, fileType, uploadedFile, fileName, activePreviewUrl]);

  // --- Load actual uploaded PDF document ---
  useEffect(() => {
    if (!isOpen) return;
    if (!isPdfFile) return;

    let active = true;

    async function loadUploadedPdf() {
      try {
        setIsPdfLoading(true);
        // Load PDF.js and its worker entry so it runs cleanly in main thread
        const [pdfjsMod] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.js'),
          // @ts-expect-error worker entry does not have type declarations
          import('pdfjs-dist/legacy/build/pdf.worker.entry.js'),
        ]);
        const pdfjs = pdfjsMod.default || pdfjsMod;

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

  // Compute effective scale factor for drawing
  const effectiveScale = useMemo(() => {
    if (scaleMode === 'FIT') return 0.94;
    if (scaleMode === 'ACTUAL') return 1.0;
    return Math.min(3.0, Math.max(0.2, (customScalePercent || 100) / 100));
  }, [scaleMode, customScalePercent]);

  // Fallback realistic vector mockup when document is still parsing
  const drawFallbackResumeMockup = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      pageNum: number
    ) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, width, height);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);

      const isFirstPage = pageNum === 1;

      if (isFirstPage) {
        const headerY = y + height * 0.08;
        const photoRadius = Math.min(width * 0.08, 48);
        const photoX = x + width * 0.16;
        const photoY = headerY + photoRadius * 0.8;

        ctx.save();
        ctx.beginPath();
        ctx.arc(photoX, photoY, photoRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const grad = ctx.createLinearGradient(
          photoX - photoRadius,
          photoY - photoRadius,
          photoX + photoRadius,
          photoY + photoRadius
        );
        if (isBw) {
          grad.addColorStop(0, '#555555');
          grad.addColorStop(1, '#999999');
        } else {
          grad.addColorStop(0, '#3b82f6');
          grad.addColorStop(1, '#8b5cf6');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(photoX - photoRadius, photoY - photoRadius, photoRadius * 2, photoRadius * 2);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(photoX, photoY - photoRadius * 0.2, photoRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(photoX, photoY + photoRadius * 0.9, photoRadius * 0.65, Math.PI, 0);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(photoX, photoY, photoRadius, 0, Math.PI * 2);
        ctx.stroke();

        const titleX = x + width * 0.3;
        ctx.fillStyle = '#111827';
        ctx.font = `bold ${Math.max(14, Math.round(width * 0.038))}px sans-serif`;
        const displayName = fileName ? fileName.replace(/\.[^/.]+$/, '').toUpperCase() : 'DOCUMENT PREVIEW';
        ctx.fillText(displayName.slice(0, 24), titleX, headerY + photoRadius * 0.5);

        ctx.fillStyle = isBw ? '#4b5563' : '#2563eb';
        ctx.font = `bold ${Math.max(9, Math.round(width * 0.02))}px sans-serif`;
        ctx.fillText('Official Print Document • Processing', titleX, headerY + photoRadius * 0.95);

        const dividerY = headerY + photoRadius * 1.8;
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + width * 0.08, dividerY);
        ctx.lineTo(x + width * 0.92, dividerY);
        ctx.stroke();

        const col1X = x + width * 0.08;
        const col1Width = width * 0.32;
        const col2X = x + width * 0.44;
        const col2Width = width * 0.48;
        let curY1 = dividerY + height * 0.04;
        let curY2 = dividerY + height * 0.04;

        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${Math.max(9, Math.round(width * 0.022))}px sans-serif`;
        ctx.fillText('DETAILS & CONTACT', col1X, curY1);
        curY1 += height * 0.022;

        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(col1X, curY1, col1Width * (0.6 + (i % 3) * 0.15), Math.max(3, height * 0.007));
          curY1 += height * 0.02;
        }

        curY1 += height * 0.025;
        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${Math.max(9, Math.round(width * 0.022))}px sans-serif`;
        ctx.fillText('TECHNICAL SKILLS', col1X, curY1);
        curY1 += height * 0.022;

        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(col1X, curY1, col1Width * (0.5 + (i % 4) * 0.12), Math.max(3, height * 0.007));
          curY1 += height * 0.018;
        }

        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${Math.max(9, Math.round(width * 0.022))}px sans-serif`;
        ctx.fillText('PROFILE SUMMARY', col2X, curY2);
        curY2 += height * 0.022;

        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(col2X, curY2, col2Width * (0.85 + (i % 2) * 0.1), Math.max(3, height * 0.007));
          curY2 += height * 0.018;
        }

        curY2 += height * 0.03;
        ctx.fillStyle = '#1f2937';
        ctx.font = `bold ${Math.max(9, Math.round(width * 0.022))}px sans-serif`;
        ctx.fillText('DOCUMENT CONTENT', col2X, curY2);
        curY2 += height * 0.022;

        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = '#9ca3af';
          ctx.fillRect(col2X, curY2, col2Width * (0.7 + (i % 3) * 0.14), Math.max(3, height * 0.007));
          curY2 += height * 0.018;
        }
      } else {
        let cy = y + height * 0.08;
        ctx.fillStyle = '#111827';
        ctx.font = `bold ${Math.max(11, Math.round(width * 0.028))}px sans-serif`;
        ctx.fillText(`PAGE ${pageNum} • CONTINUATION`, x + width * 0.08, cy);
        cy += height * 0.03;

        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + width * 0.08, cy);
        ctx.lineTo(x + width * 0.92, cy);
        ctx.stroke();
        cy += height * 0.04;

        for (let block = 0; block < 4; block++) {
          ctx.fillStyle = '#374151';
          ctx.fillRect(x + width * 0.08, cy, width * 0.35, Math.max(4, height * 0.012));
          cy += height * 0.025;
          for (let l = 0; l < 4; l++) {
            ctx.fillStyle = '#9ca3af';
            ctx.fillRect(x + width * 0.08, cy, width * (0.75 + (l % 3) * 0.08), Math.max(3, height * 0.007));
            cy += height * 0.018;
          }
          cy += height * 0.03;
        }
      }

      ctx.fillStyle = '#9ca3af';
      ctx.font = `${Math.max(8, Math.round(width * 0.016))}px monospace`;
      ctx.fillText(
        `Page ${pageNum} of ${totalDocPages} • ${modalPaperSize} • ${isBw ? 'B&W' : 'Color'}`,
        x + width * 0.08,
        y + height * 0.96
      );
    },
    [fileName, totalDocPages, modalPaperSize, isBw]
  );

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
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        img.onload = () => {
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
      try {
        const page = await doc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(w / unscaledViewport.width, h / unscaledViewport.height);
        const pixelRatio = 1.5;
        const viewport = page.getViewport({ scale: scale * pixelRatio });

        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.max(1, Math.round(viewport.width));
        offCanvas.height = Math.max(1, Math.round(viewport.height));
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return;

        await page.render({
          canvasContext: offCtx,
          viewport,
        }).promise;

        const drawW = viewport.width / pixelRatio;
        const drawH = viewport.height / pixelRatio;
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        ctx.drawImage(offCanvas, drawX, drawY, drawW, drawH);
      } catch (err) {
        console.error(`Error rendering PDF page ${pageNum}:`, err);
        drawFallbackResumeMockup(ctx, x, y, w, h, pageNum);
      }
    },
    [drawFallbackResumeMockup]
  );

  // --- Main Canvas Render Effect ---
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed High-DPI canvas dimensions
    const baseW = isLandscape ? 1600 : 1131;
    const baseH = isLandscape ? 1131 : 1600;

    canvas.width = baseW;
    canvas.height = baseH;

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
        if (isImgFile && activePreviewUrl) {
          await renderImageSlot(ctx, activePreviewUrl, offsetX, offsetY, scaledW, scaledH);
        } else if (pdfDoc && pageToDraw <= pdfDoc.numPages) {
          await renderPdfSlot(ctx, pdfDoc, pageToDraw, offsetX, offsetY, scaledW, scaledH);
        } else {
          drawFallbackResumeMockup(ctx, offsetX, offsetY, scaledW, scaledH, Math.min(pageToDraw, totalDocPages));
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

    drawCanvas();

    return () => {
      cancelled = true;
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
    drawFallbackResumeMockup,
    renderImageSlot,
    renderPdfSlot,
  ]);

  // Handle Apply and Close / Print
  const handlePrintApply = () => {
    const updatedConfig: AdvancedPrintConfig = {
      pageRangeMode,
      customPageRange,
      pagesPerSheet,
      pageScaling: scaleMode,
      customScalePercent,
      orientation: modalLayout === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT',
      printQuality: advancedConfig.printQuality || 'STANDARD',
      watermark,
    };

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

    if (onProceedToOrder) {
      onProceedToOrder();
    } else {
      onClose();
    }
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
          onClick={onClose}
          className="min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#35363a] transition-colors"
          aria-label="Close"
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
        className={`w-full md:w-[320px] lg:w-[340px] bg-[#202124] flex flex-col shrink-0 border-r border-[#3c4043]/50 h-full overflow-hidden ${
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
                onChange={(e) => setModalCopies(Math.max(1, parseInt(e.target.value) || 1))}
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
                  <option value="LETTER">Letter</option>
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
        <div className="px-5 sm:px-6 py-3 sm:py-4 border-t border-[#3c4043]/40 flex items-center justify-between gap-3 shrink-0 bg-[#202124]">
          {/* On mobile settings tab: quick view preview link */}
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className="md:hidden px-3.5 py-2 rounded-lg bg-[#2b2d30] hover:bg-[#35363a] text-slate-300 text-xs font-medium border border-slate-700/60"
          >
            ← View
          </button>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 sm:px-5 py-2 rounded-lg bg-[#3c4043] hover:bg-[#4a4d51] active:bg-[#35373a] text-[#e8eaed] text-xs font-medium border border-[#5f6368]/50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrintApply}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Confirm &amp; Pay</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          RIGHT WORKSPACE: Full Adobe Acrobat / Edge Preview Canvas Area
         ========================================================================= */}
      <main
        className={`flex-1 bg-[#323639] flex flex-col items-center justify-between p-3 sm:p-6 relative overflow-hidden h-full ${
          mobileTab === 'settings' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Info Bar */}
        <div className="w-full flex items-center justify-between text-xs text-[#9aa0a6] px-2 shrink-0 z-10">
          <div className="flex items-center gap-2 truncate max-w-[220px] sm:max-w-xs">
            <span className="truncate font-mono text-[11px]">
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
          <span className="text-[11px] font-mono">
            {modalPaperSize} • {modalLayout === 'LANDSCAPE' ? 'Landscape' : 'Portrait'} •{' '}
            {isBw ? 'B&W' : 'Color'}
          </span>
        </div>

        {/* Centered Document Canvas Container */}
        <div className="flex-1 w-full flex items-center justify-center overflow-auto p-1 sm:p-4 my-auto relative">
          <div
            className="relative bg-white shadow-[0_12px_40px_rgba(0,0,0,0.65)] transition-all duration-150 rounded-xs flex items-center justify-center overflow-hidden border border-slate-400/20"
            style={{
              aspectRatio: `${paperAspectRatio}`,
              width: isLandscape
                ? `${Math.round(440 * (zoomLevel / 100))}px`
                : `${Math.round(330 * (zoomLevel / 100))}px`,
              maxWidth: '92%',
              maxHeight: '68vh',
              transform: `rotate(${rotationAngle}deg)`,
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
        <div className="bg-[#202124]/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#3c4043] flex items-center gap-2 sm:gap-3 text-xs text-white shadow-xl z-20 shrink-0 mb-1">
          {/* Page Navigator */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
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
              className="p-1 rounded-full hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
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
              className="p-1 rounded-full hover:bg-slate-700 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="text-[10px] sm:text-[11px] font-mono text-slate-300 hover:text-white px-0.5 sm:px-1"
              title="Reset Zoom"
            >
              {zoomLevel}%
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 20))}
              className="p-1 rounded-full hover:bg-slate-700 cursor-pointer"
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
            className="p-1 rounded-full hover:bg-slate-700 cursor-pointer"
            title="Rotate View 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Bottom Quick-Action Bar in Preview View */}
        <div className="md:hidden w-full px-3 pt-1.5 pb-2.5 flex items-center justify-between gap-2.5 z-20 shrink-0 bg-[#202124]/90 backdrop-blur-md border-t border-[#3c4043]/60">
          <button
            type="button"
            onClick={() => setMobileTab('settings')}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#2b2d30] border border-slate-700/80 text-slate-200 text-xs font-semibold flex items-center justify-between shadow-xs active:scale-98"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#8ab4f8]" />
              <span className="truncate max-w-[125px]">
                {modalPaperSize} • {isBw ? 'B&W' : 'Color'} • {modalCopies}x
              </span>
            </div>
            <span className="text-[#8ab4f8] text-[11px] font-bold shrink-0">Edit →</span>
          </button>

          <button
            type="button"
            onClick={handlePrintApply}
            className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-extrabold shadow-lg shadow-emerald-950/70 ring-2 ring-emerald-400/60 hover:ring-emerald-300 transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <span>Confirm &amp; Pay</span>
            <span className="text-base leading-none">→</span>
          </button>
        </div>
      </main>
    </div>
  );
};
