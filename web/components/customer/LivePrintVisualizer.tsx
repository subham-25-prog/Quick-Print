'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  RefreshCw,
  Printer,
  FileText,
  Sparkles,
  Cloud,
  Check,
  AlertTriangle
} from '@/components/ui/Icons';
import { useShopName } from '@/lib/shop-sync';

interface LivePrintVisualizerProps {
  jobStatus: string;
  orderStatus?: string;
  paymentStatus?: string;
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
  orderStatus,
  paymentStatus,
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

  // Normalize status flags accurately
  // In QuickPrint backend, SUBMITTED is the terminal completion outcome from Windows print spooler
  const isPrinted =
    jobStatus === 'PRINTED' ||
    jobStatus === 'SUBMITTED' ||
    orderStatus === 'PRINTED' ||
    orderStatus === 'SUBMITTED';

  const isPrinting =
    !isPrinted &&
    (jobStatus === 'PRINTING' || orderStatus === 'PRINTING');

  const isDispatched =
    !isPrinted &&
    !isPrinting &&
    (jobStatus === 'CLAIMED' || orderStatus === 'CLAIMED');

  const isPending =
    !isPrinted &&
    !isPrinting &&
    !isDispatched &&
    (jobStatus === 'PENDING' ||
      orderStatus === 'CONFIRMED' ||
      orderStatus === 'APPROVED' ||
      paymentStatus === 'PAID');

  const isReview = jobStatus === 'REVIEW' || orderStatus === 'REVIEW';
  const isFailed = jobStatus === 'FAILED' || orderStatus === 'FAILED';

  // Determine active target step index (1 to 5)
  // Step 1: Payment & Order Verified
  // Step 2: Document Processed & Spooled
  // Step 3: Dispatched to Shop Print Agent
  // Step 4: Active Hardware Printing in Progress
  // Step 5: Completed & Ready for Counter Pickup
  let targetStep = 1;
  if (isPrinted) {
    targetStep = 5;
  } else if (isPrinting) {
    targetStep = 4;
  } else if (isDispatched) {
    targetStep = 3;
  } else if (isPending) {
    targetStep = 2;
  } else if (isReview || isFailed) {
    targetStep = 3;
  }

  // Smooth monotonic progression: prevent temporary backwards jumping due to polling race conditions
  const [highestStep, setHighestStep] = useState<number>(() => targetStep);

  useEffect(() => {
    if (targetStep > highestStep) {
      setHighestStep(targetStep);
    }
  }, [targetStep, highestStep]);

  const currentStep = isFailed || isReview ? targetStep : Math.max(targetStep, highestStep);

  // Live animated page printing progression during hardware printing
  const totalPages = Math.max(1, (pageCount || 1) * (copies || 1));
  const [printedPages, setPrintedPages] = useState<number>(1);

  useEffect(() => {
    if (isPrinted || currentStep >= 5) {
      setPrintedPages(totalPages);
      return;
    }
    if (!isPrinting && currentStep !== 4) return;

    // Advance page counter smoothly every 1.5 - 2.5s for realistic physical print feedback
    const stepDuration = Math.max(1400, Math.min(2600, 7500 / totalPages));
    const interval = setInterval(() => {
      setPrintedPages((prev) => {
        if (prev < totalPages) return prev + 1;
        return prev;
      });
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isPrinting, isPrinted, currentStep, totalPages]);

  // Compute smooth progress percentage
  let progressPercentage = 20;
  if (currentStep >= 5) {
    progressPercentage = 100;
  } else if (currentStep === 4) {
    const pageFraction = totalPages > 1 ? (printedPages - 1) / (totalPages - 1) : 0.6;
    progressPercentage = Math.round(75 + pageFraction * 20); // 75% -> 95%
  } else if (currentStep === 3) {
    progressPercentage = 60;
  } else if (currentStep === 2) {
    progressPercentage = 38;
  } else if (isReview || isFailed) {
    progressPercentage = 50;
  } else {
    progressPercentage = 20;
  }

  const steps = [
    {
      step: 1,
      title: 'Order Confirmed',
      shortTitle: 'Confirmed',
      description: 'Payment verified',
      icon: CheckCircle2,
      isDone: currentStep > 1,
      isActive: currentStep === 1,
    },
    {
      step: 2,
      title: 'Preparing Document',
      shortTitle: 'Preparing',
      description: `${paperSize} • ${colorMode}`,
      icon: FileText,
      isDone: currentStep > 2,
      isActive: currentStep === 2,
    },
    {
      step: 3,
      title: 'Sent to Printer',
      shortTitle: 'Queued',
      description: 'In print queue',
      icon: Cloud,
      isDone: currentStep > 3,
      isActive: currentStep === 3,
    },
    {
      step: 4,
      title: 'Printing Document',
      shortTitle: 'Printing',
      description: `${totalPages} ${totalPages === 1 ? 'page' : 'pages'} (${paperSize})`,
      icon: Printer,
      isDone: currentStep > 4,
      isActive: currentStep === 4,
    },
    {
      step: 5,
      title: 'Ready for Pickup',
      shortTitle: 'Ready',
      description: 'Collect from counter tray',
      icon: Sparkles,
      isDone: currentStep >= 5,
      isActive: currentStep === 5,
    },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-5 sm:p-7 text-white space-y-6 transition-all duration-300">
      {/* Ambient background glow */}
      <div className={`absolute top-0 right-1/4 w-72 h-32 blur-3xl pointer-events-none rounded-full transition-all duration-700 ${
        currentStep >= 5 ? 'bg-emerald-500/25' : 'bg-indigo-600/15'
      }`} />
      <div className={`absolute bottom-0 left-1/4 w-72 h-32 blur-3xl pointer-events-none rounded-full transition-all duration-700 ${
        currentStep >= 5 ? 'bg-teal-500/20' : 'bg-emerald-600/10'
      }`} />

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
          <h3 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5 transition-all duration-300">
            {currentStep >= 5
              ? 'Document Printed & Ready!'
              : currentStep === 4
              ? `Printing Live at Counter (${printedPages}/${totalPages})`
              : currentStep === 3
              ? 'Sent to Shop Printer'
              : currentStep === 2
              ? 'Preparing Document Pages'
              : isReview
              ? 'Awaiting Counter Approval'
              : isFailed
              ? 'Printer Attention Needed'
              : 'Order Verified & Queued'}
          </h3>
        </div>

        {/* Live Pulse Indicator Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs font-bold shadow-xs">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                currentStep >= 5
                  ? 'bg-emerald-400'
                  : currentStep === 4
                  ? 'bg-cyan-400'
                  : isReview || isFailed
                  ? 'bg-amber-400'
                  : 'bg-indigo-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                currentStep >= 5
                  ? 'bg-emerald-500'
                  : currentStep === 4
                  ? 'bg-cyan-400'
                  : isReview || isFailed
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
            />
          </span>
          <span className="tracking-wide text-slate-200 transition-all duration-300">
            {currentStep >= 5
              ? '100% Complete • Ready'
              : currentStep === 4
              ? `Step 4 of 5 • Printing Pg ${printedPages}/${totalPages}`
              : currentStep === 3
              ? 'Step 3 of 5 • In Queue'
              : currentStep === 2
              ? 'Step 2 of 5 • Preparing'
              : isReview
              ? 'Counter Check'
              : isFailed
              ? 'Attention Required'
              : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Modern High-End Progress Bar with Smooth Transitions */}
      <div className="space-y-2 relative z-10">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>Print Pipeline Progress</span>
          <span className="font-mono text-indigo-300 transition-all duration-300">{progressPercentage}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r ${
              currentStep >= 5
                ? 'from-emerald-500 to-teal-400'
                : 'from-indigo-600 via-cyan-400 to-emerald-400'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
          {currentStep === 4 && (
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
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-500 relative ${
                  isDone
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30 shadow-lg shadow-indigo-600/40 scale-105'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/80'
                }`}
              >
                {isDone ? (
                  <Check className="w-4 h-4 text-white stroke-[3] transition-transform duration-300 scale-100" />
                ) : isCurrent && currentStep === 4 ? (
                  <Printer className="w-4 h-4 text-cyan-300 animate-pulse" />
                ) : isCurrent && (currentStep === 2 || currentStep === 3) ? (
                  <RefreshCw className="w-4 h-4 text-indigo-200 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}

                {/* Pulsing halo ring for active step */}
                {isCurrent && currentStep < 5 && (
                  <span className="absolute -inset-1 rounded-full border border-indigo-400 animate-ping opacity-30 pointer-events-none" />
                )}
              </div>

              {/* Step Label */}
              <div className="mt-2 space-y-0.5 w-full">
                <div
                  className={`text-[10px] sm:text-xs font-bold leading-tight line-clamp-1 transition-colors duration-300 ${
                    isDone
                      ? 'text-emerald-400'
                      : isCurrent
                      ? 'text-white font-black'
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
      <div className="relative z-10 rounded-2xl bg-slate-950/90 border border-slate-800/90 p-4 sm:p-5 transition-all duration-300">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Stage Icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                currentStep >= 5
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-xs'
                  : currentStep === 4
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-xs'
                  : isReview || isFailed
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {currentStep >= 5 ? (
                <Sparkles className="w-5 h-5 text-emerald-400" />
              ) : currentStep === 4 ? (
                <Printer className="w-5 h-5 text-cyan-400 animate-pulse" />
              ) : isReview || isFailed ? (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              ) : (
                <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
              )}
            </div>

            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-200 transition-all duration-300">
                  {currentStep >= 5
                    ? 'Print Completed Successfully'
                    : currentStep === 4
                    ? `Printing in Progress (Page ${printedPages} of ${totalPages})`
                    : currentStep === 3
                    ? 'Ready in Shop Printer Queue'
                    : currentStep === 2
                    ? 'Preparing Document Pages'
                    : isReview
                    ? 'Awaiting Counter Approval'
                    : isFailed
                    ? 'Print Delay Detected'
                    : 'Preparing Document Pages'}
                </span>
                {orderNumber && (
                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    #{orderNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate transition-all duration-300">
                {currentStep >= 5
                  ? `All ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} printed • Collect from output tray`
                  : currentStep === 4
                  ? `Printing now • Page ${printedPages}/${totalPages} (${paperSize} • ${colorMode})`
                  : `${fileName ? fileName : 'Document.pdf'} • ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} (${paperSize} • ${colorMode})`}
              </p>
            </div>
          </div>

          {/* Right Action Hint / Live Output Notice */}
          <div className="text-right shrink-0 w-full sm:w-auto">
            {currentStep >= 5 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-sm shadow-emerald-600/30 animate-in zoom-in-95 duration-200">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Ready at Counter</span>
              </span>
            ) : currentStep === 4 ? (
              <div className="flex items-center justify-center sm:justify-end gap-1.5 text-xs text-cyan-300 font-bold">
                {/* Visual animated equalizer bars */}
                <span className="flex items-end gap-0.5 h-3.5">
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s] h-full" />
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s] h-2/3" />
                  <span className="w-1 bg-cyan-400 rounded-full animate-bounce h-4/5" />
                </span>
                <span>Feeding Pages…</span>
              </div>
            ) : currentStep === 3 ? (
              <span className="text-[11px] text-indigo-300 font-mono flex items-center justify-center sm:justify-end gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span>In Queue</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-mono">
                Preparing…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Completion Notification Banner */}
      {currentStep >= 5 && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 flex items-center justify-between gap-3 text-emerald-300 text-xs animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
            </div>
            <span className="font-bold text-emerald-200">
              Printing finished! Please pick up your document from the counter output tray.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
