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
} from '@/components/ui/Icons';
import { PDFDocument } from 'pdf-lib';

export interface CanvaImageItem {
  id: string;
  src: string;
  name: string;
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
  paperSize: string;
  isLandscape: boolean;
  paperAspectRatio: number;
  isBw: boolean;
  zoomLevel: number;
  onApplyLayout: (file: File) => Promise<void> | void;
  onCancel?: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rotate';

export const CanvaStudioCanvas: React.FC<CanvaStudioCanvasProps> = ({
  initialImages,
  paperSize,
  isLandscape,
  paperAspectRatio,
  isBw,
  zoomLevel,
  onApplyLayout,
  onCancel,
}) => {
  const [items, setItems] = useState<CanvaImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [history, setHistory] = useState<CanvaImageItem[][]>([]);
  const [isGuidelineVisible, setIsGuidelineVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // High-performance 120 FPS animation frame reference for mobile touch
  const rafId = useRef<number | null>(null);
  const pendingItemUpdate = useRef<CanvaImageItem | null>(null);

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

  // Initialize items from initialImages on mount
  useEffect(() => {
    if (initialImages.length === 0) return;

    let isMounted = true;
    const initItems = async () => {
      const loadedItems: CanvaImageItem[] = [];

      for (let i = 0; i < initialImages.length; i++) {
        const item = initialImages[i];
        try {
          const img = await loadImage(item.url);
          if (!isMounted) return;

          const imgAspect = img.naturalWidth / (img.naturalHeight || 1);
          // Scale item to fit neatly inside paper margins
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
      }
    };

    void initItems();
    return () => {
      isMounted = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [initialImages, loadImage, paperAspectRatio]);

  // Add new image files to canvas
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
          const offset = ((items.length + i) % 5) * 4;
          const x = Math.min(75, Math.max(5, 20 + offset));
          const y = Math.min(75, Math.max(5, 20 + offset));

          const nextZ = items.reduce((max, it) => Math.max(max, it.zIndex), 0) + 1;
          newItems.push({
            id: `img-${Date.now()}-${i}`,
            src: objectUrl,
            name: file.name,
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
    [items, loadImage, paperAspectRatio, pushHistory]
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

  // Quick Action: Delete
  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory(items);
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    setSelectedId(null);
  }, [items, selectedId, pushHistory]);

  // Quick Action: Duplicate
  const handleDuplicateSelected = useCallback(() => {
    if (!selectedItem) return;
    pushHistory(items);
    const maxZ = items.reduce((max, it) => Math.max(max, it.zIndex), 0) + 1;
    const duplicated: CanvaImageItem = {
      ...selectedItem,
      id: `copy-${Date.now()}`,
      x: Math.min(85, selectedItem.x + 5),
      y: Math.min(85, selectedItem.y + 5),
      zIndex: maxZ,
    };
    setItems((prev) => [...prev, duplicated]);
    setSelectedId(duplicated.id);
  }, [items, selectedItem, pushHistory]);

  // Quick Action: Rotate 90
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
  // Mobile-Optimized Pointer Event Handlers (Butter-Smooth 120 FPS)
  // -------------------------------------------------------------
  const handlePointerDown = (
    e: React.PointerEvent,
    item: CanvaImageItem,
    mode: DragMode
  ) => {
    e.stopPropagation();

    const sheet = sheetRef.current;
    if (!sheet) return;

    setSelectedId(item.id);
    const rect = sheet.getBoundingClientRect();

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
    };

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();

    const { mode, startX, startY, initialItem, sheetWidth, sheetHeight, centerX, centerY } =
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
      const sheet = sheetRef.current;
      if (!sheet) return;
      const rect = sheet.getBoundingClientRect();
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

    // Throttle rendering with requestAnimationFrame for 60/120 FPS on mobile
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
  // High-Resolution Print Export (Generates print-ready PDF/Image)
  // -------------------------------------------------------------
  const handleExportToPrint = async () => {
    if (items.length === 0) return;
    setIsExporting(true);

    try {
      // 300 DPI Print Resolution Dimensions (A4: 2480 x 3508 px)
      const standardWidth = isLandscape ? 3508 : 2480;
      const standardHeight = isLandscape ? 2480 : 3508;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = standardWidth;
      exportCanvas.height = standardHeight;
      const ctx = exportCanvas.getContext('2d');

      if (!ctx) throw new Error('Could not initialize canvas context');

      // 1. Fill clean white paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, standardWidth, standardHeight);

      // 2. Sort items by z-index ascending
      const sortedItems = [...items].sort((a, b) => a.zIndex - b.zIndex);

      // 3. Draw each item at full resolution
      for (const item of sortedItems) {
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

      // 4. Convert canvas to JPEG blob
      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob(resolve, 'image/jpeg', 0.95)
      );

      if (!jpegBlob) throw new Error('Failed to render canvas image');

      // 5. Wrap into a 1-page PDF matching exact paperSize points
      const pdfDoc = await PDFDocument.create();
      const pdfWidth = isLandscape ? 841.89 : 595.28;
      const pdfHeight = isLandscape ? 595.28 : 841.89;

      const page = pdfDoc.addPage([pdfWidth, pdfHeight]);
      const imageBytes = await jpegBlob.arrayBuffer();
      const embeddedImage = await pdfDoc.embedJpg(imageBytes);

      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      });

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const finalPdfFile = new File(
        [pdfBlob],
        `Canva_Layout_${Date.now()}.pdf`,
        { type: 'application/pdf' }
      );

      await onApplyLayout(finalPdfFile);
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
      className="flex-1 w-full h-full flex flex-col min-h-0 bg-[#26282b] text-slate-100 select-none overflow-hidden touch-none overscroll-none"
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
          CLEAN SIMPLIFIED TOOLBAR: Add Image, Rotate, Duplicate, Delete & Apply
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#1e2022] border-b border-[#3c4043] px-3 py-2 flex items-center justify-between gap-2 shrink-0 z-30 shadow-md">
        {/* Left Side: Add Image button */}
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

          <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300 font-bold uppercase hidden sm:inline-block">
            {paperSize}
          </span>
        </div>

        {/* Right Side: Selected Actions & Apply */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {selectedItem && (
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                onClick={handleRotate90}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDuplicateSelected}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation"
                title="Duplicate Image"
              >
                <Copy className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleDeleteSelected}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/60 transition-colors touch-manipulation"
                title="Delete Image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

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
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-400/40 transition-all cursor-pointer touch-manipulation"
          >
            {isExporting ? (
              <span className="animate-pulse">Applying...</span>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Apply</span>
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
          CENTER INTERACTIVE WORKSPACE: Paper Sheet with Touch-Optimized Drag
          ------------------------------------------------------------- */}
      <div
        className="flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden relative cursor-default touch-none overscroll-none"
        onClick={() => setSelectedId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleAddFiles(e.dataTransfer.files);
          }
        }}
      >
        {/* Printable Paper Canvas Sheet */}
        <div
          ref={sheetRef}
          className="relative bg-white rounded-xs shadow-[0_12px_45px_rgba(0,0,0,0.7)] border border-slate-400/40 overflow-hidden touch-none"
          style={{
            aspectRatio: `${paperAspectRatio}`,
            width: isLandscape
              ? `${Math.round(480 * (zoomLevel / 100))}px`
              : `${Math.round(360 * (zoomLevel / 100))}px`,
            maxWidth: '94%',
            maxHeight: '74vh',
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Subtle Print Safe Margin Guide */}
          {isGuidelineVisible && (
            <div className="absolute inset-[3.5%] border border-dashed border-slate-300 pointer-events-none z-0" />
          )}

          {/* Center alignment guides */}
          <div className="absolute inset-x-0 top-1/2 h-[1px] border-b border-dashed border-indigo-200/50 pointer-events-none z-0" />
          <div className="absolute inset-y-0 left-1/2 w-[1px] border-r border-dashed border-indigo-200/50 pointer-events-none z-0" />

          {/* Render All Canvas Image Items */}
          {items.map((item) => {
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

                {/* Canva Active Selection Frame & Touch-Friendly Handles */}
                {isSelected && (
                  <div className="absolute -inset-[2px] border-2 border-indigo-600 pointer-events-auto touch-none">
                    {/* Dimension Badge */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[9px] font-bold tracking-wider shadow-sm pointer-events-none whitespace-nowrap">
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

                    {/* Touch-Friendly Corner Resize Handles (18px touch area on mobile) */}
                    {/* NW Handle */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, item, 'nw')}
                      className="absolute -top-2.5 -left-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nwse-resize shadow-md touch-none"
                    />
                    {/* NE Handle */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, item, 'ne')}
                      className="absolute -top-2.5 -right-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nesw-resize shadow-md touch-none"
                    />
                    {/* SE Handle */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, item, 'se')}
                      className="absolute -bottom-2.5 -right-2.5 w-5 h-5 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 rounded-full hover:scale-125 transition-transform cursor-nwse-resize shadow-md touch-none"
                    />
                    {/* SW Handle */}
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

          {/* Empty Sheet Placeholder */}
          {items.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 touch-none">
              <ImageIcon className="w-10 h-10 mb-2 text-slate-300 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-600 mb-1">Canvas is Empty</p>
              <p className="text-[11px] text-slate-400 max-w-[200px] mb-3">
                Tap "+ Add Image" to place photos onto the page.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-sm cursor-pointer touch-manipulation"
              >
                + Add Image
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
          BOTTOM FOOTER: Clean status & Print margins toggle
          ------------------------------------------------------------- */}
      <div className="w-full bg-[#1e2022] border-t border-[#3c4043] px-3 py-1.5 text-[11px] text-slate-400 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span>
            {items.length} {items.length === 1 ? 'photo' : 'photos'}
          </span>
          <span className="hidden sm:inline-block">· Drag or pinch to resize</span>
        </div>

        <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-slate-400 hover:text-slate-200">
          <input
            type="checkbox"
            checked={isGuidelineVisible}
            onChange={(e) => setIsGuidelineVisible(e.target.checked)}
            className="w-3 h-3 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
          />
          <span>Margins</span>
        </label>
      </div>
    </div>
  );
};
