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
  AlertTriangle,
  Copy,
} from '@/components/ui/Icons';
import { useShopName } from '@/lib/shop-sync';
import { formatCurrency } from '@/lib/utils';
import { WelcomePrintCompleteAnimation } from '@/components/customer/WelcomePrintCompleteAnimation';

interface LivePrintVisualizerProps {
  jobStatus: string;
  orderStatus?: string;
  paymentStatus?: string;
  pageCount?: number;
  copies?: number;
  fileName?: string;

  shopName?: string;
  orderNumber?: string;
  paperSize?: string;
  colorMode?: string;
  totalAmount?: number;
  paymentMethod?: string;
  printSides?: string;
  isCanvasStudio?: boolean;
}

export const LivePrintVisualizer: React.FC<LivePrintVisualizerProps> = React.memo(({
  jobStatus,
  orderStatus,
  paymentStatus,
  pageCount = 1,
  copies = 1,
  fileName,

  shopName,
  orderNumber,
  paperSize = 'A4',
  colorMode = 'B&W',
  totalAmount,
  paymentMethod,
  printSides,
  isCanvasStudio,
}) => {
  const activeShopName = useShopName(shopName);
  const [copied, setCopied] = useState(false);

  const handleCopyOrder = () => {
    if (!orderNumber) return;
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
  if (isReview || isFailed) {
    targetStep = 3;
  } else if (isPrinted) {
    targetStep = 5;
  } else if (isPrinting) {
    targetStep = 4;
  } else if (isDispatched) {
    targetStep = 3;
  } else if (isPending) {
    targetStep = 2;
  }

  // A retry can move backwards; always reflect the latest server status.
  const currentStep = targetStep;

  // Live animated page printing progression during hardware printing
  const totalPages = Math.max(1, (pageCount || 1) * (copies || 1));
  const [printedPages, setPrintedPages] = useState<number>(1);

  useEffect(() => {
    if (isPrinted || currentStep >= 5) {
      setPrintedPages(totalPages);
      return;
    }
    if (!isPrinting || isReview || isFailed) {
      setPrintedPages(1);
      return;
    }

    // Advance page counter smoothly every 1.5 - 2.5s for realistic physical print feedback
    const stepDuration = Math.max(1400, Math.min(2600, 7500 / totalPages));
    const interval = setInterval(() => {
      setPrintedPages((prev) => {
        if (prev < totalPages) return prev + 1;
        return prev;
      });
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isPrinting, isPrinted, isReview, isFailed, currentStep, totalPages]);

  // Compute smooth progress percentage
  let progressPercentage: number;
  if (currentStep >= 5) {
    progressPercentage = 100;
  } else if (currentStep === 4) {
    const pageFraction = totalPages > 1 ? (printedPages - 1) / (totalPages - 1) : 0.6;
    progressPercentage = Math.round(75 + pageFraction * 20); // 75% -> 95%
  } else if ((currentStep === 3 && !isReview && !isFailed)) {
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
      isActive: (currentStep === 3 && !isReview && !isFailed),
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

  // When printing is complete, replace the pipeline clutter with the dedicated, compact Thank You animation card
  if (currentStep >= 5) {
    return (
      <WelcomePrintCompleteAnimation
        orderNumber={orderNumber}
        shopName={activeShopName}
        fileName={fileName}
        totalPages={totalPages}
        paperSize={paperSize}
        colorMode={colorMode}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        printSides={printSides}
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Live Print Progress Status"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/98 to-slate-950 border border-slate-800 p-5 sm:p-6 text-white shadow-2xl space-y-4 transition-all duration-300 contain-layout"
    >
      {/* Ambient background glow */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-36 bg-gradient-to-r from-indigo-500/20 via-cyan-400/15 to-emerald-400/20 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-16 right-8 w-52 h-28 bg-indigo-600/15 blur-2xl pointer-events-none rounded-full" />

      {/* Top Header Pill & Stage Indicator */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 text-[11px] font-extrabold tracking-wider uppercase">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
          <span>Live Print Station</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 font-semibold select-none">
          <span className="font-mono text-indigo-300 font-bold">{progressPercentage}%</span>
          <span className="text-slate-500">•</span>
          <span>
            {currentStep === 4
              ? `Printing Pg ${printedPages}/${totalPages}`
              : (currentStep === 3 && !isReview && !isFailed)
              ? 'In Queue'
              : currentStep === 2
              ? 'Preparing'
              : isReview
              ? 'Counter Check'
              : isFailed
              ? 'Attention'
              : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Hero Print Pipeline & Progress Bar Section */}
      <div className="relative z-10 space-y-3 py-0.5">
        {/* Sleek Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span className="truncate">
              {currentStep === 4
                ? `Printing live at counter (${printedPages}/${totalPages})`
                : (currentStep === 3 && !isReview && !isFailed)
                ? 'Sent to shop printer queue'
                : currentStep === 2
                ? 'Preparing document pages'
                : isReview
                ? 'Awaiting counter check'
                : isFailed
                ? 'Printer delay detected'
                : 'Order confirmed & spooled'}
            </span>
            <span className="font-mono text-indigo-300 shrink-0 ml-2">{progressPercentage}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800/90 overflow-hidden relative">
            <div
              className="w-full h-full rounded-full transition-transform duration-700 ease-out bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 will-change-transform"
              style={{
                transform: `scaleX(${progressPercentage / 100})`,
                transformOrigin: 'left',
              }}
            />
            {currentStep === 4 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse pointer-events-none" />
            )}
          </div>
        </div>

        {/* The 5-Step Status Pipeline Nodes */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2 pt-0.5">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isCurrent = s.isActive;
            const isDone = s.isDone;

            return (
              <div key={s.step} className="flex flex-col items-center text-center relative group">
                {/* Connector Line to Next Step */}
                {idx < steps.length - 1 && (
                  <div className="absolute top-3.5 left-1/2 w-full h-0.5 -z-1 pointer-events-none">
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
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-500 relative ${
                    isDone
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : isCurrent
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30 shadow-lg shadow-indigo-600/40 scale-105'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/80'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  ) : isCurrent && currentStep === 4 ? (
                    <Printer className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                  ) : isCurrent && (currentStep === 2 || currentStep === 3) ? (
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-200 animate-spin" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  {isCurrent && (
                    <span className="absolute -inset-1 rounded-full border border-indigo-400 animate-ping opacity-30 pointer-events-none" />
                  )}
                </div>

                {/* Step Label */}
                <div className="mt-1 space-y-0.5 w-full">
                  <div
                    className={`text-[9px] sm:text-[10px] font-bold leading-tight line-clamp-1 transition-colors duration-300 ${
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sleek Token Card with Details Below the Order Number (Identical structure to Welcome card) */}
      <div className="relative z-10 rounded-2xl bg-slate-950/85 border border-slate-800/90 p-4 space-y-3 backdrop-blur-md">
        {/* Order Number Header Row */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block select-none">
              Order Number
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-base sm:text-lg font-extrabold text-amber-300 tracking-wider truncate">
                {orderNumber ? `#${orderNumber}` : 'PRINTING'}
              </span>
              {orderNumber && (
                <button
                  type="button"
                  onClick={handleCopyOrder}
                  className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 flex items-center gap-1 transition-colors cursor-pointer select-none active:scale-95 shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
            {fileName && (
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-slate-400 block truncate max-w-[200px] sm:max-w-[280px]">
                  {fileName}
                </span>
                {isCanvasStudio && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-2xs shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                    <span>Canvas Studio</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0">
            {currentStep === 4 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600/90 text-white font-extrabold text-xs shadow-md shadow-cyan-600/30 animate-pulse">
                <Printer className="w-3.5 h-3.5 text-cyan-200" />
                <span>Printing {printedPages}/{totalPages}</span>
              </span>
            ) : currentStep === 3 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/90 text-white font-extrabold text-xs shadow-md shadow-indigo-600/30">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-200" />
                <span>In Print Queue</span>
              </span>
            ) : isReview ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600/90 text-white font-extrabold text-xs shadow-md shadow-amber-600/30">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-200" />
                <span>Counter Check</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-indigo-300 font-extrabold text-xs border border-slate-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Processing</span>
              </span>
            )}
          </div>
        </div>

        {/* Printing Details below the Order Number: Color, Pages, Size, Price */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs pt-0.5">
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Color</span>
            <span className="font-bold text-slate-100 mt-0.5 block truncate">
              {colorMode === 'COLOR' ? 'Color' : 'B&W'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Pages</span>
            <span className="font-bold text-slate-100 mt-0.5 block truncate">
              {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
            </span>
            {printSides && (
              <span className="text-[9px] text-slate-400 block mt-0.5 truncate">
                {printSides === 'DOUBLE' ? '2-Sided' : '1-Sided'}
              </span>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Size</span>
            <span className="font-bold text-slate-100 mt-0.5 block truncate">
              {paperSize}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
            <span className="text-[9px] uppercase font-bold text-emerald-400 block">Price</span>
            <span className="font-black text-emerald-300 mt-0.5 block truncate">
              {typeof totalAmount === 'number' ? formatCurrency(totalAmount) : 'Paid'}
            </span>
            {paymentMethod && (
              <span className="text-[8px] font-semibold text-emerald-400 block mt-0.5 truncate">
                {paymentMethod === 'CASH' ? 'Cash' : 'Online'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Courteous Shopkeeper Sign-off */}
      <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pt-0.5 border-t border-slate-800/60 select-none">
        <span className="flex items-center gap-1.5 text-indigo-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span>Live counter station active</span>
        </span>
        <span className="font-medium text-slate-300">
          {activeShopName || 'QuickPrint'}
        </span>
      </div>
    </div>
  );
});
LivePrintVisualizer.displayName = 'LivePrintVisualizer';
