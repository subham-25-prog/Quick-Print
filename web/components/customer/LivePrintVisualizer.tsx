'use client';

import React from 'react';
import {
CheckCircle2,
RefreshCw,
Printer,
FileText,
Sparkles,
Cloud,
Check
} from '@/components/ui/Icons';
import { useShopName } from '@/lib/shop-sync';

interface LivePrintVisualizerProps {
  jobStatus: string;
  pageCount?: number;
  copies?: number;
  fileName?: string;
  isTest?: boolean;
  shopName?: string;
  orderNumber?: string;
  paperSize?: string;
  colorMode?: string;
}

export const LivePrintVisualizer: React.FC<LivePrintVisualizerProps> = ({
  jobStatus,
  pageCount = 1,
  copies = 1,
  fileName,
  isTest = false,
  shopName,
  orderNumber,
  paperSize = 'A4',
  colorMode = 'B&W',
}) => {
  const activeShopName = useShopName(shopName);

  // Normalize status flags
  const isPrinted = jobStatus === 'PRINTED';
  const isPrinting = jobStatus === 'PRINTING';
  const isDispatched = jobStatus === 'CLAIMED' || jobStatus === 'SUBMITTED';
  const isPending = jobStatus === 'PENDING';
  const isReview = jobStatus === 'REVIEW';
  const isFailed = jobStatus === 'FAILED';

  // Determine current active step index (1 to 5)
  // Step 1: Payment & Order Verified
  // Step 2: Document Processed & Spooled
  // Step 3: Dispatched to Shop Print Agent
  // Step 4: Active Hardware Printing in Progress
  // Step 5: Completed & Ready for Counter Pickup
  let currentStep = 1;
  let progressPercentage = 20;

  if (isPrinted) {
    currentStep = 5;
    progressPercentage = 100;
  } else if (isPrinting) {
    currentStep = 4;
    progressPercentage = 80;
  } else if (isDispatched) {
    currentStep = 3;
    progressPercentage = 60;
  } else if (isPending) {
    currentStep = 2;
    progressPercentage = 40;
  } else if (isReview || isFailed) {
    currentStep = 3;
    progressPercentage = 50;
  }

  const steps = [
    {
      step: 1,
      title: 'Payment Verified',
      shortTitle: 'Verified',
      description: 'Security check passed',
      icon: CheckCircle2,
      isDone: currentStep > 1,
      isActive: currentStep === 1,
    },
    {
      step: 2,
      title: 'Document Spooled',
      shortTitle: 'Spooled',
      description: `${paperSize} • ${colorMode}`,
      icon: FileText,
      isDone: currentStep > 2,
      isActive: currentStep === 2,
    },
    {
      step: 3,
      title: 'Dispatched to Agent',
      shortTitle: 'Dispatched',
      description: 'Connected to counter queue',
      icon: Cloud,
      isDone: currentStep > 3,
      isActive: currentStep === 3,
    },
    {
      step: 4,
      title: 'Printing at Counter',
      shortTitle: 'Printing',
      description: `${pageCount} pg • ${copies} ${copies === 1 ? 'copy' : 'copies'}`,
      icon: Printer,
      isDone: currentStep > 4,
      isActive: currentStep === 4,
    },
    {
      step: 5,
      title: 'Ready for Pickup',
      shortTitle: 'Ready',
      description: 'Available at tray',
      icon: Sparkles,
      isDone: currentStep >= 5,
      isActive: currentStep === 5,
    },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-5 sm:p-7 text-white space-y-6">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-1/4 w-72 h-32 bg-indigo-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-1/4 w-72 h-32 bg-emerald-600/10 blur-3xl pointer-events-none rounded-full" />

      {/* Top Header: Shop Station Branding & Live Stage Pill */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-400 uppercase">
              {activeShopName || 'QuickPrint'} Live Print Station
            </span>
            {isTest && (
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                SIMULATION
              </span>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
            {isPrinted
              ? 'Document Printed & Ready'
              : isPrinting
              ? 'Printing Live at Counter'
              : isDispatched
              ? 'Dispatched to Shop Printer'
              : isPending
              ? 'Processing Document Pages'
              : isReview
              ? 'Awaiting Counter Approval'
              : 'Printer Status'}
          </h3>
        </div>

        {/* Live Pulse Indicator Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-bold shadow-xs">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isPrinted
                  ? 'bg-emerald-400'
                  : isPrinting
                  ? 'bg-cyan-400'
                  : isReview
                  ? 'bg-amber-400'
                  : 'bg-indigo-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isPrinted
                  ? 'bg-emerald-500'
                  : isPrinting
                  ? 'bg-cyan-400'
                  : isReview
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
            />
          </span>
          <span className="tracking-wide text-slate-200">
            {isPrinted
              ? '100% Complete'
              : isPrinting
              ? 'Step 4 of 5 • Active'
              : isDispatched
              ? 'Step 3 of 5 • Queued'
              : isPending
              ? 'Step 2 of 5 • Spooling'
              : isReview
              ? 'Counter Check'
              : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Modern High-End Progress Bar */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>Print Pipeline Progress</span>
          <span className="font-mono text-indigo-300">{progressPercentage}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r ${
              isPrinted
                ? 'from-emerald-500 to-teal-400'
                : 'from-indigo-600 via-cyan-400 to-emerald-400'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
          {isPrinting && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
          )}
        </div>
      </div>

      {/* The 5-Step Live Status Pipeline */}
      <div className="relative z-10 grid grid-cols-5 gap-1 sm:gap-2 pt-2">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isCurrent = s.isActive;
          const isDone = s.isDone;

          return (
            <div key={s.step} className="flex flex-col items-center text-center relative group">
              {/* Connector Line to Next Step */}
              {idx < steps.length - 1 && (
                <div className="absolute top-4 left-1/2 w-full h-0.5 -z-1 pointer-events-none">
                  <div
                    className={`h-full transition-colors duration-500 ${
                      isDone
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-gradient-to-r from-indigo-500 to-slate-700'
                        : 'bg-slate-800'
                    }`}
                  />
                </div>
              )}

              {/* Step Icon Node */}
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-300 relative ${
                  isDone
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30 shadow-lg shadow-indigo-600/40 scale-105'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/80'
                }`}
              >
                {isDone ? (
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                ) : isCurrent && isPrinting ? (
                  <RefreshCw className="w-4 h-4 text-cyan-300 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}

                {/* Pulsing halo ring for active step */}
                {isCurrent && (
                  <span className="absolute -inset-1 rounded-full border border-indigo-400 animate-ping opacity-30 pointer-events-none" />
                )}
              </div>

              {/* Step Label */}
              <div className="mt-2 space-y-0.5 w-full">
                <div
                  className={`text-[10px] sm:text-xs font-bold leading-tight line-clamp-1 ${
                    isDone
                      ? 'text-emerald-400'
                      : isCurrent
                      ? 'text-white'
                      : 'text-slate-500'
                  }`}
                >
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{s.shortTitle}</span>
                </div>
                <div className="text-[9px] text-slate-400 font-medium hidden md:block line-clamp-1">
                  {s.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Status Telemetry Console Card */}
      <div className="relative z-10 rounded-2xl bg-slate-950/90 border border-slate-800/90 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Stage Icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isPrinted
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isPrinting
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {isPrinted ? (
                <Sparkles className="w-5 h-5 text-emerald-400" />
              ) : isPrinting ? (
                <Printer className="w-5 h-5 text-cyan-400 animate-pulse" />
              ) : (
                <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
              )}
            </div>

            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-200">
                  {isPrinted
                    ? 'Print Completed Successfully'
                    : isPrinting
                    ? 'Printing in Progress'
                    : isDispatched
                    ? 'Received by Counter Agent'
                    : 'Job Queued & Spooling'}
                </span>
                {orderNumber && (
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    #{orderNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {fileName ? fileName : 'Document.pdf'} • {pageCount} {pageCount === 1 ? 'page' : 'pages'} • {copies} {copies === 1 ? 'copy' : 'copies'} ({paperSize} • {colorMode})
              </p>
            </div>
          </div>

          {/* Right Action Hint / Live Output Notice */}
          <div className="text-right shrink-0 w-full sm:w-auto">
            {isPrinted ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-sm shadow-emerald-600/30">
                <Check className="w-3.5 h-3.5" />
                <span>Ready at Counter</span>
              </span>
            ) : isPrinting ? (
              <div className="flex items-center justify-center sm:justify-end gap-1.5 text-xs text-cyan-300 font-bold">
                {/* Visual animated equalizer bars */}
                <span className="flex items-end gap-0.5 h-3.5">
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s] h-full" />
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s] h-2/3" />
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce h-4/5" />
                </span>
                <span>Feeding Pages…</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 font-mono">
                Dispatched to Agent
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
