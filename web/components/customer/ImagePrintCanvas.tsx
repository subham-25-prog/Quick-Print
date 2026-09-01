'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, RotateCw, ZoomIn, ZoomOut, AlertCircle, CheckCircle2, Sliders, Maximize2, Minimize2, Move, X } from '@/components/ui/Icons';

export interface ImagePrintSettings {
  pageSize: 'A4' | 'LETTER' | 'A5' | '4X6' | '5X7' | 'CUSTOM';
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  margin: 'NONE' | 'NORMAL' | 'WIDE';
  fitMode: 'FIT' | 'FILL' | 'STRETCH' | 'ACTUAL';
  zoom: number; // 0.5 to 3.0
  rotation: number; // 0, 90, 180, 270
  offsetX: number; // pan offset X in px
  offsetY: number; // pan offset Y in px
}

interface ImagePrintCanvasProps {
  imageSrc: string;
  fileName: string;
  fileSizeBytes: number;
  onReplaceImage: () => void;
  onRemoveImage: () => void;
  onSettingsChange?: (settings: ImagePrintSettings) => void;
}

// Paper dimensions in millimeters (width x height in portrait)
const PAPER_DIMENSIONS_MM = {
  A4: { w: 210, h: 297 },
  LETTER: { w: 216, h: 279 },
  A5: { w: 148, h: 210 },
  '4X6': { w: 102, h: 152 },
  '5X7': { w: 127, h: 178 },
  CUSTOM: { w: 200, h: 200 },
};

const MARGIN_MM = {
  NONE: 0,
  NORMAL: 10,
  WIDE: 20,
};

export const ImagePrintCanvas: React.FC<ImagePrintCanvasProps> = ({
  imageSrc,
  fileName,
  fileSizeBytes,
  onReplaceImage,
  onRemoveImage,
  onSettingsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Settings State
  const [settings, setSettings] = useState<ImagePrintSettings>({
    pageSize: 'A4',
    orientation: 'PORTRAIT',
    margin: 'NORMAL',
    fitMode: 'FIT',
    zoom: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // Image Element & Original Dimensions
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load Image Object
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      setImgElement(img);
      setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [imageSrc]);

  // Propagate settings to parent if requested
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(settings);
    }
  }, [settings, onSettingsChange]);

  // Calculate estimated DPI
  const calculateDpi = (): { dpi: number; isLowRes: boolean } => {
    if (!imgDimensions) return { dpi: 300, isLowRes: false };

    const dim = PAPER_DIMENSIONS_MM[settings.pageSize];
    const paperWidthInches = (settings.orientation === 'PORTRAIT' ? dim.w : dim.h) / 25.4;
    const paperHeightInches = (settings.orientation === 'PORTRAIT' ? dim.h : dim.w) / 25.4;

    const dpiX = imgDimensions.width / paperWidthInches;
    const dpiY = imgDimensions.height / paperHeightInches;
    const avgDpi = Math.round(Math.min(dpiX, dpiY));

    return {
      dpi: avgDpi,
      isLowRes: avgDpi < 150,
    };
  };

  const { dpi, isLowRes } = calculateDpi();

  // Draw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Determine Virtual Canvas Size (scaled to container)
    const dim = PAPER_DIMENSIONS_MM[settings.pageSize];
    const isPortrait = settings.orientation === 'PORTRAIT';
    const paperWidthMM = isPortrait ? dim.w : dim.h;
    const paperHeightMM = isPortrait ? dim.h : dim.w;

    const aspectRatio = paperWidthMM / paperHeightMM;

    // Render Canvas resolution
    const CANVAS_WIDTH = 600;
    const CANVAS_HEIGHT = Math.round(CANVAS_WIDTH / aspectRatio);

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // 1. Draw Paper Background (White Page with subtle border grid)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Draw Margins Guidelines
    const marginMM = MARGIN_MM[settings.margin];
    const marginPxX = (marginMM / paperWidthMM) * CANVAS_WIDTH;
    const marginPxY = (marginMM / paperHeightMM) * CANVAS_HEIGHT;

    const printableX = marginPxX;
    const printableY = marginPxY;
    const printableW = CANVAS_WIDTH - marginPxX * 2;
    const printableH = CANVAS_HEIGHT - marginPxY * 2;

    if (marginMM > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(printableX, printableY, printableW, printableH);
      ctx.restore();
    }

    // 3. Transform & Render Image
    ctx.save();
    ctx.beginPath();
    ctx.rect(printableX, printableY, printableW, printableH);
    ctx.clip(); // Clip to printable margin area

    const imgW = imgElement.naturalWidth;
    const imgH = imgElement.naturalHeight;

    // Calculate base draw size depending on Fit Mode
    let drawW = printableW;
    let drawH = printableH;

    const imgAspect = (settings.rotation % 180 === 0) ? (imgW / imgH) : (imgH / imgW);
    const printableAspect = printableW / printableH;

    if (settings.fitMode === 'FIT') {
      if (imgAspect > printableAspect) {
        drawW = printableW;
        drawH = printableW / imgAspect;
      } else {
        drawH = printableH;
        drawW = printableH * imgAspect;
      }
    } else if (settings.fitMode === 'FILL') {
      if (imgAspect > printableAspect) {
        drawH = printableH;
        drawW = printableH * imgAspect;
      } else {
        drawW = printableW;
        drawH = printableW / imgAspect;
      }
    } else if (settings.fitMode === 'ACTUAL') {
      drawW = imgW * 0.4;
      drawH = imgH * 0.4;
    }

    // Apply Zoom
    drawW *= settings.zoom;
    drawH *= settings.zoom;

    // Calculate center offset + user manual pan offset
    const centerX = printableX + printableW / 2 + settings.offsetX;
    const centerY = printableY + printableH / 2 + settings.offsetY;

    ctx.translate(centerX, centerY);
    ctx.rotate((settings.rotation * Math.PI) / 180);

    ctx.drawImage(imgElement, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [settings, imgElement]);

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - settings.offsetX, y: e.clientY - settings.offsetY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setSettings((prev) => ({
      ...prev,
      offsetX: e.clientX - dragStart.x,
      offsetY: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setSettings((prev) => ({
      ...prev,
      zoom: Math.min(Math.max(0.5, prev.zoom + delta), 3.0),
    }));
  };

  // Reset controls
  const handleReset = () => {
    setSettings({
      pageSize: 'A4',
      orientation: 'PORTRAIT',
      margin: 'NORMAL',
      fitMode: 'FIT',
      zoom: 1,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
    });
  };

  return (
    <div className="w-full space-y-4">
      {/* Section Top Toolbar */}
      <div className="flex items-center justify-between bg-slate-900 text-white p-3.5 rounded-2xl shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold truncate">{fileName}</h4>
            <div className="text-[10px] text-slate-400 flex items-center gap-2 font-mono">
              <span>{imgDimensions ? `${imgDimensions.width} × ${imgDimensions.height} px` : 'Loading...'}</span>
              <span>•</span>
              <span className={isLowRes ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                {dpi} DPI {isLowRes ? '(Low Resolution)' : '(High Quality)'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReplaceImage}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Replace Image</span>
          </button>
          <button
            type="button"
            onClick={onRemoveImage}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Low-DPI Warning Banner */}
      {isLowRes && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Low image resolution ({dpi} DPI). Image may appear slightly blurry when printed on {settings.pageSize}. Consider uploading a higher-resolution image.
          </span>
        </div>
      )}

      {/* Main Grid: Interactive Canvas Left, Settings Panel Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Canvas & Canvas Overlay Controls (8 cols desktop) */}
        <div className="md:col-span-7 flex flex-col items-center justify-center p-4 rounded-3xl bg-slate-950 border border-slate-800 shadow-inner relative overflow-hidden group">
          {/* Virtual Page Canvas */}
          <div className="relative shadow-2xl rounded-sm overflow-hidden bg-white max-w-full">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className="cursor-move touch-none block"
              style={{ maxWidth: '100%', height: 'auto', maxHeight: '420px' }}
            />
          </div>

          {/* Canvas Floating Overlay Controls */}
          <div className="mt-3 flex items-center justify-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800 text-xs text-white shadow-xl">
            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, zoom: Math.max(0.5, prev.zoom - 0.1) }))}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="px-2 font-mono text-[11px] font-bold text-slate-300">
              {Math.round(settings.zoom * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, zoom: Math.min(3.0, prev.zoom + 0.1) }))}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={() => setSettings((prev) => ({ ...prev, rotation: (prev.rotation + 90) % 360 }))}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-bold">{settings.rotation}°</span>
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="mt-1 text-[10px] text-slate-500 font-medium flex items-center gap-1">
            <Move className="w-3 h-3 text-slate-500" />
            <span>Drag image to reposition • Scroll to zoom</span>
          </div>
        </div>

        {/* Live Print Settings Panel (5 cols desktop) */}
        <div className="md:col-span-5 bg-slate-50 rounded-3xl p-4 border border-slate-200 space-y-4 text-xs">
          <div className="font-extrabold text-slate-900 text-xs flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Print Page Canvas Settings</span>
            </span>
          </div>

          {/* 1. Page Size */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700 text-[11px]">Paper Size</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['A4', 'LETTER', 'A5', '4X6', '5X7', 'CUSTOM'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, pageSize: size }))}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-extrabold transition-all ${
                    settings.pageSize === size
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {size === '4X6' ? '4×6" Photo' : size === '5X7' ? '5×7" Photo' : size}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Orientation */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700 text-[11px]">Orientation</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, orientation: 'PORTRAIT' }))}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  settings.orientation === 'PORTRAIT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>📱</span>
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, orientation: 'LANDSCAPE' }))}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  settings.orientation === 'LANDSCAPE'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🖥️</span>
                <span>Landscape</span>
              </button>
            </div>
          </div>

          {/* 3. Margins */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700 text-[11px]">Print Margins</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['NONE', 'NORMAL', 'WIDE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, margin: m }))}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
                    settings.margin === m
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {m === 'NONE' ? 'Borderless' : m === 'NORMAL' ? 'Normal (10mm)' : 'Wide (20mm)'}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Fit Mode */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700 text-[11px]">Image Layout / Fit</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['FIT', 'FILL', 'STRETCH', 'ACTUAL'] as const).map((fit) => (
                <button
                  key={fit}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, fitMode: fit, offsetX: 0, offsetY: 0, zoom: 1 }))}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all ${
                    settings.fitMode === fit
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {fit === 'FIT' ? 'Fit Page' : fit === 'FILL' ? 'Fill Page (Crop)' : fit === 'STRETCH' ? 'Stretch' : 'Actual Size'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
