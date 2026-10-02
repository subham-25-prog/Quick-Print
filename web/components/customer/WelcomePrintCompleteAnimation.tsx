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

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const particles: Particle[] = [];
    const count = 55;

    for (let i = 0; i < count; i++) {
      const isLeft = i % 2 === 0;
      particles.push({
        x: isLeft ? rect.width * 0.12 : rect.width * 0.88,
        y: rect.height * 0.35,
        vx: (isLeft ? 1 : -1) * (Math.random() * 6 + 2.5) + (Math.random() - 0.5) * 3,
        vy: -(Math.random() * 7 + 3.5),
        w: Math.random() * 6 + 3.5,
        h: Math.random() * 9 + 4.5,
        color: CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.15 + 0.05,
        opacity: 1,
      });
    }

    let startTime = performance.now();
    const duration = 2600;

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, rect.width, rect.height);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.vx *= 0.985;
        p.rotation += p.rotationSpeed;
        p.wobble += p.wobbleSpeed;

        if (elapsed > duration * 0.6) {
          p.opacity = Math.max(0, 1 - (elapsed - duration * 0.6) / (duration * 0.4));
        }

        if (p.opacity > 0 && p.y < rect.height + 15) {
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
    const timer = setTimeout(() => {
      triggerConfetti();
    }, 100);

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
      aria-label="Thank You and Print Complete Celebration"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/98 to-slate-950 border border-emerald-500/40 p-4 sm:p-5 text-white shadow-xl space-y-3 transition-all duration-300 animate-in fade-in zoom-in-95 contain-layout"
    >
      {/* Celebration Confetti Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
      />

      {/* Ambient Glows */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-24 bg-gradient-to-r from-emerald-500/25 via-amber-400/20 to-teal-400/25 blur-2xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-10 right-6 w-40 h-20 bg-emerald-600/15 blur-xl pointer-events-none rounded-full" />

      {/* Top Header Pill & Celebrate Button */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-extrabold tracking-wider uppercase">
          <Sparkles className="w-3 h-3 text-amber-300 animate-spin [animation-duration:8s]" />
          <span>Printing Complete</span>
        </div>

        <button
          type="button"
          onClick={handleReplay}
          disabled={isReplaying}
          title="Replay Celebration"
          className="text-slate-400 hover:text-amber-300 text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer select-none active:scale-95"
        >
          <RotateCcw className={`w-2.5 h-2.5 ${isReplaying ? 'animate-spin' : ''}`} />
          <span>Celebrate</span>
        </button>
      </div>

      {/* Hero Welcome & Thank You Centerpiece */}
      <div className="relative z-10 flex items-center gap-3.5 sm:gap-4 py-0.5">
        {/* Animated Golden-Emerald Crest */}
        <div className="relative flex items-center justify-center shrink-0">
          <span className="absolute w-14 h-14 rounded-full bg-emerald-400/20 animate-ping [animation-duration:2.4s] pointer-events-none" />
          <div className="relative w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-400 to-amber-300 p-0.5 shadow-md shadow-emerald-500/30">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
              <Check className="w-6 h-6 stroke-[3] text-emerald-300 drop-shadow-[0_2px_6px_rgba(16,185,129,0.7)]" />
            </div>
          </div>
        </div>

        {/* Thank You & Guidance Text */}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-amber-200 tracking-tight leading-tight">
            Thank You!
          </h2>
          <p className="text-xs font-bold text-emerald-300 truncate">
            Prints are ready at the counter tray
          </p>
          <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
            Collect {totalPages} {totalPages === 1 ? 'page' : 'pages'} ({paperSize} • {colorMode === 'COLOR' ? 'Color' : 'B&W'}) from the counter.
          </p>
        </div>
      </div>

      {/* Sleek Token Card */}
      <div className="relative z-10 rounded-xl bg-slate-950/80 border border-slate-800/90 p-2.5 sm:p-3 flex items-center justify-between gap-2.5">
        <div className="min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block select-none">
            Pickup Token
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-sm sm:text-base font-extrabold text-amber-300 tracking-wider truncate">
              {orderNumber ? `#${orderNumber}` : 'READY'}
            </span>
            {orderNumber && (
              <button
                type="button"
                onClick={handleCopyOrder}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[9px] font-semibold text-slate-300 flex items-center gap-1 transition-colors cursor-pointer select-none active:scale-95 shrink-0"
              >
                {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          {fileName && (
            <span className="text-[10px] text-slate-400 block truncate max-w-[200px] mt-0.5">
              {fileName}
            </span>
          )}
        </div>

        <div className="shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[11px] shadow-sm shadow-emerald-700/30">
            <CheckCircle2 className="w-3 h-3 text-white" />
            <span>Ready at Counter</span>
          </span>
        </div>
      </div>

      {/* Courteous Sign-off Footer */}
      <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/60 select-none">
        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Output tray ready</span>
        </span>
        <span className="font-medium text-slate-300">
          Thanks for choosing {shopName}!
        </span>
      </div>
    </div>
  );
};
