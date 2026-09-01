'use client';

import React, { useState } from 'react';
import { AdvancedPrintConfig, PaperSize, ColorMode, PrintSides } from '@/types';
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
  Layers,
  Settings,
} from '@/components/ui/Icons';

interface AdobePrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  pageCount?: number;
  fileSignedUrl?: string;
  fileType?: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  printSides: PrintSides;
  advancedConfig: AdvancedPrintConfig;
  onSaveAdvancedConfig: (updated: AdvancedPrintConfig) => void;
}

export const AdobePrintPreviewModal: React.FC<AdobePrintPreviewModalProps> = ({
  isOpen,
  onClose,
  fileName = 'Uploaded_Document.pdf',
  pageCount = 1,
  fileSignedUrl,
  fileType,
  paperSize,
  colorMode,
  printSides,
  advancedConfig,
  onSaveAdvancedConfig,
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

  // Preview Canvas States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  if (!isOpen) return null;

  const totalDocPages = pageCount > 0 ? pageCount : 1;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(200, prev + 25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(50, prev - 25));
  const handleRotate = () => setRotationAngle((prev) => (prev + 90) % 360);

  const handleApply = () => {
    onSaveAdvancedConfig(config);
    onClose();
  };

  const isLandscape = config.orientation === 'LANDSCAPE';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-slate-900 text-white rounded-3xl max-w-5xl w-full border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Header Bar - Adobe Acrobat Style */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-xs shadow-md shadow-red-600/30 tracking-tighter">
              PDF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white truncate max-w-xs sm:max-w-md">
                  {fileName}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 font-mono border border-slate-700">
                  {totalDocPages} {totalDocPages === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Adobe Acrobat Advanced Print Engine & Live Page Preview
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Split (Left: Live Preview Canvas, Right: Acrobat Settings Panel) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Canvas: Live Page Preview */}
          <div className="flex-1 bg-slate-950/60 p-4 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-slate-800 overflow-hidden relative">
            {/* Toolbar Top */}
            <div className="w-full flex items-center justify-between bg-slate-900/90 p-2 rounded-2xl border border-slate-800 text-xs font-semibold shrink-0 mb-3 backdrop-blur-md z-10">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-300">
                  Page <strong className="text-white font-extrabold">{currentPage}</strong> of {totalDocPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalDocPages, p + 1))}
                  disabled={currentPage >= totalDocPages}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-300 w-12 text-center">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer ml-1"
                  title="Rotate Page 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Render Box */}
            <div className="flex-1 w-full flex items-center justify-center overflow-auto p-4 relative">
              <div
                className="bg-white text-slate-900 shadow-2xl rounded-sm transition-all duration-200 flex flex-col justify-between relative overflow-hidden select-none border border-slate-300"
                style={{
                  width: isLandscape ? `${280 * (zoomLevel / 100)}px` : `${200 * (zoomLevel / 100)}px`,
                  height: isLandscape ? `${200 * (zoomLevel / 100)}px` : `${280 * (zoomLevel / 100)}px`,
                  transform: `rotate(${rotationAngle}deg)`,
                }}
              >
                {/* Watermark Overlay */}
                {config.watermark && config.watermark !== 'NONE' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <span className="text-3xl font-black text-rose-500/25 -rotate-45 tracking-widest uppercase border-4 border-rose-500/25 px-4 py-2 rounded-xl">
                      {config.watermark}
                    </span>
                  </div>
                )}

                {/* Top Document Simulation Header */}
                <div className="p-3 border-b border-slate-200/80 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                  <span>QUICKPRINT ADOBE PREVIEW</span>
                  <span>{paperSize} | {colorMode}</span>
                </div>

                {/* Body Content Representation */}
                <div className="p-4 flex-1 flex flex-col justify-center gap-2">
                  {config.pagesPerSheet === '2' ? (
                    <div className="grid grid-cols-2 gap-2 h-full">
                      <div className="bg-slate-100 rounded border border-slate-300 p-2 flex flex-col gap-1">
                        <div className="h-1.5 bg-slate-300 rounded w-3/4" />
                        <div className="h-1 bg-slate-200 rounded w-full" />
                        <div className="h-1 bg-slate-200 rounded w-5/6" />
                      </div>
                      <div className="bg-slate-100 rounded border border-slate-300 p-2 flex flex-col gap-1">
                        <div className="h-1.5 bg-slate-300 rounded w-3/4" />
                        <div className="h-1 bg-slate-200 rounded w-full" />
                        <div className="h-1 bg-slate-200 rounded w-5/6" />
                      </div>
                    </div>
                  ) : config.pagesPerSheet === '4' ? (
                    <div className="grid grid-cols-2 grid-rows-2 gap-1.5 h-full">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-slate-100 rounded border border-slate-300 p-1">
                          <div className="h-1 bg-slate-300 rounded w-2/3 mb-1" />
                          <div className="h-0.5 bg-slate-200 rounded w-full mb-0.5" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-3 bg-slate-800/80 rounded-xs w-3/4" />
                      <div className="h-2 bg-slate-300 rounded-xs w-full" />
                      <div className="h-2 bg-slate-300 rounded-xs w-5/6" />
                      <div className="h-2 bg-slate-300 rounded-xs w-4/5" />
                      <div className="h-2 bg-slate-200 rounded-xs w-full" />
                      <div className="h-2 bg-slate-200 rounded-xs w-2/3" />
                    </div>
                  )}
                </div>

                {/* Footer Page Number */}
                <div className="p-2 border-t border-slate-200/80 flex items-center justify-between text-[9px] text-slate-400 font-mono bg-slate-50">
                  <span>{fileName.substring(0, 18)}</span>
                  <span>Page {currentPage} of {totalDocPages}</span>
                </div>
              </div>
            </div>

            {/* Bottom Preview Badge */}
            <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 shrink-0">
              Scaling: <strong className="text-slate-200">{config.pageScaling} ({config.customScalePercent}%)</strong> | N-Up: <strong className="text-slate-200">{config.pagesPerSheet}-Up</strong>
            </div>
          </div>

          {/* Right Panel: Advanced Acrobat Controls */}
          <div className="w-full md:w-96 bg-slate-900 p-5 space-y-4 overflow-y-auto text-xs shrink-0 border-t md:border-t-0">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders className="w-4 h-4 text-red-500" />
              <h4 className="font-extrabold text-sm text-white">Adobe Advanced Options</h4>
            </div>

            {/* 1. Page Range Selection */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-300 text-[11px]">1. Page Range / Selection</label>
              <div className="grid grid-cols-2 gap-1.5">
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
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-[11px] transition-all ${
                      config.pageRangeMode === item.key
                        ? 'border-red-500 bg-red-500/15 text-white font-extrabold shadow-2xs'
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
                  className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                />
              )}
            </div>

            {/* 2. Pages Per Sheet (N-Up Printing) */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block font-bold text-slate-300 text-[11px]">2. Pages Per Sheet (N-Up Layout)</label>
              <div className="grid grid-cols-2 gap-1.5">
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
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-[11px] transition-all ${
                      config.pagesPerSheet === item.key
                        ? 'border-red-500 bg-red-500/15 text-white font-extrabold shadow-2xs'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Page Sizing & Scaling */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block font-bold text-slate-300 text-[11px]">3. Page Sizing & Handling</label>
              <div className="grid grid-cols-2 gap-1.5">
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
                    className={`py-2 px-2.5 rounded-xl border text-center font-bold text-[11px] transition-all ${
                      config.pageScaling === item.key
                        ? 'border-red-500 bg-red-500/15 text-white font-extrabold shadow-2xs'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {config.pageScaling === 'CUSTOM' && (
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={config.customScalePercent || 100}
                    onChange={(e) => setConfig((prev) => ({ ...prev, customScalePercent: parseInt(e.target.value) || 100 }))}
                    className="flex-1 accent-red-500"
                  />
                  <span className="font-mono font-bold text-slate-200 text-xs w-12 text-right">
                    {config.customScalePercent}%
                  </span>
                </div>
              )}
            </div>

            {/* 4. Orientation & Resolution */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block font-bold text-slate-300 text-[11px]">4. Orientation & Print Quality</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { key: 'AUTO', label: 'Auto' },
                  { key: 'PORTRAIT', label: 'Portrait 📄' },
                  { key: 'LANDSCAPE', label: 'Landscape 📑' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, orientation: item.key as any }))}
                    className={`py-1.5 px-2 rounded-xl border text-center font-bold text-[10px] transition-all ${
                      config.orientation === item.key
                        ? 'border-red-500 bg-red-500/15 text-white font-extrabold shadow-2xs'
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
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold focus:outline-none focus:border-red-500"
              >
                <option value="NONE">No Watermark</option>
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SAMPLE">SAMPLE / FOR REVIEW</option>
              </select>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-black flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Adobe Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
