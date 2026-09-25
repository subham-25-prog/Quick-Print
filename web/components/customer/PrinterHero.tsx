'use client';

import React, { useState, useCallback, memo } from 'react';
import { Printer, Sparkles, FileText, CheckCircle2, Zap } from '@/components/ui/Icons';
import { useShopName } from '@/lib/shop-sync';

interface PrinterHeroProps {
  shopName?: string;
  uploadedFileName?: string;
  pageCount?: number;
  onStartUploadClick?: () => void;
}

export const PrinterHero: React.FC<PrinterHeroProps> = memo(({
  shopName,
  uploadedFileName,
  pageCount,
  onStartUploadClick,
}) => {
  const activeShopName = useShopName(shopName);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [printCount, setPrintCount] = useState(0);

  const handlePrinterClick = useCallback(() => {
    setIsTestPrinting(true);
    setPrintCount((prev) => prev + 1);
    const timer = setTimeout(() => {
      setIsTestPrinting(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  const handleScrollToUpload = useCallback(() => {
    if (onStartUploadClick) {
      onStartUploadClick();
      return;
    }
    const el = document.getElementById('upload-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [onStartUploadClick]);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border border-slate-800/90 shadow-2xl p-5 sm:p-7 text-white animate-fade-in-up contain-layout">
      {/* Ambient background glows */}
      <div className="absolute top-0 right-0 w-80 h-48 bg-indigo-500/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-0 w-80 h-48 bg-teal-500/10 blur-3xl pointer-events-none rounded-full" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
        {/* Left Side: Shop Profile & Info */}
        <div className="flex-1 space-y-4 text-center md:text-left">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Printer Online & Ready</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Instant Kiosk Spool</span>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {activeShopName || 'QuickPrint Express'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-md">
              High-speed self-service document printing. Upload your PDF or images and pick up at the counter in seconds.
            </p>
          </div>

          {/* Value Props Pills */}
          <div className="grid grid-cols-3 gap-2 pt-1 max-w-sm mx-auto md:mx-0">
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Speed</div>
              <div className="text-xs sm:text-sm font-bold text-white mt-0.5">&lt; 30 sec</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Quality</div>
              <div className="text-xs sm:text-sm font-bold text-white mt-0.5">Laser HD</div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Privacy</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5">Auto-purge</div>
            </div>
          </div>

          {/* Upload CTA or File Notice */}
          <div className="pt-1">
            {uploadedFileName ? (
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-200">
                <FileText className="w-4 h-4 text-indigo-300 shrink-0" />
                <span className="truncate max-w-[200px] sm:max-w-xs">
                  Loaded: <strong className="text-white">{uploadedFileName}</strong>
                  {pageCount ? ` (${pageCount} pgs)` : ''}
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleScrollToUpload}
                className="btn-shimmer active-press inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 hover:from-indigo-400 hover:to-indigo-500 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>Print Document Now</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Interactive High-Tech Physical Printer Station */}
        <div className="w-full sm:w-auto flex flex-col items-center justify-center shrink-0">
          <div
            role="button"
            tabIndex={0}
            onClick={handlePrinterClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePrinterClick();
              }
            }}
            title="Interactive Printer Station - Click to test print!"
            className="group relative cursor-pointer select-none p-2 transition-transform duration-300 hover:scale-105 active-press"
          >
            {/* Ambient printer pedestal glow */}
            <div className="absolute -bottom-2 inset-x-4 h-8 bg-indigo-600/30 blur-xl rounded-full group-hover:bg-indigo-500/50 transition-colors" />

            {/* Hardware Printer SVG Container */}
            <div className="relative w-64 h-52 sm:w-72 sm:h-56">
              <svg
                viewBox="0 0 280 220"
                className="w-full h-full drop-shadow-2xl overflow-visible"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* 1. Paper Input Feeder (Top Back) */}
                <g className="transition-all duration-300">
                  {/* Feeder backplate */}
                  <path
                    d="M 50 45 L 230 45 L 222 15 L 58 15 Z"
                    fill="url(#feeder-grad)"
                    stroke="#475569"
                    strokeWidth="1.5"
                  />
                  {/* Paper Sheets in Feeder */}
                  <rect
                    x="75"
                    y="18"
                    width="130"
                    height="32"
                    rx="3"
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <rect
                    x="78"
                    y="15"
                    width="124"
                    height="32"
                    rx="3"
                    fill="#ffffff"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    className="opacity-90"
                  />
                  {/* Feeder paper guide markers */}
                  <line x1="90" y1="24" x2="190" y2="24" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="90" y1="30" x2="170" y2="30" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />
                </g>

                {/* 2. Main Printer Body Chassis */}
                <g>
                  {/* Main housing body */}
                  <rect
                    x="30"
                    y="45"
                    width="220"
                    height="125"
                    rx="16"
                    fill="url(#body-grad)"
                    stroke="#475569"
                    strokeWidth="2"
                  />

                  {/* Top scanner lid seam / bevel */}
                  <path
                    d="M 32 80 L 248 80"
                    stroke="#1e293b"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M 32 81 L 248 81"
                    stroke="#64748b"
                    strokeWidth="1"
                    opacity="0.4"
                  />

                  {/* Front accent metallic strip */}
                  <rect
                    x="31"
                    y="83"
                    width="218"
                    height="10"
                    fill="url(#metallic-strip)"
                  />

                  {/* Laser Scanner Chamber Slot (Paper Ejection Slot) */}
                  <rect
                    x="60"
                    y="118"
                    width="160"
                    height="16"
                    rx="5"
                    fill="#020617"
                    stroke="#334155"
                    strokeWidth="1.5"
                  />
                  {/* Interior slot depth line */}
                  <line x1="62" y1="124" x2="218" y2="124" stroke="#0f172a" strokeWidth="3" />
                </g>

                {/* 3. High-Tech OLED Digital Display Panel */}
                <g>
                  {/* Display Bezel */}
                  <rect
                    x="50"
                    y="52"
                    width="115"
                    height="24"
                    rx="6"
                    fill="#020617"
                    stroke="#334155"
                    strokeWidth="1.5"
                  />
                  {/* Screen Glass Reflection */}
                  <path
                    d="M 52 54 L 95 54 L 75 74 L 52 74 Z"
                    fill="#ffffff"
                    opacity="0.06"
                  />
                  {/* Display Text Content */}
                  <text
                    x="58"
                    y="63"
                    fill="#38bdf8"
                    fontSize="7"
                    fontFamily="monospace"
                    fontWeight="bold"
                    letterSpacing="0.5"
                  >
                    {isTestPrinting
                      ? 'FEEDING PAGE...'
                      : uploadedFileName
                      ? 'DOC LOADED'
                      : 'READY TO PRINT'}
                  </text>
                  <text
                    x="58"
                    y="72"
                    fill="#94a3b8"
                    fontSize="6"
                    fontFamily="monospace"
                  >
                    {isTestPrinting
                      ? `PAGE ${printCount} OF 1`
                      : uploadedFileName
                      ? `${pageCount || 1} PGS • CONFIGURE`
                      : 'ONLINE • LASER 45PPM'}
                  </text>
                </g>

                {/* 4. Control Panel Buttons & Status LEDs */}
                <g>
                  {/* Power Button */}
                  <circle cx="180" cy="64" r="7" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                  <circle cx="180" cy="64" r="4" fill="#334155" />
                  <path d="M 180 61 L 180 64" stroke="#38bdf8" strokeWidth="1" strokeLinecap="round" />
                  <circle cx="180" cy="64" r="2.5" stroke="#38bdf8" strokeWidth="0.8" fill="none" />

                  {/* Status LED: Power (Green Pulse) */}
                  <circle
                    cx="202"
                    cy="64"
                    r="3.5"
                    fill="#10b981"
                    className="animate-led-blink"
                  />
                  <circle cx="202" cy="64" r="5" stroke="#10b981" strokeWidth="0.8" opacity="0.4" />

                  {/* Status LED: Wi-Fi / Cloud Ready (Cyan) */}
                  <circle
                    cx="215"
                    cy="64"
                    r="3.5"
                    fill="#06b6d4"
                  />
                  <circle cx="215" cy="64" r="5" stroke="#06b6d4" strokeWidth="0.8" opacity="0.4" />

                  {/* Status LED: Print Activity (Amber/Indigo) */}
                  <circle
                    cx="228"
                    cy="64"
                    r="3.5"
                    fill={isTestPrinting ? '#f59e0b' : '#6366f1'}
                    className={isTestPrinting ? 'animate-ping' : ''}
                  />
                </g>

                {/* 5. Paper Output Tray & Printing Document */}
                <g>
                  {/* Bottom Output Tray Base */}
                  <path
                    d="M 50 160 L 230 160 L 220 205 L 60 205 Z"
                    fill="url(#tray-grad)"
                    stroke="#475569"
                    strokeWidth="1.5"
                  />
                  {/* Tray Lip Catch */}
                  <path
                    d="M 60 205 L 220 205 L 216 211 L 64 211 Z"
                    fill="#1e293b"
                    stroke="#334155"
                    strokeWidth="1"
                  />

                  {/* Printed Sheet sliding out */}
                  <g className={isTestPrinting ? 'animate-paper-slide' : ''}>
                    {/* The Printed Paper Sheet */}
                    <rect
                      x="72"
                      y="126"
                      width="136"
                      height="74"
                      rx="3"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                      className="shadow-md"
                    />

                    {/* Laser Scanning Line across the paper */}
                    <rect
                      x="72"
                      y="145"
                      width="136"
                      height="2.5"
                      fill="url(#laser-glow)"
                      className="animate-laser-scan pointer-events-none"
                    />

                    {/* Paper Document Content Text Lines */}
                    <line x1="84" y1="140" x2="150" y2="140" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="84" y1="148" x2="195" y2="148" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="84" y1="156" x2="185" y2="156" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="84" y1="164" x2="190" y2="164" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="84" y1="172" x2="160" y2="172" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />

                    {/* Stamp / Verification Seal */}
                    <circle cx="185" cy="182" r="7" fill="#6366f1" opacity="0.15" />
                    <circle cx="185" cy="182" r="6" stroke="#6366f1" strokeWidth="1" strokeDasharray="2 1" />
                    <text x="181" y="184" fill="#4f46e5" fontSize="5" fontWeight="bold">QP</text>
                  </g>
                </g>

                {/* SVG Color Gradients */}
                <defs>
                  <linearGradient id="body-grad" x1="30" y1="45" x2="250" y2="170" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1e293b" />
                    <stop offset="0.5" stopColor="#0f172a" />
                    <stop offset="1" stopColor="#090d16" />
                  </linearGradient>

                  <linearGradient id="feeder-grad" x1="50" y1="15" x2="230" y2="45" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#334155" />
                    <stop offset="1" stopColor="#1e293b" />
                  </linearGradient>

                  <linearGradient id="tray-grad" x1="50" y1="160" x2="230" y2="205" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#0f172a" />
                    <stop offset="1" stopColor="#1e293b" />
                  </linearGradient>

                  <linearGradient id="metallic-strip" x1="31" y1="83" x2="249" y2="93" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#334155" />
                    <stop offset="0.3" stopColor="#4f46e5" />
                    <stop offset="0.7" stopColor="#38bdf8" />
                    <stop offset="1" stopColor="#334155" />
                  </linearGradient>

                  <linearGradient id="laser-glow" x1="72" y1="145" x2="208" y2="145" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#06b6d4" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#38bdf8" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#06b6d4" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Interactive Badge below Printer */}
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 group-hover:text-indigo-300 transition-colors">
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isTestPrinting ? 'Printing Test Document…' : 'Tap Printer to Test Feed'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

PrinterHero.displayName = 'PrinterHero';
