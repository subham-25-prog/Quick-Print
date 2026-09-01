'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AdvancedPrintConfig, PaperSize, ColorMode, PrintSides } from '@/types';
import { UploadedFileState } from './FileUploader';
import {
  X,
  FileText,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Printer,
  Maximize2,
  ChevronUp,
  ChevronDown,
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
  advancedConfig: AdvancedPrintConfig;
  onSaveAdvancedConfig: (updated: AdvancedPrintConfig) => void;
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
  advancedConfig,
  onSaveAdvancedConfig,
  onProceedToOrder,
}) => {
  const [config, setConfig] = useState<AdvancedPrintConfig>({
    pageRangeMode: advancedConfig.pageRangeMode || 'ALL',
    customPageRange: advancedConfig.customPageRange || '',
    pagesPerSheet: advancedConfig.pagesPerSheet || '1',
    pageScaling: advancedConfig.pageScaling || 'FIT',
    customScalePercent: advancedConfig.customScalePercent || 100,
    orientation: advancedConfig.orientation || 'AUTO',
    printQuality: advancedConfig.printQuality || 'STANDARD',
    watermark: advancedConfig.watermark || 'NONE',
  });

  // Local object URL for real-time file preview
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);

  // Preview Canvas States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  // Mobile Drawer State
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);

  // Touch Swipe Gesture State
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  // Lock body scroll when modal is open & add Esc key listener
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

  // Generate object URL for file if blob
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

  if (!isOpen) return null;

  const activePreviewUrl = localObjectUrl || previewUrl || fileSignedUrl || uploadedFile?.previewUrl || uploadedFile?.signedUrl;
  const activeFileType = fileType || uploadedFile?.fileType || (fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const isImage = activeFileType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(fileName);
  const isPdf = activeFileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  const totalDocPages = pageCount > 0 ? pageCount : 1;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(250, prev + 25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(50, prev - 25));
  const handleZoomFit = () => setZoomLevel(100);
  const handleRotate = () => setRotationAngle((prev) => (prev + 90) % 360);

  // Double tap to toggle zoom
  const handleCanvasDoubleTap = () => {
    setZoomLevel((prev) => (prev === 100 ? 150 : 100));
  };

  // Touch swipe handling for multi-page documents on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Horizontal swipe for page navigation
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40) {
      if (deltaX < 0 && currentPage < totalDocPages) {
        setCurrentPage((p) => p + 1);
      } else if (deltaX > 0 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      }
    }
  };

  const handleApplyAndClose = () => {
    onSaveAdvancedConfig(config);
    if (onProceedToOrder) {
      onProceedToOrder();
    } else {
      onClose();
    }
  };

  const isLandscape = config.orientation === 'LANDSCAPE';
  const isBw = colorMode === 'BW';

  // Calculate WYSIWYG Page Dimensions (mm aspect ratio)
  const getAspectRatio = () => {
    if (paperSize === 'A3') return isLandscape ? '1.414 / 1' : '1 / 1.414';
    if (paperSize === 'LEGAL') return isLandscape ? '1.64 / 1' : '1 / 1.64';
    if (paperSize === 'PHOTO') return isLandscape ? '1.5 / 1' : '1 / 1.5';
    return isLandscape ? '1.414 / 1' : '1 / 1.414'; // A4 Default
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col h-[100dvh] w-screen overflow-hidden font-sans select-none pb-safe pt-safe">
      {/* 1. Mobile & Desktop Sticky Top Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800/90 px-4 py-3 flex items-center justify-between shrink-0 z-50 shadow-md">
        {/* Left: Close Button */}
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer active:scale-95"
          aria-label="Close Print Preview"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Center: Title & Page Count */}
        <div className="flex items-center gap-2 text-center min-w-0 px-2">
          <div className="w-6 h-6 rounded-md bg-red-600 flex items-center justify-center font-black text-white text-[10px] shadow-xs shrink-0">
            PDF
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-extrabold text-white truncate max-w-[160px] sm:max-w-xs">
              {fileName}
            </h2>
            <div className="text-[10px] text-slate-400 font-mono">
              Advance Print Preview • Page {currentPage} of {totalDocPages}
            </div>
          </div>
        </div>

        {/* Right: Primary Apply / Print Action Button */}
        <button
          type="button"
          onClick={handleApplyAndClose}
          className="min-h-[44px] px-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Apply</span>
        </button>
      </header>

      {/* 2. Main Body Split: Canvas Left / Drawer Right (Desktop Two-Panel, Mobile Stacked) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left/Main Panel: Large WYSIWYG Preview Canvas */}
        <div
          className="flex-1 bg-slate-950/70 p-3 sm:p-6 flex flex-col items-center justify-between overflow-hidden relative touch-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleCanvasDoubleTap}
        >
          {/* Top Canvas Toolbar: Page Nav & Zoom Controls */}
          <div className="w-full max-w-xl bg-slate-900/90 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs font-semibold shrink-0 mb-3 shadow-lg z-20">
            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono text-[11px] text-slate-300">
                <strong className="text-white font-bold">{currentPage}</strong> / {totalDocPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalDocPages, p + 1))}
                disabled={currentPage >= totalDocPages}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Zoom & Rotate Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleZoomOut}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomFit}
                className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-bold"
                title="Reset Zoom to 100%"
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors cursor-pointer ml-1"
                title="Rotate Page 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* WYSIWYG Render Box */}
          <div className="flex-1 w-full flex items-center justify-center overflow-auto p-2 sm:p-4 relative">
            <div
              className="bg-white text-slate-900 shadow-2xl rounded-xs transition-all duration-200 flex flex-col justify-between relative overflow-hidden select-none border border-slate-300 ring-8 ring-black/20"
              style={{
                aspectRatio: getAspectRatio(),
                width: isLandscape ? `${340 * (zoomLevel / 100)}px` : `${240 * (zoomLevel / 100)}px`,
                maxWidth: '92vw',
                maxHeight: '65vh',
                transform: `rotate(${rotationAngle}deg)`,
                filter: isBw ? 'grayscale(100%)' : 'none',
              }}
            >
              {/* Security Watermark Overlay */}
              {config.watermark && config.watermark !== 'NONE' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <span className="text-2xl sm:text-3xl font-black text-rose-500/30 -rotate-45 tracking-widest uppercase border-4 border-rose-500/30 px-4 py-2 rounded-xl">
                    {config.watermark}
                  </span>
                </div>
              )}

              {/* Document Paper Header */}
              <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[9px] text-slate-500 font-mono z-20 shrink-0">
                <span className="font-bold truncate max-w-[140px]">{fileName}</span>
                <span>{paperSize} | {isBw ? 'B&W' : 'COLOR'}</span>
              </div>

              {/* Document Image / PDF Page Render */}
              <div className="flex-1 w-full h-full p-2 flex items-center justify-center relative overflow-hidden bg-slate-50">
                {activePreviewUrl ? (
                  isImage ? (
                    config.pagesPerSheet === '2' ? (
                      <div className="grid grid-cols-2 gap-1.5 w-full h-full items-center">
                        <img src={activePreviewUrl} alt="Preview 1" className="w-full h-full object-contain rounded-xs border border-slate-200" />
                        <img src={activePreviewUrl} alt="Preview 2" className="w-full h-full object-contain rounded-xs border border-slate-200" />
                      </div>
                    ) : config.pagesPerSheet === '4' ? (
                      <div className="grid grid-cols-2 grid-rows-2 gap-1 w-full h-full items-center">
                        {[1, 2, 3, 4].map((i) => (
                          <img key={i} src={activePreviewUrl} alt={`Preview ${i}`} className="w-full h-full object-contain rounded-xs border border-slate-200" />
                        ))}
                      </div>
                    ) : (
                      <img
                        src={activePreviewUrl}
                        alt="Document Preview"
                        className="w-full h-full object-contain max-h-full transition-transform"
                      />
                    )
                  ) : isPdf ? (
                    <iframe
                      src={`${activePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-full border-none pointer-events-none rounded-xs"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 p-4 text-center">
                      <FileText className="w-10 h-10 text-slate-300" />
                      <span className="text-xs font-bold text-slate-700">{fileName}</span>
                    </div>
                  )
                ) : (
                  <div className="p-4 flex-1 flex flex-col justify-center gap-2 w-full">
                    <div className="h-3 bg-slate-800/80 rounded-xs w-3/4" />
                    <div className="h-2 bg-slate-300 rounded-xs w-full" />
                    <div className="h-2 bg-slate-300 rounded-xs w-5/6" />
                    <div className="h-2 bg-slate-200 rounded-xs w-full" />
                  </div>
                )}
              </div>

              {/* Document Paper Footer */}
              <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-100 flex items-center justify-between text-[9px] text-slate-500 font-mono z-20 shrink-0">
                <span>WYSIWYG Print Preview</span>
                <span>Page {currentPage} of {totalDocPages}</span>
              </div>
            </div>
          </div>

          {/* Bottom Mobile Drawer Handle (Mobile Only Trigger) */}
          <div className="md:hidden w-full bg-slate-900 border-t border-slate-800 p-2.5 flex items-center justify-between text-xs text-slate-300 shrink-0 z-30 shadow-lg">
            <button
              type="button"
              onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/90 text-white font-bold cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-red-500" />
                <span>Print Options & Adobe Settings</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-red-400 font-mono">
                <span>{config.pagesPerSheet}-Up | {config.orientation}</span>
                {isDrawerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </div>
            </button>
          </div>
        </div>

        {/* 3. Settings Panel (Right Sidebar on Desktop, Sliding Bottom Sheet on Mobile) */}
        <aside
          className={`w-full md:w-96 bg-slate-900 p-5 space-y-4 overflow-y-auto text-xs shrink-0 border-t md:border-t-0 md:border-l border-slate-800 transition-all duration-300 z-40 ${
            isDrawerExpanded ? 'max-h-[70vh] border-t-2 border-red-500' : 'max-h-0 md:max-h-full hidden md:block'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-red-500" />
              <h3 className="font-extrabold text-sm text-white">Adobe Print Options</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsDrawerExpanded(false)}
              className="md:hidden p-1 text-slate-400 hover:text-white"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* 1. Page Range */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-300 text-[11px]">1. Page Range / Selection</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'ALL', label: 'All Pages' },
                { key: 'RANGE', label: 'Custom Range' },
                { key: 'ODD', label: 'Odd Pages Only' },
                { key: 'EVEN', label: 'Even Pages Only' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, pageRangeMode: item.key as any }))}
                  className={`min-h-[44px] px-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer active:scale-95 ${
                    config.pageRangeMode === item.key
                      ? 'border-red-500 bg-red-500/20 text-white font-extrabold shadow-2xs'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {config.pageRangeMode === 'RANGE' && (
              <input
                type="text"
                placeholder="e.g. 1-5, 8, 10-12"
                value={config.customPageRange || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, customPageRange: e.target.value }))}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-red-500 mt-2"
              />
            )}
          </div>

          {/* 2. Pages Per Sheet (N-Up) */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block font-bold text-slate-300 text-[11px]">2. Pages Per Sheet (N-Up Layout)</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: '1', label: '1 Page / Sheet' },
                { key: '2', label: '2 Pages / Sheet' },
                { key: '4', label: '4 Pages Grid' },
                { key: 'booklet', label: 'Booklet Fold' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, pagesPerSheet: item.key as any }))}
                  className={`min-h-[44px] px-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer active:scale-95 ${
                    config.pagesPerSheet === item.key
                      ? 'border-red-500 bg-red-500/20 text-white font-extrabold shadow-2xs'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Page Scaling */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block font-bold text-slate-300 text-[11px]">3. Page Sizing & Handling</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'FIT', label: 'Fit Printable Area' },
                { key: 'ACTUAL', label: 'Actual Size (100%)' },
                { key: 'SHRINK', label: 'Shrink Oversized' },
                { key: 'CUSTOM', label: 'Custom Scale' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, pageScaling: item.key as any }))}
                  className={`min-h-[44px] px-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer active:scale-95 ${
                    config.pageScaling === item.key
                      ? 'border-red-500 bg-red-500/20 text-white font-extrabold shadow-2xs'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {config.pageScaling === 'CUSTOM' && (
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={config.customScalePercent || 100}
                  onChange={(e) => setConfig((prev) => ({ ...prev, customScalePercent: parseInt(e.target.value) || 100 }))}
                  className="flex-1 accent-red-500 min-h-[44px]"
                />
                <span className="font-mono font-bold text-slate-200 text-xs w-12 text-right">
                  {config.customScalePercent}%
                </span>
              </div>
            )}
          </div>

          {/* 4. Orientation */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block font-bold text-slate-300 text-[11px]">4. Orientation</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'AUTO', label: 'Auto' },
                { key: 'PORTRAIT', label: 'Portrait 📄' },
                { key: 'LANDSCAPE', label: 'Landscape 📑' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, orientation: item.key as any }))}
                  className={`min-h-[44px] px-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer active:scale-95 ${
                    config.orientation === item.key
                      ? 'border-red-500 bg-red-500/20 text-white font-extrabold shadow-2xs'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Watermark Stamp */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block font-bold text-slate-300 text-[11px]">5. Security Watermark</label>
            <select
              value={config.watermark || 'NONE'}
              onChange={(e) => setConfig((prev) => ({ ...prev, watermark: e.target.value as any }))}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold focus:outline-none focus:border-red-500 cursor-pointer"
            >
              <option value="NONE">No Watermark</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL</option>
              <option value="DRAFT">DRAFT</option>
              <option value="SAMPLE">SAMPLE / FOR REVIEW</option>
            </select>
          </div>

          {/* Apply Settings Action */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-slate-300 font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyAndClose}
              className="min-h-[44px] flex-1 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Adobe Settings</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
