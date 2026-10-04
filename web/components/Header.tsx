'use client';

import React from 'react';
import Link from 'next/link';
import { Printer, Shield } from '@/components/ui/Icons';
import { shopConfig } from '@/lib/config';
import { useShopName } from '@/lib/shop-sync';

interface HeaderProps {
  isAdmin?: boolean;
  shopName?: string;
}

export const Header: React.FC<HeaderProps> = React.memo(({ isAdmin = false, shopName }) => {
  const displayName = useShopName(shopName);

  React.useEffect(() => {
    if (displayName && typeof document !== 'undefined') {
      const currentTitle = document.title;
      // Update page title if it has default shop name or is empty
      if (!currentTitle || currentTitle.includes(shopConfig.name) || currentTitle.includes('– Self-Service Document Printing')) {
        document.title = `${displayName} – Self-Service Document Printing`;
      }
    }
  }, [displayName]);

  return (
    <header className="bg-[#fcf6f0]/95 backdrop-blur-xl border-b border-[#8a3c26]/20 sticky top-0 z-40 shadow-xs relative overflow-hidden">
      {/* Earthy Terracotta Kalka (Paisley) Motif on the right */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-[300px] opacity-[0.06] pointer-events-none mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 90 C 90 90, 90 40, 50 40 C 25 40, 25 15, 50 5 C 10 20, -5 60, 20 90 Z' fill='none' stroke='%2378350f' stroke-width='3' /%3E%3Cpath d='M45 80 C 70 80, 70 48, 48 48 C 30 48, 30 25, 48 15 C 20 28, 15 55, 25 80 Z' fill='none' stroke='%239a3412' stroke-width='2' stroke-dasharray='4 4' /%3E%3Ccircle cx='40' cy='62' r='6' fill='%2378350f' /%3E%3Ccircle cx='40' cy='62' r='12' fill='none' stroke='%239a3412' stroke-width='1.5' /%3E%3C/svg%3E")`,
          backgroundSize: '160px 160px',
          backgroundPosition: 'right -20px top -30px',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      <div className="max-w-2xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 relative z-10">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3.5 group">
          <div className="relative">
            <div className="absolute inset-0 bg-[#c2410c] rounded-xl blur-md opacity-25 group-hover:opacity-60 transition-opacity duration-300"></div>
            <div className="relative w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#9a3412] via-[#c2410c] to-[#d97706] flex items-center justify-center text-white shadow-[0_4px_10px_rgba(154,52,18,0.25)] group-hover:scale-105 transition-all duration-300 ring-1 ring-white/40">
              <Printer className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(67,20,7,0.6)]" />
            </div>
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-[#431407] via-[#78350f] to-[#9a3412] bg-clip-text text-transparent leading-tight tracking-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
              {displayName}
            </h1>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          {/* Store Online Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200/60 text-emerald-700 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.15)] transition-all hover:shadow-[0_4px_12px_-2px_rgba(16,185,129,0.2)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold tracking-wide uppercase">Self-service</span>
          </div>

          {isAdmin ? (
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-indigo-700 bg-slate-100/80 hover:bg-indigo-50 px-3 py-1.5 rounded-xl border border-slate-200/80 hover:border-indigo-200 transition-all duration-200 shadow-sm"
            >
              Customer View
            </Link>
          ) : (
            <Link
              href="/admin"
              className="relative p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200 group"
              title="Admin Portal"
            >
              <Shield className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
});
Header.displayName = 'Header';
