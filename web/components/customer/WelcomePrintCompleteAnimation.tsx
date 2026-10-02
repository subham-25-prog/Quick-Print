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
    const count = 65;

    // Dual-cannon burst from left and right
    for (let i = 0; i < count; i++) {
      const isLeft = i % 2 === 0;
      particles.push({
        x: isLeft ? rect.width * 0.12 : rect.width * 0.88,
        y: rect.height * 0.35,
        vx: (isLeft ? 1 : -1) * (Math.random() * 7 + 3) + (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 8 + 4),
        w: Math.random() * 7 + 4,
        h: Math.random() * 10 + 5,
        color: CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.15 + 0.05,
        opacity: 1,
      });
    }

    let startTime = performance.now();
    const duration = 2800;

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, rect.width, rect.height);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.26;
        p.vx *= 0.985;
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
    const timer = setTimeout(() => {
      triggerConfetti();
    }, 120);

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
      className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/98 to-slate-950 border border-emerald-500/40 p-5 sm:p-7 text-white shadow-2xl space-y-5 transition-all duration-300 animate-in fade-in zoom-in-95 contain-layout"
    >
      {/* Celebration Confetti Canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
      />

      {/* Radiant Iridescent Background Glows */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-36 bg-gradient-to-r from-emerald-500/25 via-amber-400/20 to-teal-400/25 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-16 right-8 w-52 h-28 bg-emerald-600/15 blur-2xl pointer-events-none rounded-full" />

      {/* Top Header Pill & Celebrate Button */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-extrabold tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin [animation-duration:8s]" />
          <span>Printing Complete</span>
        </div>

        <button
          type="button"
          onClick={handleReplay}
          disabled={isReplaying}
          title="Replay Celebration"
          className="text-slate-400 hover:text-amber-300 text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer select-none active:scale-95"
        >
          <RotateCcw className={`w-3 h-3 ${isReplaying ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-semibold">Celebrate</span>
        </button>
      </div>

      {/* Hero Welcome & Thank You Centerpiece */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-3.5 py-1">
        {/* Animated Golden-Emerald Crest with Expanding Sonar Waves */}
        <div className="relative flex items-center justify-center">
          <span className="absolute w-20 h-20 rounded-full bg-emerald-400/20 animate-ping [animation-duration:2.4s] pointer-events-none" />
          <span className="absolute w-16 h-16 rounded-full bg-amber-400/25 animate-ping [animation-duration:3s] [animation-delay:0.6s] pointer-events-none" />

          <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-400 to-amber-300 p-0.75 shadow-lg shadow-emerald-500/30">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-amber-400/20 animate-pulse [animation-duration:3s]" />
              <div className="relative flex items-center justify-center text-emerald-400">
                <Check className="w-8 h-8 stroke-[3] text-emerald-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.7)] animate-in zoom-in-50 duration-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Thank You & Welcome Typography */}
        <div className="space-y-1 max-w-sm mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-white to-amber-200 tracking-tight leading-tight">
            Thank You!
          </h2>
          <p className="text-sm font-bold text-emerald-300">
            Your prints are ready at the counter tray
          </p>
          <p className="text-xs text-slate-300 font-medium leading-relaxed pt-0.5">
            Please pick up your <span className="text-white font-bold">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span> ({paperSize} • {colorMode === 'COLOR' ? 'Color' : 'B&W'}) from the counter.
          </p>
        </div>
      </div>

      {/* Sleek Token Card */}
      <div className="relative z-10 rounded-2xl bg-slate-950/80 border border-slate-800/90 p-3.5 sm:p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block select-none">
            Order Pickup Token
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-base font-extrabold text-amber-300 tracking-wider truncate">
              {orderNumber ? `#${orderNumber}` : 'READY'}
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
            <span className="text-[10px] text-slate-400 block truncate max-w-[220px] mt-0.5">
              {fileName}
            </span>
          )}
        </div>

        <div className="shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-md shadow-emerald-700/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            <span>Ready at Counter</span>
          </span>
        </div>
      </div>

      {/* Courteous Shopkeeper Sign-off */}
      <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pt-0.5 border-t border-slate-800/60 select-none">
        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Output tray verified</span>
        </span>
        <span className="font-medium text-slate-300">
          Thank you for choosing {shopName}!
        </span>
      </div>
    </div>
  );
};
