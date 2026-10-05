'use client';

import React, { useState } from 'react';
import Image from 'next/image';

export const SpidermanBanner: React.FC = () => {
  const [quipIndex, setQuipIndex] = useState(0);
  const [isThwip, setIsThwip] = useState(false);

  const quips = [
    'With great prints comes great responsibility! 🕸️',
    'Faster than web-slinging across the Queensboro bridge! ⚡',
    'Drop your PDF into the web and pick it up hot at the counter! 🖨️',
    'Friendly neighborhood print prices, superhero speed! 🦸',
  ];

  const handleSpideyClick = () => {
    setIsThwip(true);
    setQuipIndex((prev) => (prev + 1) % quips.length);
    setTimeout(() => setIsThwip(false), 800);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl spidey-card p-4 sm:p-5 text-white border-2 border-red-500/40 shadow-xl shadow-red-950/40 select-none contain-layout">
      {/* Spider-web corner accent filaments */}
      <div className="absolute -top-12 -right-12 w-44 h-44 bg-gradient-to-br from-red-600/20 via-blue-600/10 to-transparent rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-gradient-to-tr from-blue-600/20 to-transparent rounded-full blur-xl pointer-events-none" />

      {/* Hanging Silk Web Rope from Ceiling */}
      <div className="absolute top-0 right-12 sm:right-16 flex flex-col items-center pointer-events-none">
        <div className="w-1 h-8 bg-gradient-to-b from-white via-slate-200 to-white/90 rounded-full shadow-[0_0_8px_white]" />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-4">
        {/* Left: Marvel Typography & Value Props */}
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-rose-600 text-[10px] font-black uppercase tracking-wider text-white shadow-xs border border-red-400/40">
              <span>🕷️</span>
              <span>Marvel Edition</span>
            </span>
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded-full">
              Zero Wait Time
            </span>
          </div>

          <div className="space-y-0.5">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="bg-gradient-to-r from-white via-red-200 to-blue-200 bg-clip-text text-transparent">
                Spider-Fast Document Printing
              </span>
            </h2>

            {/* Interactive Comic Speech Bubble */}
            <div
              onClick={handleSpideyClick}
              className={`inline-block p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-red-200 font-semibold cursor-pointer transition-all active:scale-95 ${
                isThwip ? 'animate-comic-pop ring-2 ring-red-400' : ''
              }`}
              title="Tap Spidey for another quote!"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">💬</span>
                <span className="italic leading-snug">{quips[quipIndex]}</span>
              </div>
            </div>
          </div>

          {/* Quick Hero Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-bold text-slate-300">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-red-400">⚡</span>
              <span>Instant Counter Spooling</span>
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-blue-400">💎</span>
              <span>Razor-Sharp 1200 DPI</span>
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-emerald-400">💸</span>
              <span>Friendly Student Rates</span>
            </span>
          </div>
        </div>

        {/* Right: Upside-Down Hanging Spider-Man */}
        <div
          onClick={handleSpideyClick}
          className="relative shrink-0 w-24 sm:w-28 h-32 sm:h-36 cursor-pointer group active:scale-90 transition-transform duration-200"
          title="Tap to make Spider-Man swing!"
        >
          {/* Comic Action Sound Effect on tap */}
          {isThwip && (
            <div className="absolute -top-3 -left-6 z-20 animate-comic-pop pointer-events-none">
              <span className="px-2.5 py-0.5 rounded-lg bg-yellow-400 text-slate-950 font-black text-[10px] tracking-wider uppercase border border-white shadow-lg rotate-[-12deg] block">
                THWIP! 🕸️
              </span>
            </div>
          )}

          {/* Hanging Spider-Man Animation */}
          <div className="w-full h-full animate-spiderman-pendulum filter drop-shadow-[0_8px_16px_rgba(220,38,38,0.4)]">
            <Image
              src="/spiderman.png"
              alt="Hanging Spider-Man"
              fill
              sizes="(max-width: 640px) 96px, 112px"
              className="object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
};
