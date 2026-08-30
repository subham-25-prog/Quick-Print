'use client';

import React from 'react';
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
}

export const PrintOptionsSelector: React.FC<PrintOptionsSelectorProps> = ({
  paperSize,
  onPaperSizeChange,
  colorMode,
  onColorModeChange,
  printSides,
  onPrintSidesChange,
  copies,
  onCopiesChange,
  pricing,
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
      return pricing?.photo_paper_per_page ?? 25;
    }
    const custom = customPapers.find((p) => p.id === size);
    if (custom) {
      if (isColor) return isDouble ? custom.color_double : custom.color_single;
      return isDouble ? custom.bw_double : custom.bw_single;
    }
    return 3;
  };

  return (
    <div className="space-y-4">
      {/* 1. Paper Size & Type */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Paper Size & Type
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {/* A4 Standard */}
          {enabledPapers.a4 !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('A4')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                paperSize === 'A4'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-6 h-7 border border-slate-300 rounded-xs flex items-center justify-center text-slate-400 mb-1.5">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">A4 Standard</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                210×297 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
                {formatCurrency(getPaperRate('A4'))}/page
              </div>
            </button>
          )}

          {/* A3 */}
          {enabledPapers.a3 !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('A3')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                paperSize === 'A3'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-6 h-7 border border-slate-300 rounded-xs flex items-center justify-center text-slate-400 mb-1.5">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">A3 Poster</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                297×420 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
                {formatCurrency(getPaperRate('A3'))}/page
              </div>
            </button>
          )}

          {/* Legal */}
          {enabledPapers.legal !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('LEGAL')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                paperSize === 'LEGAL'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-6 h-7 border border-slate-300 rounded-xs flex items-center justify-center text-slate-400 mb-1.5">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">Legal / Stamp</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                216×356 mm
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
                {formatCurrency(getPaperRate('LEGAL'))}/page
              </div>
            </button>
          )}

          {/* Photo Paper */}
          {enabledPapers.photo !== false && (
            <button
              type="button"
              onClick={() => onPaperSizeChange('PHOTO')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                paperSize === 'PHOTO'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-6 h-7 border border-slate-300 rounded-xs flex items-center justify-center text-slate-400 mb-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs">Photo Glossy</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                240 GSM Glossy
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
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
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                paperSize === paper.id
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-6 h-7 border border-cyan-300 rounded-xs flex items-center justify-center text-cyan-600 mb-1.5 bg-cyan-50">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-xs text-slate-900">{paper.name}</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                {paper.description || 'Custom Paper'}
              </div>
              <div className="mt-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-800">
                {formatCurrency(getPaperRate(paper.id))}/page
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Color Mode */}
      {pricing?.form_fields?.allowColorPrinting !== false ? (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Color Mode
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onColorModeChange('BW')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                colorMode === 'BW'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-slate-900 mb-1.5" />
              <div className="font-bold text-xs text-slate-900">Black & White</div>
              <div className="text-[10px] text-slate-500 font-medium">Standard Xerox</div>
              <div className="text-[10px] text-indigo-600 font-bold mt-1">
                From {formatCurrency(pricing?.a4_bw_per_page || 2)}/pg
              </div>
            </button>

            <button
              type="button"
              onClick={() => onColorModeChange('COLOR')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                colorMode === 'COLOR'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 mb-1.5 shadow-xs" />
              <div className="font-bold text-xs text-slate-900">Full Color</div>
              <div className="text-[10px] text-slate-500 font-medium">Vibrant Laser</div>
              <div className="text-[10px] text-indigo-600 font-bold mt-1">
                From {formatCurrency(pricing?.a4_color_per_page || 10)}/pg
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {/* 3. Print Sides */}
      {pricing?.form_fields?.allowDoubleSided !== false ? (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Print Sides
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onPrintSidesChange('SINGLE')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                printSides === 'SINGLE'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center mb-1">
                1
              </div>
              <div className="font-bold text-xs text-slate-900">Single Sided</div>
              <div className="text-[10px] text-slate-500 font-medium">1 side only</div>
            </button>

            <button
              type="button"
              onClick={() => onPrintSidesChange('DOUBLE')}
              className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                printSides === 'DOUBLE'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-1 ring-indigo-600 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center mb-1">
                2
              </div>
              <div className="font-bold text-xs text-slate-900">Both Sides</div>
              <div className="text-[10px] text-slate-500 font-medium">Back to back</div>
            </button>
          </div>
        </div>
      ) : null}

      {/* 4. Number of Copies */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Number of Copies
        </label>
        <div className="flex items-center justify-between border border-slate-200 rounded-2xl bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => onCopiesChange(Math.max(1, copies - 1))}
            disabled={copies <= 1}
            className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            -
          </button>
          <span className="font-bold text-sm text-slate-800">
            {copies} {copies === 1 ? 'Copy' : 'Copies'}
          </span>
          <button
            type="button"
            onClick={() => onCopiesChange(Math.min(100, copies + 1))}
            className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
