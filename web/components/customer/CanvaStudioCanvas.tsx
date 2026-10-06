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
  Plus,
  Sparkles,
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
  cropTop?: number; // 0 to 100 (% cropped from top)
  cropBottom?: number; // 0 to 100 (% cropped from bottom)
  cropLeft?: number; // 0 to 100 (% cropped from left)
  cropRight?: number; // 0 to 100 (% cropped from right)
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
  onApplyLayout: (
    file: File,
    previewDataUrl?: string,
    allPagePreviews?: string[],
    appliedItems?: CanvaImageItem[]
  ) => Promise<void> | void;
  onCancel?: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rotate';

const MAX_CROP_PER_AXIS = 90;
const MIN_CANVAS_ZOOM = 40;
const MAX_CANVAS_ZOOM = 200;

function normalizeCropPair(first?: number, second?: number): [number, number] {
  const safeFirst = Math.max(0, first || 0);
  const safeSecond = Math.max(0, second || 0);
  const total = safeFirst + safeSecond;
  if (total <= MAX_CROP_PER_AXIS) return [safeFirst, safeSecond];
  const scale = MAX_CROP_PER_AXIS / total;
  return [safeFirst * scale, safeSecond * scale];
}

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
  const [canvasZoom, setCanvasZoom] = useState(() => Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoomLevel || 100)));

  // An upload can be represented by the same object URL more than once while
  // the preview is being prepared. Seed the editor from each source only once.
  const uniqueInitialImages = useMemo(() => {
    const seenSources = new Set<string>();
    return initialImages.filter((image) => {
      if (seenSources.has(image.url)) return false;
      seenSources.add(image.url);
      return true;
    });
  }, [initialImages]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // High-performance 120 FPS animation frame reference for mobile touch
  const rafId = useRef<number | null>(null);
  const gestureRafId = useRef<number | null>(null);
  const pendingItemUpdate = useRef<CanvaImageItem | null>(null);
  const pendingGestureUpdate = useRef<{ zoom?: number; item?: CanvaImageItem }>({});
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
  const touchPointers = useRef(new Map<number, { x: number; y: number; itemId?: string }>());
  const pinchRef = useRef<{
    mode: 'canvas' | 'resize';
    startDistance: number;
    startZoom: number;
    initialItem?: CanvaImageItem;
    initialItems: CanvaImageItem[];
    historySaved: boolean;
  } | null>(null);

  // Push state to history for Undo
  const pushHistory = useCallback((newItems: CanvaImageItem[]) => {
    setHistory((prev) => [...prev.slice(-15), newItems]);
  }, []);

  useEffect(() => {
    setCanvasZoom(Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, zoomLevel || 100)));
  }, [zoomLevel]);

  useEffect(() => () => {
    if (gestureRafId.current !== null) cancelAnimationFrame(gestureRafId.current);
  }, []);

  const flushGestureUpdate = useCallback(() => {
    const pending = pendingGestureUpdate.current;
    pendingGestureUpdate.current = {};
    gestureRafId.current = null;
    if (typeof pending.zoom === 'number') setCanvasZoom(pending.zoom);
    if (pending.item) {
      setItems((previous) => previous.map((item) => (item.id === pending.item!.id ? pending.item! : item)));
    }
  }, []);

  const scheduleGestureUpdate = useCallback((update: { zoom?: number; item?: CanvaImageItem }) => {
    pendingGestureUpdate.current = update;
    if (gestureRafId.current === null) {
      gestureRafId.current = requestAnimationFrame(flushGestureUpdate);
    }
  }, [flushGestureUpdate]);

  const beginTouchGesture = useCallback((e: React.PointerEvent, itemId?: string) => {
    if (e.pointerType !== 'touch') return false;
    touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, itemId });
    if (touchPointers.current.size !== 2) return false;

    const pointers = [...touchPointers.current.values()];
    const startDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    if (startDistance < 1) return false;

    const selectedItem = selectedId ? items.find((item) => item.id === selectedId) : undefined;
    const resizeImage = Boolean(
      selectedItem && pointers.every((pointer) => pointer.itemId === selectedItem.id)
    );
    pinchRef.current = {
      mode: resizeImage ? 'resize' : 'canvas',
      startDistance,
      startZoom: canvasZoom,
      initialItem: resizeImage ? { ...selectedItem! } : undefined,
      initialItems: items,
      historySaved: false,
    };
    dragRef.current = null;
    pendingItemUpdate.current = null;
    return true;
  }, [canvasZoom, items, selectedId]);

  const updateTouchGesture = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !touchPointers.current.has(e.pointerId)) return false;
    const pointer = touchPointers.current.get(e.pointerId)!;
    touchPointers.current.set(e.pointerId, { ...pointer, x: e.clientX, y: e.clientY });
    const gesture = pinchRef.current;
    if (!gesture || touchPointers.current.size < 2) return false;

    const pointers = [...touchPointers.current.values()];
    const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    const scale = Math.max(0.25, Math.min(4, distance / gesture.startDistance));

    if (gesture.mode === 'canvas') {
      scheduleGestureUpdate({ zoom: Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, gesture.startZoom * scale)) });
      return true;
    }

    const initialItem = gesture.initialItem;
    if (!initialItem) return true;
    const ratio = Math.max(0.01, initialItem.width / Math.max(0.01, initialItem.height));
    const centerX = initialItem.x + initialItem.width / 2;
    const centerY = initialItem.y + initialItem.height / 2;
    const maxWidth = Math.min(
      centerX * 2,
      (100 - centerX) * 2,
      centerY * 2 * ratio,
      (100 - centerY) * 2 * ratio
    );
    const minWidth = Math.min(maxWidth, Math.max(6, 6 * ratio));
    const width = Math.max(minWidth, Math.min(maxWidth, initialItem.width * scale));
    const height = width / ratio;
    const resized = {
      ...initialItem,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
    scheduleGestureUpdate({ item: resized });
    return true;
  }, [scheduleGestureUpdate]);

  const endTouchGesture = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return false;
    touchPointers.current.delete(e.pointerId);
    const gesture = pinchRef.current;
    if (!gesture || touchPointers.current.size >= 2) return false;
    if (gestureRafId.current !== null) {
      cancelAnimationFrame(gestureRafId.current);
      gestureRafId.current = null;
      const pending = pendingGestureUpdate.current;
      pendingGestureUpdate.current = {};
      if (typeof pending.zoom === 'number') setCanvasZoom(pending.zoom);
      if (pending.item) setItems((previous) => previous.map((item) => (item.id === pending.item!.id ? pending.item! : item)));
    }
    if (gesture.mode === 'resize' && !gesture.historySaved) {
      pushHistory(gesture.initialItems);
    }
    pinchRef.current = null;
    dragRef.current = null;
    return true;
  }, [pushHistory]);

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
    if (uniqueInitialImages.length === 0) return;
    hasInitialized.current = true;

    let isMounted = true;
    const initItems = async () => {
      const loadedItems: CanvaImageItem[] = [];
      // New uploads begin as a single collage page. Pages are an explicit
      // editor action; selecting four photos should not silently create four
      // print pages.
      const imageCount = uniqueInitialImages.length;
      const columns = Math.ceil(Math.sqrt(imageCount));
      const rows = Math.ceil(imageCount / columns);
      const pageMargin = 4;
      const gridGap = 3;
      const cellWidth = (100 - pageMargin * 2 - gridGap * (columns - 1)) / columns;
      const cellHeight = (100 - pageMargin * 2 - gridGap * (rows - 1)) / rows;

      for (let i = 0; i < uniqueInitialImages.length; i++) {
        const item = uniqueInitialImages[i];
        try {
          const img = await loadImage(item.url);
          if (!isMounted) return;

          const imgAspect = img.naturalWidth / (img.naturalHeight || 1);
          const column = i % columns;
          const row = Math.floor(i / columns);
          const maxItemWidth = cellWidth;
          const maxItemHeight = cellHeight;
          let itemW = Math.min(maxItemWidth, (maxItemHeight * imgAspect) / paperAspectRatio);
          let itemH = (itemW / imgAspect) * paperAspectRatio;

          if (itemH > maxItemHeight) {
            itemH = maxItemHeight;
            itemW = (itemH * imgAspect) / paperAspectRatio;
          }

          // Center each image in its grid cell on the first page.
          const cellX = pageMargin + column * (cellWidth + gridGap);
          const cellY = pageMargin + row * (cellHeight + gridGap);
          const x = cellX + (cellWidth - itemW) / 2;
          const y = cellY + (cellHeight - itemH) / 2;

          loadedItems.push({
            id: `item-${Date.now()}-${i}`,
            src: item.url,
            name: item.name,
            pageIndex: 0,
            x,
            y,
            width: itemW,
            height: itemH,
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
        setPageCount(1);
        setSelectedId(loadedItems[0].id);
        onItemsChange?.(loadedItems);
      }
    };

    void initItems();
    return () => {
      isMounted = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [uniqueInitialImages, loadImage, paperAspectRatio, items.length, onItemsChange]);

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

    if (beginTouchGesture(e, item.id)) return;

    // Automatically elevate tapped/selected item to top layer (highest zIndex)
    setItems((prev) => {
      const maxZ = prev.reduce((max, it) => Math.max(max, it.zIndex || 0), 0);
      if (item.zIndex >= maxZ && maxZ > 0) return prev;
      return prev.map((it) => (it.id === item.id ? { ...it, zIndex: maxZ + 1 } : it));
    });

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
    if (updateTouchGesture(e)) return;
    if (!dragRef.current) return;
    e.preventDefault();

    const { mode, startX, startY, initialItem, sheetWidth, sheetHeight, centerX, centerY, pageSheet } =
      dragRef.current;

    const deltaXPixels = e.clientX - startX;
    const deltaYPixels = e.clientY - startY;

    const deltaXPercent = (deltaXPixels / sheetWidth) * 100;
    const deltaYPercent = (deltaYPixels / sheetHeight) * 100;

    const updatedItem: CanvaImageItem = { ...initialItem };

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

      // Constrain strictly inside sheet
      nextX = Math.max(0, Math.min(100 - initialItem.width, nextX));
      nextY = Math.max(0, Math.min(100 - initialItem.height, nextY));

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
      // Corner resizing and Canva-style edge cropping.
      const MIN_SIZE_PERCENT = 6;
      let newW = initialItem.width;
      let newH = initialItem.height;
      let newX = initialItem.x;
      let newY = initialItem.y;

      // A corrupt or previously over-cropped item must never be rendered from
      // a 1% source sliver, which would make the photo appear to explode.
      let [cTop, cBottom] = normalizeCropPair(initialItem.cropTop, initialItem.cropBottom);
      let [cLeft, cRight] = normalizeCropPair(initialItem.cropLeft, initialItem.cropRight);

      // Resize the visible frame, not the original image. This preserves the
      // current crop aspect ratio after the user has trimmed an edge.
      const frameRatio = Math.max(0.01, initialItem.width / Math.max(0.01, initialItem.height));
      const minWidth = Math.max(MIN_SIZE_PERCENT, MIN_SIZE_PERCENT * frameRatio);

      if (mode === 'se') {
        const maxWidth = Math.min(100 - initialItem.x, (100 - initialItem.y) * frameRatio);
        newW = Math.max(Math.min(minWidth, maxWidth), Math.min(maxWidth, initialItem.width + deltaXPercent));
        newH = newW / frameRatio;
      } else if (mode === 'sw') {
        const right = initialItem.x + initialItem.width;
        const maxWidth = Math.min(right, (100 - initialItem.y) * frameRatio);
        newW = Math.max(Math.min(minWidth, maxWidth), Math.min(maxWidth, initialItem.width - deltaXPercent));
        newH = newW / frameRatio;
        newX = right - newW;
      } else if (mode === 'ne') {
        const bottom = initialItem.y + initialItem.height;
        const maxWidth = Math.min(100 - initialItem.x, bottom * frameRatio);
        newW = Math.max(Math.min(minWidth, maxWidth), Math.min(maxWidth, initialItem.width + deltaXPercent));
        newH = newW / frameRatio;
        newY = bottom - newH;
      } else if (mode === 'nw') {
        const right = initialItem.x + initialItem.width;
        const bottom = initialItem.y + initialItem.height;
        const maxWidth = Math.min(right, bottom * frameRatio);
        newW = Math.max(Math.min(minWidth, maxWidth), Math.min(maxWidth, initialItem.width - deltaXPercent));
        newH = newW / frameRatio;
        newX = right - newW;
        newY = bottom - newH;
      } else if (mode === 'n') {
        const visibleHeight = Math.max(0.1, 100 - cTop - cBottom);
        const pctChange = (deltaYPercent / Math.max(0.1, initialItem.height)) * visibleHeight;
        const maxCropChange = ((initialItem.height - MIN_SIZE_PERCENT) / Math.max(0.1, initialItem.height)) * visibleHeight;
        const nextCropTop = Math.max(0, Math.min(MAX_CROP_PER_AXIS - cBottom, cTop + maxCropChange, cTop + pctChange));
        const actualPctDiff = nextCropTop - cTop;
        const yOffsetPercent = (actualPctDiff / visibleHeight) * initialItem.height;

        cTop = nextCropTop;
        newY = initialItem.y + yOffsetPercent;
        newH = Math.max(MIN_SIZE_PERCENT, initialItem.height - yOffsetPercent);
      } else if (mode === 's') {
        const visibleHeight = Math.max(0.1, 100 - cTop - cBottom);
        const pctChange = (-deltaYPercent / Math.max(0.1, initialItem.height)) * visibleHeight;
        const maxCropChange = ((initialItem.height - MIN_SIZE_PERCENT) / Math.max(0.1, initialItem.height)) * visibleHeight;
        const nextCropBottom = Math.max(0, Math.min(MAX_CROP_PER_AXIS - cTop, cBottom + maxCropChange, cBottom + pctChange));
        const actualPctDiff = nextCropBottom - cBottom;
        const heightReductionPercent = (actualPctDiff / visibleHeight) * initialItem.height;

        cBottom = nextCropBottom;
        newH = Math.max(MIN_SIZE_PERCENT, initialItem.height - heightReductionPercent);
      } else if (mode === 'w') {
        const visibleWidth = Math.max(0.1, 100 - cLeft - cRight);
        const pctChange = (deltaXPercent / Math.max(0.1, initialItem.width)) * visibleWidth;
        const maxCropChange = ((initialItem.width - MIN_SIZE_PERCENT) / Math.max(0.1, initialItem.width)) * visibleWidth;
        const nextCropLeft = Math.max(0, Math.min(MAX_CROP_PER_AXIS - cRight, cLeft + maxCropChange, cLeft + pctChange));
        const actualPctDiff = nextCropLeft - cLeft;
        const xOffsetPercent = (actualPctDiff / visibleWidth) * initialItem.width;

        cLeft = nextCropLeft;
        newX = initialItem.x + xOffsetPercent;
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width - xOffsetPercent);
      } else if (mode === 'e') {
        const visibleWidth = Math.max(0.1, 100 - cLeft - cRight);
        const pctChange = (-deltaXPercent / Math.max(0.1, initialItem.width)) * visibleWidth;
        const maxCropChange = ((initialItem.width - MIN_SIZE_PERCENT) / Math.max(0.1, initialItem.width)) * visibleWidth;
        const nextCropRight = Math.max(0, Math.min(MAX_CROP_PER_AXIS - cLeft, cRight + maxCropChange, cRight + pctChange));
        const actualPctDiff = nextCropRight - cRight;
        const widthReductionPercent = (actualPctDiff / visibleWidth) * initialItem.width;

        cRight = nextCropRight;
        newW = Math.max(MIN_SIZE_PERCENT, initialItem.width - widthReductionPercent);
      }

      // Constrain resize strictly inside 0-100% sheet bounds
      newX = Math.max(0, Math.min(100 - MIN_SIZE_PERCENT, newX));
      newY = Math.max(0, Math.min(100 - MIN_SIZE_PERCENT, newY));
      newW = Math.min(100 - newX, newW);
      newH = Math.min(100 - newY, newH);

      updatedItem.width = newW;
      updatedItem.height = newH;
      updatedItem.x = newX;
      updatedItem.y = newY;
      updatedItem.cropTop = cTop;
      updatedItem.cropBottom = cBottom;
      updatedItem.cropLeft = cLeft;
      updatedItem.cropRight = cRight;
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
    if (endTouchGesture(e)) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }

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
          try {
            let img = item.originalImg;
            if (!img || !img.complete || img.naturalWidth === 0) {
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

            const [cropLeft, cropRight] = normalizeCropPair(item.cropLeft, item.cropRight);
            const [cropTop, cropBottom] = normalizeCropPair(item.cropTop, item.cropBottom);

            const sx = (cropLeft / 100) * img.naturalWidth;
            const sy = (cropTop / 100) * img.naturalHeight;
            const sw = (Math.max(1, 100 - cropLeft - cropRight) / 100) * img.naturalWidth;
            const sh = (Math.max(1, 100 - cropTop - cropBottom) / 100) * img.naturalHeight;

            if (isBw) {
              ctx.filter = 'grayscale(100%)';
            }

            ctx.drawImage(img, sx, sy, sw, sh, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
          } catch (itemErr) {
            console.error(`Failed to load image for item ${item.name || item.id} during export:`, itemErr);
          }
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

      await onApplyLayout(finalPdfFile, allPagePreviews[0], allPagePreviews, items);
      setJustApplied(true);
      setTimeout(() => setJustApplied(false), 2500);
    } catch (err) {
      console.error('Failed to export Canva layout:', err);
      alert('Could not render printable layout. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePagePointerDown = (e: React.PointerEvent, pageIndex: number) => {
    setActivePageIndex(pageIndex);
    if (beginTouchGesture(e)) return;
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
            {paperSize} • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 p-1 text-slate-200">
          <button
            type="button"
            onClick={() => setCanvasZoom((current) => Math.max(MIN_CANVAS_ZOOM, current - 10))}
            className="w-7 h-7 rounded-lg hover:bg-slate-700 text-base font-bold transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setCanvasZoom(100)}
            className="min-w-12 px-1 h-7 rounded-lg hover:bg-slate-700 text-[10px] font-mono font-bold transition-colors"
            title="Reset zoom"
          >
            {Math.round(canvasZoom)}%
          </button>
          <button
            type="button"
            onClick={() => setCanvasZoom((current) => Math.min(MAX_CANVAS_ZOOM, current + 10))}
            className="w-7 h-7 rounded-lg hover:bg-slate-700 text-base font-bold transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

      </div>

      {/* -------------------------------------------------------------
          PAGE COLLECTION
          Keep the document pages in a horizontal, Canva-style filmstrip so
          customers can scan and switch pages without a tall column of sheets.
          ------------------------------------------------------------- */}
      <div className="w-full shrink-0 bg-[#202124] border-b border-[#3c4043] px-3 py-2">
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="tablist"
          aria-label="Document pages"
        >
          {Array.from({ length: pageCount }, (_, pageIdx) => {
            const pageItems = items.filter((item) => (item.pageIndex ?? 0) === pageIdx);
            const isActivePage = activePageIndex === pageIdx;

            return (
              <button
                key={`page-thumbnail-${pageIdx}`}
                type="button"
                role="tab"
                aria-selected={isActivePage}
                aria-label={`Open page ${pageIdx + 1}`}
                onClick={() => {
                  setSelectedId(null);
                  setActivePageIndex(pageIdx);
                }}
                className={`group relative shrink-0 rounded-lg border-2 p-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                  isActivePage
                    ? 'border-indigo-400 bg-indigo-500/15 shadow-[0_0_0_1px_rgba(129,140,248,0.25)]'
                    : 'border-slate-700 bg-[#2b2d30] hover:border-slate-500'
                }`}
                title={`Page ${pageIdx + 1}`}
              >
                <span
                  className="relative block w-14 sm:w-16 overflow-hidden bg-white shadow-sm"
                  style={{ aspectRatio: `${paperAspectRatio}` }}
                >
                  {pageItems.map((item) => (
                    <img
                      key={item.id}
                      src={item.src}
                      alt=""
                      draggable={false}
                      className="absolute max-w-none pointer-events-none"
                      style={{
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                        width: `${item.width}%`,
                        height: `${item.height}%`,
                        transform: `rotate(${item.rotation}deg)`,
                        filter: isBw ? 'grayscale(100%)' : 'none',
                      }}
                    />
                  ))}
                </span>
                <span className={`mt-1 block text-center text-[10px] font-bold ${isActivePage ? 'text-indigo-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                  Page {pageIdx + 1}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              handleAddPage();
            }}
            className="shrink-0 self-stretch min-h-[82px] px-3 rounded-lg border-2 border-dashed border-indigo-500/60 text-indigo-300 hover:border-indigo-400 hover:bg-indigo-500/10 hover:text-white transition-colors text-xs font-bold flex flex-col items-center justify-center gap-1"
            title="Add page"
          >
            <Plus className="w-4 h-4" />
            <span>Add page</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          CENTER CANVAS WORKSPACE
          The selected page is edited at full size.
          ------------------------------------------------------------- */}
      <div
        className="flex-1 w-full flex flex-col items-center p-3 sm:p-6 overflow-auto relative cursor-default"
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
          {[activePageIndex].map((pageIdx) => {
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
                      ? `${Math.round(860 * (canvasZoom / 100))}px`
                      : `${Math.round(620 * (canvasZoom / 100))}px`,
                    maxWidth: canvasZoom <= 100 ? '96%' : 'none',
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
                  onPointerDown={(e) => handlePagePointerDown(e, pageIdx)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePageIndex(pageIdx);
                    if (e.target === e.currentTarget) setSelectedId(null);
                  }}
                  className={`relative bg-white rounded-xs shadow-[0_12px_45px_rgba(0,0,0,0.7)] border touch-none transition-all ${
                    isActivePage ? 'border-indigo-500/70 ring-2 ring-indigo-500/30' : 'border-slate-400/40'
                  }`}
                  style={{
                    aspectRatio: `${paperAspectRatio}`,
                    width: isLandscape
                      ? `${Math.round(860 * (canvasZoom / 100))}px`
                      : `${Math.round(620 * (canvasZoom / 100))}px`,
                    maxWidth: canvasZoom <= 100 ? '96%' : 'none',
                    maxHeight: '85vh',
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {/* Inner clipped page boundary for background guides */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xs">
                    {/* Center alignment guides */}
                    <div className="absolute inset-x-0 top-1/2 h-[1px] border-b border-dashed border-indigo-200/50 pointer-events-none z-0" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] border-r border-dashed border-indigo-200/50 pointer-events-none z-0" />
                  </div>

                  {/* Render All Canvas Image Items for this page */}
                  {pageItems.map((item) => {
                    const isSelected = item.id === selectedId;

                    // Dynamic Smart Positioning for Floating Action Toolbar so it never gets clipped at page corners
                    const isNearTop = item.y < 14;
                    const isSmallTop = isNearTop && item.height < 14;
                    const vPosClass = isSmallTop
                      ? 'top-full mt-3'
                      : isNearTop
                      ? 'top-2'
                      : '-top-12';

                    const isNearLeft = item.x < 18;
                    const isNearRight = item.x + item.width > 82;
                    const hPosClass = isNearLeft
                      ? 'left-0 translate-x-0'
                      : isNearRight
                      ? 'right-0 translate-x-0'
                      : 'left-1/2 -translate-x-1/2';

                    const isKnobBottom = item.y < 8;

                    return (
                      <div
                        key={item.id}
                        onPointerDown={(e) => handlePointerDown(e, item, 'move')}
                        className="absolute select-none cursor-move touch-none transition-shadow will-change-transform"
                        style={{
                          left: `${item.x}%`,
                          top: `${item.y}%`,
                          width: `${item.width}%`,
                          height: `${item.height}%`,
                          transform: `rotate(${item.rotation}deg)`,
                          transformOrigin: 'center center',
                          zIndex: isSelected ? Math.max(1000, (item.zIndex || 0) + 100) : item.zIndex,
                          filter: isBw ? 'grayscale(100%)' : 'none',
                        }}
                      >
                        {/* Image Element with Crop Container */}
                        <div className="w-full h-full overflow-hidden relative pointer-events-none select-none">
                          {(() => {
                            const [cTop, cBottom] = normalizeCropPair(item.cropTop, item.cropBottom);
                            const [cLeft, cRight] = normalizeCropPair(item.cropLeft, item.cropRight);
                            const visW = Math.max(1, 100 - cLeft - cRight);
                            const visH = Math.max(1, 100 - cTop - cBottom);

                            return (
                              <img
                                src={item.src}
                                alt={item.name}
                                draggable={false}
                                className="absolute max-w-none max-h-none select-none pointer-events-none"
                                style={{
                                  width: `${(100 / visW) * 100}%`,
                                  height: `${(100 / visH) * 100}%`,
                                  left: `-${(cLeft / visW) * 100}%`,
                                  top: `-${(cTop / visH) * 100}%`,
                                  objectFit: 'fill',
                                }}
                              />
                            );
                          })()}
                        </div>

                        {/* Canva Active Selection Frame & Floating Action Toolbar */}
                        {isSelected && (
                          <div className="absolute -inset-[2px] border-2 border-indigo-600 pointer-events-auto touch-none z-50">
                            {/* FLOATING ACTION TOOLBAR ALWAYS INSIDE VISIBLE PAGE */}
                            <div
                              className={`absolute ${vPosClass} ${hPosClass} flex items-center gap-1 bg-[#1e2022]/95 text-white p-1 rounded-xl shadow-2xl border border-slate-600/90 z-50 pointer-events-auto backdrop-blur-md select-none animate-fade-in-scale whitespace-nowrap`}
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

                            {/* Rotation Knob */}
                            {isKnobBottom ? (
                              <>
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, item, 'rotate')}
                                  className="absolute -bottom-11 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 hover:bg-indigo-50 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center touch-none transition-transform hover:scale-110 active:scale-125 z-50"
                                  title="Drag to rotate"
                                >
                                  <RotateCw className="w-3.5 h-3.5 text-indigo-600 pointer-events-none" />
                                </div>
                                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-[2px] h-5 bg-indigo-600 pointer-events-none" />
                              </>
                            ) : (
                              <>
                                <div
                                  onPointerDown={(e) => handlePointerDown(e, item, 'rotate')}
                                  className="absolute -top-10 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 hover:bg-indigo-50 shadow-md cursor-grab active:cursor-grabbing flex items-center justify-center touch-none transition-transform hover:scale-110 active:scale-125 z-50"
                                  title="Drag to rotate"
                                >
                                  <RotateCw className="w-3.5 h-3.5 text-indigo-600 pointer-events-none" />
                                </div>
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-[2px] h-5 bg-indigo-600 pointer-events-none" />
                              </>
                            )}

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
          <span className="hidden sm:inline-block">· Pinch blank canvas to zoom · Pinch selected image to resize</span>
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer touch-manipulation"
              title="Undo last action"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportToPrint}
            disabled={isExporting || items.length === 0}
            className={`px-4 py-1.5 rounded-xl active:scale-95 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-all cursor-pointer touch-manipulation ${
              justApplied
                ? 'bg-emerald-500 ring-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/60'
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
                <span>Apply &amp; Open Preview</span>
                <span className="text-sm leading-none">→</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Whole-Page Backdrop Blur & Loading Modal Overlay when Tapping Apply */}
      {isExporting && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in pointer-events-auto select-none">
          <div className="bg-[#1e2022]/95 border border-slate-700/80 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full text-center backdrop-blur-xl animate-scale-up">
            {/* Animated Spinner with Sparkles */}
            <div className="relative flex items-center justify-center w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-white tracking-wide">Applying Custom Design...</h4>
              <p className="text-xs text-slate-400">Preparing high-res print layout &amp; generating preview</p>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-full w-full animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
