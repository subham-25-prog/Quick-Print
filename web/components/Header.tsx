'use client';

import React from 'react';
import Link from 'next/link';
import { Shield } from '@/components/ui/Icons';
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
    <header className="bg-slate-950/90 backdrop-blur-xl border-b border-red-500/30 sticky top-0 z-40 shadow-lg shadow-red-950/20">
      {/* Top Spider-web glowing accent filament */}
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-red-500 via-blue-500 to-transparent opacity-80" />

      <div className="max-w-2xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 bg-red-600 rounded-2xl blur-md opacity-40 group-hover:opacity-80 transition-opacity duration-300" />
            <div className="relative w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br from-red-600 via-rose-600 to-blue-700 flex items-center justify-center text-white shadow-md shadow-red-900/40 group-hover:scale-105 transition-all duration-300 ring-2 ring-red-400/40">
              <span className="text-xl select-none group-hover:rotate-12 transition-transform duration-300">
                🕷️
              </span>
            </div>
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-black bg-gradient-to-r from-white via-red-100 to-blue-200 bg-clip-text text-transparent leading-tight tracking-tight uppercase">
                {displayName}
              </h1>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                Hero Station
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wide flex items-center gap-1">
              <span className="text-red-400">🕸️</span>
              <span>Friendly Neighborhood Document Printing</span>
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2.5">
          {/* Store Online Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 border border-red-500/30 text-emerald-400 shadow-sm transition-all">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-black tracking-wider uppercase text-slate-200">
              ⚡ Web Spooler Ready
            </span>
          </div>

          {isAdmin ? (
            <Link
              href="/"
              className="text-xs font-bold text-red-200 hover:text-white bg-slate-900 hover:bg-red-950/60 px-3 py-1.5 rounded-xl border border-red-500/40 transition-all duration-200 shadow-sm"
            >
              Customer View
            </Link>
          ) : (
            <Link
              href="/admin"
              className="relative p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-900 transition-all duration-200 group border border-slate-800"
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
