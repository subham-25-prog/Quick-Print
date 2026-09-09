'use client';

import React from 'react';
import { CheckCircle2, RefreshCw, Printer, FileText, Sparkles, Clock, AlertCircle } from '@/components/ui/Icons';

interface LivePrintVisualizerProps {
  jobStatus: string;
  pageCount?: number;
  copies?: number;
  fileName?: string;
  isTest?: boolean;
}

export const LivePrintVisualizer: React.FC<LivePrintVisualizerProps> = ({
  jobStatus,
  pageCount = 1,
  copies = 1,
  fileName,
  isTest = false,
}) => {
  const isPrinted = jobStatus === 'PRINTED';
  const isPrinting = jobStatus === 'PRINTING' || jobStatus === 'CLAIMED' || jobStatus === 'SUBMITTED';
  const isPending = jobStatus === 'PENDING';
  const isReviewOrFailed = jobStatus === 'REVIEW' || jobStatus === 'FAILED';

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-indigo-900/40">
      {/* Background Ambient Glows */}
      <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />

      {/* Top Banner Status */}
      <div className="flex items-center justify-between gap-3 mb-6 relative z-10">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isPrinted ? 'bg-emerald-400' : isPrinting ? 'bg-indigo-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isPrinted ? 'bg-emerald-400' : isPrinting ? 'bg-indigo-400' : 'bg-amber-400'
              }`}
            />
          </span>
          <span className="tracking-wide">
            {isPrinted
              ? 'Job Completed'
              : isPrinting
              ? 'Agent Active & Printing'
              : isPending
              ? 'Job Queued'
              : 'Attention Needed'}
          </span>
        </div>

        {isTest && (
          <span className="text-[11px] font-bold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30">
            SIMULATION MODE
          </span>
        )}
      </div>

      {/* Visual Animated Printer Station Graphic */}
      <div className="flex flex-col items-center justify-center my-4 relative z-10">
        <div className="relative w-64 sm:w-72 h-48 flex items-center justify-center">
          {/* Top Paper Tray (Paper Feeding In) */}
          <div className="absolute top-2 w-32 h-14 rounded-t-lg bg-slate-800 border-t-2 border-x-2 border-indigo-400/30 shadow-inner flex flex-col items-center justify-end overflow-hidden">
            <div
              className={`w-28 h-12 bg-white rounded-t shadow-sm transition-transform duration-700 ${
                isPrinting ? 'animate-paper-eject' : isPrinted ? 'translate-y-6 opacity-40' : ''
              }`}
            >
              {/* Paper Lines Preview */}
              <div className="p-2 space-y-1">
                <div className="h-1 bg-slate-200 rounded w-16" />
                <div className="h-1 bg-slate-100 rounded w-20" />
                <div className="h-1 bg-slate-200 rounded w-12" />
              </div>
            </div>
          </div>

          {/* Main Printer Chassis Body */}
          <div className="relative z-20 w-56 sm:w-64 h-24 rounded-2xl bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 border-2 border-slate-600 shadow-2xl flex flex-col justify-between p-3.5">
            {/* Control Panel / LED Indicators */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-300 uppercase">
                  QuickPrint Station
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>

            {/* Paper Output Slot with Glowing Scanner Line */}
            <div className="relative w-full h-3 rounded-full bg-black/80 border border-slate-700 overflow-hidden flex items-center justify-center">
              {isPrinting && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80 animate-pulse" />
              )}
            </div>

            {/* Output Tray & Stand */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-mono">
              <span>{copies} {copies === 1 ? 'copy' : 'copies'}</span>
              <span>{pageCount} {pageCount === 1 ? 'pg' : 'pgs'}</span>
            </div>
          </div>

          {/* Paper Ejecting Out the Bottom Slot */}
          <div className="absolute top-28 z-30 flex flex-col items-center">
            <div
              className={`w-36 rounded-b-xl bg-white text-slate-800 p-3 shadow-2xl border border-slate-200 transition-all duration-700 ${
                isPrinted
                  ? 'translate-y-3 opacity-100 ring-4 ring-emerald-500/30'
                  : isPrinting
                  ? 'animate-paper-eject opacity-95 ring-2 ring-cyan-400/40'
                  : 'translate-y-0 opacity-40'
              }`}
            >
              {/* Paper Content Simulation */}
              <div className="space-y-1.5 relative overflow-hidden">
                {/* Laser Scanning Effect while Printing */}
                {isPrinting && (
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-indigo-500 to-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-scan-beam" />
                )}

                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="h-1.5 bg-slate-300 rounded w-14" />
                  {isPrinted && (
                    <span className="text-[9px] font-black text-emerald-600 tracking-wider">
                      READY
                    </span>
                  )}
                </div>
                <div className="h-1 bg-slate-200 rounded w-full" />
                <div className="h-1 bg-slate-100 rounded w-24" />
                <div className="h-1 bg-slate-200 rounded w-28" />
              </div>
            </div>
          </div>
        </div>

        {/* Live Dynamic Status Caption */}
        <div className="text-center mt-3 space-y-1">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            {isPrinted ? (
              <>
                <span className="text-emerald-400">Printed & Ready!</span>
                <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
              </>
            ) : isPrinting ? (
              <>
                <span className="text-cyan-300">Printing in Progress…</span>
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
              </>
            ) : isReviewOrFailed ? (
              <span className="text-amber-300">Shopkeeper Review Needed</span>
            ) : (
              <span className="text-slate-200">Queued for Printing</span>
            )}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto font-normal">
            {isPrinted
              ? 'Your document is printed! Please pick it up from the printer counter.'
              : isPrinting
              ? 'Windows printer has claimed the document. Pages are rolling out now.'
              : isReviewOrFailed
              ? 'Please speak with the shopkeeper at the counter to verify output.'
              : 'Payment confirmed. The automated printer will pick up your job in seconds.'}
          </p>
        </div>
      </div>
    </div>
  );
};
