'use client';

import React, { memo } from 'react';
import { PaperSize, ColorMode, PrintSides, PricingConfig } from '@/types';
import { FileText, Image as ImageIcon } from '@/components/ui/Icons';
import { formatCurrency } from '@/lib/utils';

interface PrintOptionsSelectorProps {
  paperSize: PaperSize;
  onPaperSizeChange: (val: PaperSize) => void;
  colorMode: ColorMode;
  onColorModeChange: (val: ColorMode) => void;
  printSides: PrintSides;
  onPrintSidesChange: (val: PrintSides) => void;
  copies: number;
  onCopiesChange: (val: number) => void;
  pricing: PricingConfig;
  hasMultipleFiles?: boolean;
}

const PrintOptionsSelectorComponent: React.FC<PrintOptionsSelectorProps> = ({
  paperSize,
  onPaperSizeChange,
  colorMode,
  onColorModeChange,
  printSides,
  onPrintSidesChange,
  copies,
  onCopiesChange,
  pricing,
  hasMultipleFiles = false,
}) => {
  const enabledPapers = pricing?.enabled_papers || { a4: true, a3: true, legal: true, photo: true };
  const customPapers = (pricing?.custom_papers || []).filter((p) => p.enabled);

  const isColor = colorMode === 'COLOR';
  const isDouble = printSides === 'DOUBLE';

  // Calculate dynamic per-page rate helper
  const getPaperRate = (size: PaperSize) => {
    if (size === 'A4') {
      if (isColor) return isDouble ? (pricing?.a4_color_double_per_page ?? 18) : (pricing?.a4_color_per_page ?? 10);
      return isDouble ? (pricing?.a4_bw_double_per_page ?? 4) : (pricing?.a4_bw_per_page ?? 3);
    }
    if (size === 'A3') {
      if (isColor) return isDouble ? (pricing?.a3_color_double_per_page ?? 35) : (pricing?.a3_color_per_page ?? 20);
      return isDouble ? (pricing?.a3_bw_double_per_page ?? 8) : (pricing?.a3_bw_per_page ?? 5);
    }
    if (size === 'LEGAL') {
      if (isColor) return isDouble ? (pricing?.legal_color_double_per_page ?? 22) : (pricing?.legal_color_per_page ?? 12);
      return isDouble ? (pricing?.legal_bw_double_per_page ?? 5) : (pricing?.legal_bw_per_page ?? 3);
    }
    if (size === 'PHOTO') {
      if (isColor) return isDouble ? (pricing?.photo_color_double_per_page ?? 45) : (pricing?.photo_color_per_page ?? pricing?.photo_paper_per_page ?? 25);
      return isDouble ? (pricing?.photo_bw_double_per_page ?? 25) : (pricing?.photo_bw_per_page ?? 15);
    }
    const custom = customPapers.find((p) => p.id === size);
    if (custom) {
      if (isColor) return isDouble ? custom.color_double : custom.color_single;
      return isDouble ? custom.bw_double : custom.bw_single;
    }
    return 3;
  };

  return (
    <div className="space-y-4 contain-layout text-white">
      {/* 1. Paper Size & Type */}
      <div>
        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 select-none flex items-center gap-1.5">
          <span className="text-red-400">📄</span>
          <span>Paper Size & Type</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {/* A4 Standard */}
          {enabledPapers.a4 !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('A4')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center relative cursor-pointer select-none ${
                paperSize === 'A4'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-6 h-7 border border-slate-700 rounded-xs flex items-center justify-center text-red-400 mb-1.5 shadow-2xs">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">A4 Standard</div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                210×297 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-amber-300 border border-slate-800">
                {formatCurrency(getPaperRate('A4'))}/page
              </div>
            </button>
          )}

          {/* A3 */}
          {enabledPapers.a3 !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('A3')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center relative cursor-pointer select-none ${
                paperSize === 'A3'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-6 h-7 border border-slate-700 rounded-xs flex items-center justify-center text-red-400 mb-1.5 shadow-2xs">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">A3 Poster</div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                297×420 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-amber-300 border border-slate-800">
                {formatCurrency(getPaperRate('A3'))}/page
              </div>
            </button>
          )}

          {/* Legal */}
          {enabledPapers.legal !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('LEGAL')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center relative cursor-pointer select-none ${
                paperSize === 'LEGAL'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-6 h-7 border border-slate-700 rounded-xs flex items-center justify-center text-red-400 mb-1.5 shadow-2xs">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">Legal / Stamp</div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                216×356 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-amber-300 border border-slate-800">
                {formatCurrency(getPaperRate('LEGAL'))}/page
              </div>
            </button>
          )}

          {/* Photo Paper */}
          {enabledPapers.photo !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('PHOTO')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center relative cursor-pointer select-none ${
                paperSize === 'PHOTO'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-6 h-7 border border-slate-700 rounded-xs flex items-center justify-center text-red-400 mb-1.5 shadow-2xs">
                <ImageIcon className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">Photo Glossy</div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                Premium Glossy
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-amber-300 border border-slate-800">
                {formatCurrency(getPaperRate('PHOTO'))}/page
              </div>
            </button>
          )}

          {/* Custom Papers */}
          {customPapers.map((paper) => (
            <button
              key={paper.id}
              type="button"
              onClick={() => onPaperSizeChange(paper.id)}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center relative cursor-pointer select-none ${
                paperSize === paper.id
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-6 h-7 border border-slate-700 rounded-xs flex items-center justify-center text-cyan-400 mb-1.5 shadow-2xs">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs text-white">{paper.name}</div>
              <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                {paper.description || 'Custom Paper'}
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-[10px] font-bold text-amber-300 border border-slate-800">
                {formatCurrency(getPaperRate(paper.id))}/page
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Color Mode */}
      {pricing?.form_fields?.allowColorPrinting !== false ? (
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 select-none flex items-center gap-1.5">
            <span className="text-blue-400">🎨</span>
            <span>Color Mode</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onColorModeChange('BW')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center cursor-pointer select-none ${
                colorMode === 'BW'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-slate-300 mb-1.5 shadow-xs" />
              <div className="font-bold text-xs text-white">Black & White</div>
              <div className="text-[10px] text-slate-400 font-medium">Standard Xerox</div>
              <div className="text-[10px] text-amber-300 font-bold mt-1">
                From {formatCurrency(pricing?.a4_bw_per_page || 2)}/pg
              </div>
            </button>

            <button
              type="button"
              onClick={() => onColorModeChange('COLOR')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center cursor-pointer select-none ${
                colorMode === 'COLOR'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 mb-1.5 shadow-xs" />
              <div className="font-bold text-xs text-white">Full Color</div>
              <div className="text-[10px] text-slate-400 font-medium">Vibrant Spider-Laser</div>
              <div className="text-[10px] text-amber-300 font-bold mt-1">
                From {formatCurrency(pricing?.a4_color_per_page || 10)}/pg
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {/* 3. Print Sides */}
      {pricing?.form_fields?.allowDoubleSided !== false ? (
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 select-none flex items-center gap-1.5">
            <span className="text-amber-400">📑</span>
            <span>Print Sides</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onPrintSidesChange('SINGLE')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center cursor-pointer select-none ${
                printSides === 'SINGLE'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-red-600 text-white font-bold text-[11px] flex items-center justify-center mb-1 shadow-2xs">
                1
              </div>
              <div className="font-bold text-xs text-white">Single Sided</div>
              <div className="text-[10px] text-slate-400 font-medium">1 side only</div>
            </button>

            <button
              type="button"
              onClick={() => onPrintSidesChange('DOUBLE')}
              className={`p-3 rounded-2xl border text-center transition-all duration-150 card-hover-lift active-press flex flex-col items-center justify-center cursor-pointer select-none ${
                printSides === 'DOUBLE'
                  ? 'border-red-500 bg-red-950/40 text-white ring-2 ring-red-500/50 shadow-md shadow-red-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center mb-1 shadow-2xs">
                2
              </div>
              <div className="font-bold text-xs text-white">Both Sides</div>
              <div className="text-[10px] text-slate-400 font-medium">Back to back</div>
            </button>
          </div>
        </div>
      ) : null}

      {/* 4. Number of Copies */}
      {!hasMultipleFiles && (
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 select-none flex items-center gap-1.5">
            <span className="text-emerald-400">🔢</span>
            <span>Number of Copies</span>
          </label>
          <div className="flex items-center justify-between border border-slate-800 rounded-2xl bg-slate-950/80 p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => onCopiesChange(Math.max(1, copies - 1))}
              disabled={copies <= 1}
              className="w-10 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center stepper-btn cursor-pointer border border-slate-800"
            >
              -
            </button>
            <span className="font-black text-sm text-amber-300 select-none">
              {copies} {copies === 1 ? 'Copy' : 'Copies'}
            </span>
            <button
              type="button"
              onClick={() => onCopiesChange(Math.min(100, copies + 1))}
              className="w-10 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center stepper-btn cursor-pointer border border-slate-800"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const PrintOptionsSelector = memo(PrintOptionsSelectorComponent);
