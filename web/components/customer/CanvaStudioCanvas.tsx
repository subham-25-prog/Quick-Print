'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  Copy,
  RotateCw,
  Upload,
  Check,
  RotateCcw,
  X,
  Plus,
} from '@/components/ui/Icons';
import { PDFDocument } from 'pdf-lib';

export interface CanvaImageItem {
  id: string;
  src: string;
  name: string;
  pageIndex?: number; // 0-indexed page index (default 0)
  x: number; // percentage of paper width (0 to 100)
  y: number; // percentage of paper height (0 to 100)
  width: number; // percentage of paper width (0 to 100)
  height: number; // percentage of paper height (0 to 100)
  rotation: number; // degrees (0 - 360)
  zIndex: number;
  aspectRatio: number; // width / height
  originalImg?: HTMLImageElement;
}

export interface CanvaStudioCanvasProps {
  initialImages: Array<{ url: string; name: string }>;
  savedItems?: CanvaImageItem[];
  onItemsChange?: (items: CanvaImageItem[]) => void;
  paperSize: string;
  isLandscape: boolean;
  paperAspectRatio: number;
  isBw: boolean;
  zoomLevel: number;
  onApplyLayout: (file: File, previewDataUrl?: string, allPagePreviews?: string[]) => Promise<void> | void;
  onCancel?: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rotate';

export const CanvaStudioCanvas: React.FC<CanvaStudioCanvasProps> = ({
  initialImages,
  savedItems,
  onItemsChange,
  paperSize,
  isLandscape,
  paperAspectRatio,
  isBw,
  zoomLevel,
  onApplyLayout,
  onCancel,
}) => {
  const [items, setItems] = useState<CanvaImageItem[]>(() => {
    if (savedItems && savedItems.length > 0) {
      return savedItems;
    }
    return [];
  });

  const [pageCount, setPageCount] = useState<number>(() => {
    if (savedItems && savedItems.length > 0) {
      const maxP = Math.max(...savedItems.map((it) => it.pageIndex ?? 0));
      return Math.max(1, maxP + 1);
    }
    return 1;
  });

  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (savedItems && savedItems.length > 0) {
      return savedItems[0].id;
    }
    return null;
  });

  const [isExporting, setIsExporting] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const [history, setHistory] = useState<CanvaImageItem[][]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // High-performance 120 FPS animation frame reference for mobile touch
  const rafId = useRef<number | null>(null);
  const pendingItemUpdate = useRef<CanvaImageItem | null>(null);
  const hasInitialized = useRef(Boolean(savedItems && savedItems.length > 0));

  // Keep parent in sync whenever canvas items change
  useEffect(() => {
    if (items.length > 0) {
      onItemsChange?.(items);
    }
  }, [items, onItemsChange]);

  // Interaction tracking state
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    initialItem: CanvaImageItem;
    sheetWidth: number;
    sheetHeight: number;
    centerX: number;
    centerY: number;
    pageSheet?: HTMLElement | null;
  } | null>(null);

  // Push state to history for Undo
  const pushHistory = useCallback((newItems: CanvaImageItem[]) => {
    setHistory((prev) => [...prev.slice(-15), newItems]);
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setItems(prev);
  }, [history]);

  // Load and cache HTMLImageElement
  const loadImage = useCallback((src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }, []);

  // Initialize items from initialImages only once on initial mount if not already populated
  useEffect(() => {
    if (hasInitialized.current) return;
    if (items.length > 0) {
      hasInitialized.current = true;
      return;
    }
    if (initialImages.length === 0) return;
    hasInitialized.current = true;

    let isMounted = true;
    const initItems = async () => {
      const loadedItems: CanvaImageItem[] = [];

      for (let i = 0; i < initialImages.length; i++) {
        const item = initialImages[i];
        try {
          const img = await loadImage(item.url);
          if (!isMounted) return;

          const imgAspect = img.naturalWidth / (img.naturalHeight || 1);
          let itemW = 80;
          let itemH = (itemW / imgAspect) * paperAspectRatio;

          if (itemH > 80) {
            itemH = 80;
            itemW = (itemH * imgAspect) / paperAspectRatio;
          }

          // Center item
          const x = (100 - itemW) / 2;
          const y = (100 - itemH) / 2;

          loadedItems.push({
            id: `item-${Date.now()}-${i}`,
            src: item.url,
            name: item.name,
            pageIndex: 0,
            x: Math.max(2, x),
            y: Math.max(2, y),
            width: Math.min(96, Math.max(15, itemW)),
            height: Math.min(96, Math.max(15, itemH)),
            rotation: 0,
            zIndex: i + 1,
            aspectRatio: imgAspect,
            originalImg: img,
          });
        } catch (err) {
          console.error('Error loading initial image:', err);
        }
      }

      if (isMounted && loadedItems.length > 0) {
        setItems(loadedItems);
        setSelectedId(loadedItems[0].id);
        onItemsChange?.(loadedItems);
      }
    };

    void initItems();
    return () => {
      isMounted = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [initialImages, loadImage, paperAspectRatio, items.length, onItemsChange]);

  // Add a same-sized blank page
  const handleAddPage = useCallback(() => {
    setPageCount((prev) => {
      const nextCount = prev + 1;
      setActivePageIndex(nextCount - 1);
      return nextCount;
    });
  }, []);

  // Delete a page
  const handleDeletePage = useCallback((pIndex: number) => {
    if (pageCount <= 1) return;
    pushHistory(items);
    setItems((prev) =>
      prev
        .filter((it) => (it.pageIndex ?? 0) !== pIndex)
        .map((it) => {
          const itemPage = it.pageIndex ?? 0;
          if (itemPage > pIndex) {
            return { ...it, pageIndex: itemPage - 1 };
          }
          return it;
        })
    );
    setPageCount((prev) => Math.max(1, prev - 1));
    setActivePageIndex((prev) => Math.max(0, Math.min(prev, pageCount - 2)));
    setSelectedId(null);
  }, [pageCount, items, pushHistory]);

  // Duplicate a page
  const handleDuplicatePage = useCallback((pIndex: number) => {
    pushHistory(items);
    const newPageIndex = pIndex + 1;
    const shifted = items.map((it) => {
      const itemPage = it.pageIndex ?? 0;
      if (itemPage >= newPageIndex) {
        return { ...it, pageIndex: itemPage + 1 };
      }
      return it;
    });

    const duplicatedItems = items
      .filter((it) => (it.pageIndex ?? 0) === pIndex)
      .map((it) => ({
        ...it,
        id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pageIndex: newPageIndex,
      }));

    setItems([...shifted, ...duplicatedItems]);
    setPageCount((prev) => prev + 1);
    setActivePageIndex(newPageIndex);
  }, [items, pushHistory]);

  // Add new image files to the current active canvas page
  const handleAddFiles = useCallback(
    async (files: FileList | File[]) => {
      const newItems: CanvaImageItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const objectUrl = URL.createObjectURL(file);
        try {
          const img = await loadImage(objectUrl);
          const imgAspect = img.naturalWidth / (img.naturalHeight || 1);

          let itemW = 55;
          let itemH = (itemW / imgAspect) * paperAspectRatio;
          if (itemH > 55) {
            itemH = 55;
            itemW = (itemH * imgAspect) / paperAspectRatio;
          }

          // Offset added items slightly
          const pageItemsCount = items.filter((it) => (it.pageIndex ?? 0) === activePageIndex).length;
          const offset = ((pageItemsCount + i) % 5) * 4;
          const x = Math.min(75, Math.max(5, 20 + offset));
          const y = Math.min(75, Math.max(5, 20 + offset));

          const nextZ = items.reduce((max, it) => Math.max(max, it.zIndex), 0) + 1;
          newItems.push({
            id: `img-${Date.now()}-${i}`,
            src: objectUrl,
            name: file.name,
            pageIndex: activePageIndex,
            x,
            y,
            width: itemW,
            height: itemH,
            rotation: 0,
            zIndex: nextZ,
            aspectRatio: imgAspect,
            originalImg: img,
          });
        } catch (e) {
          console.error('Error adding image:', e);
        }
      }

      if (newItems.length > 0) {
        pushHistory(items);
        setItems((prev) => [...prev, ...newItems]);
        setSelectedId(newItems[newItems.length - 1].id);
      }
    },
    [items, loadImage, paperAspectRatio, activePageIndex, pushHistory]
  );

  // Paste from clipboard support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < clipItems.length; i++) {
        if (clipItems[i].type.startsWith('image/')) {
          const file = clipItems[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleAddFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleAddFiles]);

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) || null,
    [items, selectedId]
  );

  // Action: Delete selected image
  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory(items);
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  }, [items, selectedId, pushHistory]);

  // Action: Duplicate selected image
  const handleDuplicateSelected = useCallback(() => {
    if (!selectedItem) return;
    pushHistory(items);
    const maxZ = items.reduce((max, it) => Math.max(max, it.zIndex), 0) + 1;
    const duplicated: CanvaImageItem = {
      ...selectedItem,
      id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      pageIndex: selectedItem.pageIndex ?? activePageIndex,
      x: Math.min(85, selectedItem.x + 4),
      y: Math.min(85, selectedItem.y + 4),
      zIndex: maxZ,
    };
    setItems((prev) => [...prev, duplicated]);
    setSelectedId(duplicated.id);
  }, [items, selectedItem, activePageIndex, pushHistory]);

  // Action: Rotate 90 degrees
  const handleRotate90 = useCallback(() => {
    if (!selectedId) return;
    pushHistory(items);
    setItems((prev) =>
      prev.map((it) =>
        it.id === selectedId ? { ...it, rotation: (it.rotation + 90) % 360 } : it
      )
    );
  }, [items, selectedId, pushHistory]);

  // -------------------------------------------------------------
  // Mobile-Optimized Pointer Event Handlers (120 FPS Butter Smooth)
  // -------------------------------------------------------------
  const handlePointerDown = (
    e: React.PointerEvent,
    item: CanvaImageItem,
    mode: DragMode
  ) => {
    e.stopPropagation();

    const target = e.target as HTMLElement;
    const pageSheet = target.closest('[data-canva-page]') as HTMLElement | null;
    if (!pageSheet) return;

    setSelectedId(item.id);
    setActivePageIndex(item.pageIndex ?? 0);
    const rect = pageSheet.getBoundingClientRect();

    const itemCenterX = (item.x + item.width / 2) * 0.01 * rect.width;
    const itemCenterY = (item.y + item.height / 2) * 0.01 * rect.height;

    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialItem: { ...item },
      sheetWidth: rect.width,
      sheetHeight: rect.height,
      centerX: itemCenterX,
      centerY: itemCenterY,
      pageSheet,
    };

    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();

    const { mode, startX, startY, initialItem, sheetWidth, sheetHeight, centerX, centerY, pageSheet } =
      dragRef.current;

    const deltaXPixels = e.clientX - startX;
    const deltaYPixels = e.clientY - startY;

    const deltaXPercent = (deltaXPixels / sheetWidth) * 100;
    const deltaYPercent = (deltaYPixels / sheetHeight) * 100;

    let updatedItem: CanvaImageItem = { ...initialItem };

    if (mode === 'move') {
      let nextX = initialItem.x + deltaXPercent;
      let nextY = initialItem.y + deltaYPercent;

      // Smart center magnetic snapping
      const nextCenterX = nextX + initialItem.width / 2;
      const nextCenterY = nextY + initialItem.height / 2;
      if (Math.abs(nextCenterX - 50) < 1.5) {
        nextX = 50 - initialItem.width / 2;
      }
      if (Math.abs(nextCenterY - 50) < 1.5) {
        nextY = 50 - initialItem.height / 2;
      }

      // Constrain inside sheet
      nextX = Math.max(-initialItem.width + 5, Math.min(95, nextX));
      nextY = Math.max(-initialItem.height + 5, Math.min(95, nextY));

      updatedItem.x = nextX;
      updatedItem.y = nextY;
    } else if (mode === 'rotate') {
      if (!pageSheet) return;
      const rect = pageSheet.getBoundingClientRect();
      const currentMouseX = e.clientX - rect.left;
      const currentMouseY = e.clientY - rect.top;

      const angleRad = Math.atan2(currentMouseY - centerY, currentMouseX - centerX);
      let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90;
      if (angleDeg < 0) angleDeg += 360;

      // Snap to 45 degree increments
      const nearest45 = Math.round(angleDeg / 45) * 45;
      if (Math.abs(angleDeg - nearest45) < 5) {
        angleDeg = nearest45 % 360;
      }

      updatedItem.rotation = angleDeg;
    } else {
      // Corner & Edge Resizing
      const MIN_SIZE_PERCENT = 6;
      let newW = initialItem.width;
      let newH = initialItem.height;
      let newX = initialItem.x;
      let newY = initialItem.y;

      if (mode === 'se') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width + deltaXPercent);
        newH = (newW / initialItem.aspectRatio) * paperAspectRatio;
      } else if (mode === 'sw') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width - deltaXPercent);
        newH = (newW / initialItem.aspectRatio) * paperAspectRatio;
        newX = initialItem.x + (initialItem.width - newW);
      } else if (mode === 'ne') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width + deltaXPercent);
        newH = (newW / initialItem.aspectRatio) * paperAspectRatio;
        newY = initialItem.y + (initialItem.height - newH);
      } else if (mode === 'nw') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width - deltaXPercent);
        newH = (newW / initialItem.aspectRatio) * paperAspectRatio;
        newX = initialItem.x + (initialItem.width - newW);
        newY = initialItem.y + (initialItem.height - newH);
      } else if (mode === 'e') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width + deltaXPercent);
      } else if (mode === 'w') {
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width - deltaXPercent);
        newX = initialItem.x + (initialItem.width - newW);
      } else if (mode === 's') {
        newH = Math.max(MIN_SIZE_PERCENT, initialItem.height + deltaYPercent);
      } else if (mode === 'n') {
        newH = Math.max(MIN_SIZE_PERCENT, initialItem.height - deltaYPercent);
        newY = initialItem.y + (initialItem.height - newH);
      }

      updatedItem.width = newW;
      updatedItem.height = newH;
      updatedItem.x = newX;
      updatedItem.y = newY;
    }

    pendingItemUpdate.current = updatedItem;

    // Throttle rendering with requestAnimationFrame
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (pendingItemUpdate.current) {
          const toApply = pendingItemUpdate.current;
          setItems((prev) =>
            prev.map((it) => (it.id === toApply.id ? toApply : it))
          );
        }
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    if (pendingItemUpdate.current) {
      const finalItem = pendingItemUpdate.current;
      setItems((prev) =>
        prev.map((it) => (it.id === finalItem.id ? finalItem : it))
      );
      pendingItemUpdate.current = null;
    }

    if (dragRef.current) {
      pushHistory(items);
      dragRef.current = null;
    }

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // -------------------------------------------------------------
  // High-Resolution Multi-Page Print Export
  // -------------------------------------------------------------
  const getPaperPoints = (size: string, landscape: boolean) => {
    const s = (size || 'A4').toUpperCase();
    let w = 595.28;
    let h = 841.89;
    if (s === 'LETTER') {
      w = 612;
      h = 792;
    } else if (s === 'LEGAL') {
      w = 612;
      h = 1008;
    } else if (s === 'A3') {
      w = 841.89;
      h = 1190.55;
    } else if (s === 'TABLOID') {
      w = 792;
      h = 1224;
    }
    return landscape ? { width: h, height: w } : { width: w, height: h };
  };

  const handleExportToPrint = async () => {
    if (items.length === 0 && pageCount <= 0) return;
    setIsExporting(true);

    try {
      // 300 DPI Print Resolution Dimensions matching paperAspectRatio
      const baseDimension = 3508;
      let standardWidth: number;
      let standardHeight: number;

      if (isLandscape) {
        standardWidth = baseDimension;
        standardHeight = Math.round(baseDimension / paperAspectRatio);
      } else {
        standardHeight = baseDimension;
        standardWidth = Math.round(baseDimension * paperAspectRatio);
      }

      const { width: pdfWidth, height: pdfHeight } = getPaperPoints(paperSize, isLandscape);
      const pdfDoc = await PDFDocument.create();
      const allPagePreviews: string[] = [];

      // Render each page in sequential order
      for (let p = 0; p < pageCount; p++) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = standardWidth;
        pageCanvas.height = standardHeight;
        const ctx = pageCanvas.getContext('2d');

        if (!ctx) throw new Error('Could not initialize canvas context');

        // Clean white paper background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, standardWidth, standardHeight);

        // Sort items for this page by z-index ascending
        const pageItems = items
          .filter((it) => (it.pageIndex ?? 0) === p)
          .sort((a, b) => a.zIndex - b.zIndex);

        // Draw each item at full print resolution
        for (const item of pageItems) {
          let img = item.originalImg;
          if (!img || !img.complete) {
            img = await loadImage(item.src);
          }

          const px = (item.x / 100) * standardWidth;
          const py = (item.y / 100) * standardHeight;
          const pw = (item.width / 100) * standardWidth;
          const ph = (item.height / 100) * standardHeight;

          ctx.save();
          ctx.translate(px + pw / 2, py + ph / 2);
          if (item.rotation) {
            ctx.rotate((item.rotation * Math.PI) / 180);
          }

          if (isBw) {
            ctx.filter = 'grayscale(100%)';
          }

          ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
          ctx.restore();
        }

        // Convert page canvas to JPEG blob
        const jpegBlob = await new Promise<Blob | null>((resolve) =>
          pageCanvas.toBlob(resolve, 'image/jpeg', 0.95)
        );

        if (!jpegBlob) throw new Error(`Failed to render canvas for page ${p + 1}`);

        const previewDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
        allPagePreviews.push(previewDataUrl);

        // Add page to PDF document
        const pdfPage = pdfDoc.addPage([pdfWidth, pdfHeight]);
        const imageBytes = await jpegBlob.arrayBuffer();
        const embeddedImage = await pdfDoc.embedJpg(imageBytes);

        pdfPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: pdfWidth,
          height: pdfHeight,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const finalPdfFile = new File(
        [pdfBlob],
        'Custom_Design.pdf',
        { type: 'application/pdf' }
      );

      await onApplyLayout(finalPdfFile, allPagePreviews[0], allPagePreviews);
      setJustApplied(true);
      setTimeout(() => setJustApplied(false), 2500);
    } catch (err) {
      console.error('Failed to export Canva layout:', err);
      alert('Could not render printable layout. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full flex flex-col min-h-0 bg-[#26282b] text-slate-100 select-none overflow-hidden"
    >
      {/* Hidden File Input for Adding Multiple Images */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleAddFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* -------------------------------------------------------------
          TOP TOOLBAR: Add Image, + Add Page, Undo, & Apply
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#1e2022] border-b border-[#3c4043] px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-30 shadow-md">
        {/* Left Side: Add Image and Add Page buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer touch-manipulation"
            title="Upload photo from device"
          >
            <Upload className="w-4 h-4" />
            <span>+ Add Image</span>
          </button>

          {/* Add Page Button like Canva */}
          <button
            type="button"
            onClick={handleAddPage}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-indigo-300 hover:text-white text-xs font-extrabold flex items-center gap-1.5 border border-slate-700/80 shadow-xs transition-all cursor-pointer touch-manipulation"
            title="Add a same-sized blank page"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>+ Add Page</span>
          </button>

          <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300 font-bold uppercase hidden sm:inline-block">
            {paperSize} • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        </div>

        {/* Right Side: Undo, Apply CTA, and Close */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-colors touch-manipulation"
              title="Undo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Apply to Print CTA Button */}
          <button
            type="button"
            onClick={handleExportToPrint}
            disabled={isExporting || items.length === 0}
            className={`px-3.5 py-1.5 rounded-xl active:scale-95 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md ring-1 transition-all cursor-pointer touch-manipulation ${
              justApplied
                ? 'bg-emerald-500 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 ring-emerald-400/40 shadow-emerald-950/50'
            }`}
            title="Apply canvas design and open Print Preview"
          >
            {isExporting ? (
              <span className="animate-pulse">Applying...</span>
            ) : justApplied ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Applied!</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Apply &amp; Preview</span>
                <span className="text-sm leading-none">→</span>
              </>
            )}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation ml-0.5"
              title="Close Canva Studio"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
          CENTER MULTI-PAGE WORKSPACE (LIKE CANVA)
          Scrollable workspace with blank pages & "+ Add Page" button
          ------------------------------------------------------------- */}
      <div
        className="flex-1 w-full flex flex-col items-center p-3 sm:p-6 overflow-y-auto overflow-x-hidden relative cursor-default"
        onClick={() => setSelectedId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleAddFiles(e.dataTransfer.files);
          }
        }}
      >
        <div className="flex flex-col items-center gap-6 w-full pb-10">
          {Array.from({ length: pageCount }, (_, pageIdx) => {
            const pageItems = items.filter((it) => (it.pageIndex ?? 0) === pageIdx);
            const isActivePage = activePageIndex === pageIdx;

            return (
              <div
                key={`page-container-${pageIdx}`}
                className="flex flex-col items-center gap-2 w-full shrink-0"
              >
                {/* Page Header Bar with Page Number & Actions */}
                <div
                  className="flex items-center justify-between w-full px-1 text-xs font-bold text-slate-400"
                  style={{
                    width: isLandscape
                      ? `${Math.round(860 * (zoomLevel / 100))}px`
                      : `${Math.round(620 * (zoomLevel / 100))}px`,
                    maxWidth: '96%',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${
                        isActivePage
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
                      }`}
                    >
                      Page {pageIdx + 1} of {pageCount}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {pageItems.length} {pageItems.length === 1 ? 'image' : 'images'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicatePage(pageIdx);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Duplicate Page"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {pageCount > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePage(pageIdx);
                        }}
                        className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/60 transition-colors"
                        title="Delete Page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Printable Paper Canvas Sheet (Blank Same-Sized Page) */}
                <div
                  data-canva-page={pageIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePageIndex(pageIdx);
                  }}
                  className={`relative bg-white rounded-xs shadow-[0_12px_45px_rgba(0,0,0,0.7)] border overflow-hidden touch-none transition-all ${
                    isActivePage ? 'border-indigo-500/70 ring-2 ring-indigo-500/30' : 'border-slate-400/40'
                  }`}
                  style={{
                    aspectRatio: `${paperAspectRatio}`,
                    width: isLandscape
                      ? `${Math.round(860 * (zoomLevel / 100))}px`
                      : `${Math.round(620 * (zoomLevel / 100))}px`,
                    maxWidth: '96%',
                    maxHeight: '85vh',
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >

                  {/* Center alignment guides */}
                  <div className="absolute inset-x-0 top-1/2 h-[1px] border-b border-dashed border-indigo-200/50 pointer-events-none z-0" />
                  <div className="absolute inset-y-0 left-1/2 w-[1px] border-r border-dashed border-indigo-200/50 pointer-events-none z-0" />

                  {/* Render All Canvas Image Items for this page */}
                  {pageItems.map((item) => {
                    const isSelected = item.id === selectedId;

                    return (
                      <div
                        key={item.id}
                        onPointerDown={(e) => handlePointerDown(e, item, 'move')}
                        className={`absolute select-none cursor-move touch-none transition-shadow will-change-transform ${
                          isSelected ? 'z-20' : ''
                        }`}
                        style={{
                          left: `${item.x}%`,
                          top: `${item.y}%`,
                          width: `${item.width}%`,
                          height: `${item.height}%`,
                          transform: `rotate(${item.rotation}deg)`,
                          transformOrigin: 'center center',
                          zIndex: item.zIndex,
                          filter: isBw ? 'grayscale(100%)' : 'none',
                        }}
                      >
                        {/* Image Element */}
                        <img
                          src={item.src}
                          alt={item.name}
                          draggable={false}
                          className="w-full h-full object-fill block select-none pointer-events-none"
                        />

                        {/* Canva Active Selection Frame & Floating Action Toolbar */}
                        {isSelected && (
                          <div className="absolute -inset-[2px] border-2 border-indigo-600 pointer-events-auto touch-none">
                            {/* FLOATING ACTION TOOLBAR DIRECTLY OVER THE IMAGE LIKE CANVA */}
                            <div
                              className={`absolute ${
                                item.y < 14 ? 'top-1.5' : '-top-11'
                              } left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#1e2022]/95 text-white p-1 rounded-xl shadow-2xl border border-slate-600/90 z-50 pointer-events-auto backdrop-blur-md select-none animate-fade-in-scale`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateSelected();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 active:scale-95 text-slate-200 hover:text-white transition-all text-xs font-bold cursor-pointer shadow-xs"
                                title="Copy / Duplicate Image"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Copy</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRotate90();
                                }}
                                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white transition-all cursor-pointer"
                                title="Rotate 90°"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>

                              <div className="w-[1px] h-3.5 bg-slate-700 mx-0.5" />

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSelected();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-600 active:scale-95 text-rose-300 hover:text-white transition-all text-xs font-bold cursor-pointer shadow-xs"
                                title="Remove / Delete Image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Remove</span>
                              </button>
                            </div>

                            {/* Dimension Badge */}
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[9px] font-bold tracking-wider shadow-sm pointer-events-none whitespace-nowrap">
                              {Math.round(item.width)}% × {Math.round(item.height)}%
                              {item.rotation !== 0 && ` (${item.rotation}°)`}
                            </div>

                            {/* Top Rotation Knob */}
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'rotate')}
                              className="absolute -top-7 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 hover:bg-indigo-50 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center touch-none transition-transform hover:scale-110 active:scale-125"
                              title="Drag to rotate"
                            >
                              <RotateCw className="w-3.5 h-3.5 text-indigo-600 pointer-events-none" />
                            </div>
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-[2px] h-2 bg-indigo-600 pointer-events-none" />

                            {/* Touch-Friendly Corner Resize Handles */}
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'nw')}
                              className="absolute -top-2.5 -left-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nwse-resize shadow-md touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'ne')}
                              className="absolute -top-2.5 -right-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nesw-resize shadow-md touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'se')}
                              className="absolute -bottom-2.5 -right-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nwse-resize shadow-md touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'sw')}
                              className="absolute -bottom-2.5 -left-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nesw-resize shadow-md touch-none"
                            />

                            {/* Mid-edge stretch handles */}
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'n')}
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-indigo-600 rounded-xs cursor-ns-resize touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 's')}
                              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-indigo-600 rounded-xs cursor-ns-resize touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'w')}
                              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-4 bg-white border border-indigo-600 rounded-xs cursor-ew-resize touch-none"
                            />
                            <div
                              onPointerDown={(e) => handlePointerDown(e, item, 'e')}
                              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-4 bg-white border border-indigo-600 rounded-xs cursor-ew-resize touch-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Blank Page Hint */}
                  {pageItems.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 touch-none pointer-events-none">
                      <ImageIcon className="w-8 h-8 mb-1.5 text-slate-300 stroke-[1.5]" />
                      <p className="text-xs font-bold text-slate-500 mb-0.5">Blank Page {pageIdx + 1}</p>
                      <p className="text-[10px] text-slate-400">Tap "+ Add Image" above to place photos here.</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Page Button below all pages */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddPage();
            }}
            className="py-3 px-6 rounded-2xl bg-[#1e2022] hover:bg-[#2b2d30] border-2 border-dashed border-indigo-500/70 hover:border-indigo-400 text-indigo-300 hover:text-white font-extrabold text-xs flex items-center gap-2.5 shadow-xl transition-all active:scale-95 cursor-pointer touch-manipulation my-2"
          >
            <div className="w-5 h-5 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>+ Add Page</span>
            <span className="text-[11px] text-slate-400 font-normal">
              (Add blank {paperSize} {isLandscape ? 'Landscape' : 'Portrait'} page)
            </span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          BOTTOM FOOTER: Status
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#1e2022] border-t border-[#3c4043] px-3.5 py-2 text-xs text-slate-400 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span>
            {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {items.length} {items.length === 1 ? 'photo' : 'photos'}
          </span>
          <span className="hidden sm:inline-block">· Drag or pinch to resize</span>
        </div>

        <button
          type="button"
          onClick={handleExportToPrint}
          disabled={isExporting || items.length === 0}
          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/60 transition-all cursor-pointer touch-manipulation disabled:opacity-50"
          title="Apply canvas design and open Print Preview"
        >
          {isExporting ? (
            <span className="animate-pulse">Applying...</span>
          ) : (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Apply &amp; Open Preview</span>
              <span className="text-sm leading-none">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
