'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Sparkles, Copy, CheckCircle2, RotateCcw } from '@/components/ui/Icons';

interface WelcomePrintCompleteAnimationProps {
  orderNumber?: string;
  shopName?: string;
  fileName?: string;
  totalPages?: number;
  paperSize?: string;
  colorMode?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
}

const CELEBRATION_COLORS = [
  '#10B981', // Emerald
  '#059669', // Deep Emerald
  '#F59E0B', // Amber Gold
  '#FCD34D', // Bright Gold
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#FFFFFF', // White Sparkle
];

export const WelcomePrintCompleteAnimation: React.FC<WelcomePrintCompleteAnimationProps> = ({
  orderNumber,
  shopName = 'QuickPrint',
  fileName,
  totalPages = 1,
  paperSize = 'A4',
  colorMode = 'B&W',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const animationFrameId = useRef<number | null>(null);

  const triggerConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match container
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const particles: Particle[] = [];
    const count = 70;

    // Dual-cannon burst from left and right edges
    for (let i = 0; i < count; i++) {
      const isLeft = i % 2 === 0;
      particles.push({
        x: isLeft ? rect.width * 0.15 : rect.width * 0.85,
        y: rect.height * 0.35,
        vx: (isLeft ? 1 : -1) * (Math.random() * 8 + 3) + (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 9 + 4),
        w: Math.random() * 8 + 5,
        h: Math.random() * 12 + 6,
        color: CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.15 + 0.05,
        opacity: 1,
      });
    }

    let startTime = performance.now();
    const duration = 3200; // ms

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, rect.width, rect.height);

      let alive = false;
      for (const p of particles) {
        // Physics update
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28; // gravity
        p.vx *= 0.985; // drag
        p.rotation += p.rotationSpeed;
        p.wobble += p.wobbleSpeed;

        if (elapsed > duration * 0.6) {
          p.opacity = Math.max(0, 1 - (elapsed - duration * 0.6) / (duration * 0.4));
        }

        if (p.opacity > 0 && p.y < rect.height + 20) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.scale(Math.cos(p.wobble), 1);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.opacity;
          ctx.beginPath();
          ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (alive && elapsed < duration) {
        animationFrameId.current = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height);
        setIsReplaying(false);
      }
    };

    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    // Initial celebration burst after mount with a micro-delay for smooth layout entrance
    const timer = setTimeout(() => {
      triggerConfetti();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [triggerConfetti]);

  const handleCopyOrder = () => {
    if (!orderNumber) return;
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplay = () => {
    setIsReplaying(true);
    triggerConfetti();
  };

  return (
    <div
      role="region"
      aria-label="Print Complete Welcome Card"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-emerald-500/40 p-6 sm:p-8 text-white shadow-2xl space-y-6 transition-all duration-500 animate-in fade-in zoom-in-95"
    >
      {/* Celebration Confetti Canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
      />

      {/* Radiant Iridescent Background Glows */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-gradient-to-r from-emerald-500/30 via-amber-400/25 to-teal-400/30 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-20 right-10 w-64 h-36 bg-emerald-600/20 blur-2xl pointer-events-none rounded-full" />

      {/* Decorative Golden Starbursts in Background */}
      <div className="absolute top-4 left-6 text-amber-300/40 text-sm select-none pointer-events-none animate-pulse">
        ✦
      </div>
      <div className="absolute top-8 right-8 text-emerald-300/50 text-base select-none pointer-events-none animate-pulse [animation-delay:1s]">
        ✨
      </div>
      <div className="absolute bottom-12 left-8 text-amber-200/40 text-xs select-none pointer-events-none animate-pulse [animation-delay:1.5s]">
        ✦
      </div>

      {/* Top Welcome Ribbon / Status Pill */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-extrabold tracking-wider uppercase shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin [animation-duration:8s]" />
          <span>Welcome to Pickup</span>
        </div>

        <button
          type="button"
          onClick={handleReplay}
          disabled={isReplaying}
          title="Replay Celebration Animation"
          className="text-slate-400 hover:text-amber-300 text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer select-none active:scale-95"
        >
          <RotateCcw className={`w-3 h-3 ${isReplaying ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-semibold">Celebrate</span>
        </button>
      </div>

      {/* Hero Welcome Seal: Animated Golden-Emerald Crest with Expanding Sonar Waves */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-4 pt-2">
        <div className="relative flex items-center justify-center">
          {/* Sonar Pulse Wave 1 */}
          <span className="absolute w-24 h-24 rounded-full bg-emerald-400/20 animate-ping [animation-duration:2.5s] pointer-events-none" />
          {/* Sonar Pulse Wave 2 */}
          <span className="absolute w-20 h-20 rounded-full bg-amber-400/25 animate-ping [animation-duration:3.2s] [animation-delay:0.7s] pointer-events-none" />

          {/* Golden Rotating Ring */}
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-400 to-amber-300 p-0.75 shadow-lg shadow-emerald-500/30">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
              {/* Inner ambient shine */}
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-amber-400/20 animate-pulse [animation-duration:3s]" />
              <div className="relative flex items-center justify-center text-emerald-400">
                <Check className="w-9 h-9 stroke-[3] text-emerald-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.7)] animate-in zoom-in-50 duration-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Welcome Greeting Titles */}
        <div className="space-y-1.5 max-w-md mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-amber-200 tracking-tight leading-tight">
            Welcome! Your Prints are Ready
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
            All <strong className="text-emerald-300 font-bold">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</strong> have been freshly printed at <strong className="text-white font-bold">{shopName}</strong>. Step to the counter output tray to collect your copies.
          </p>
        </div>
      </div>

      {/* Order Collection Ticket / Counter Token Badge */}
      <div className="relative z-10 rounded-2xl bg-slate-950/80 border border-slate-800 p-4 sm:p-5 space-y-3.5 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block select-none">
              Counter Pickup Token
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-lg font-black text-amber-300 tracking-wider">
                {orderNumber ? `#${orderNumber}` : 'READY-AT-COUNTER'}
              </span>
              {orderNumber && (
                <button
                  type="button"
                  onClick={handleCopyOrder}
                  className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-colors cursor-pointer select-none active:scale-95"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600/90 text-white font-bold text-xs shadow-md shadow-emerald-700/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Counter 1 Collection</span>
            </span>
          </div>
        </div>

        {/* Document Specifications Summary */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Pages</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{totalPages} {totalPages === 1 ? 'Page' : 'Pages'}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Size</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{paperSize}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Color</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{colorMode === 'COLOR' ? 'Full Color' : 'Black & White'}</span>
          </div>
        </div>

        {fileName && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate pt-0.5">
            <span className="text-slate-500">Document:</span>
            <span className="font-medium text-slate-300 truncate">{fileName}</span>
          </div>
        )}
      </div>

      {/* Courteous Shopkeeper Sign-off */}
      <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pt-1 select-none">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Inspected and ready in output tray</span>
        </span>
        <span className="font-medium text-slate-400">
          Thank you for printing!
        </span>
      </div>
    </div>
  );
};
