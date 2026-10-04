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
    <header className="bg-white/85 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 shadow-xs">
      <div className="max-w-2xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3.5 group">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 rounded-xl blur-md opacity-30 group-hover:opacity-60 transition-opacity duration-300"></div>
            <div className="relative w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-all duration-300 ring-1 ring-white/20">
              <Printer className="w-5 h-5 text-white drop-shadow-sm" />
            </div>
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 bg-clip-text text-transparent leading-tight tracking-tight">
              {displayName}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-100/80 shadow-inner">
                <span className="text-[9px]">⚡</span>
              </div>
              <span className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">
                {shopConfig.tagline}
              </span>
            </div>
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
