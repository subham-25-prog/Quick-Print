'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Printer, Shield, History } from '@/components/ui/Icons';
import { shopConfig } from '@/lib/config';

interface HeaderProps {
  isAdmin?: boolean;
  shopName?: string;
  onOpenHistory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isAdmin = false, shopName, onOpenHistory }) => {
  const displayName = shopName || shopConfig.name;
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('quickprint_customer_orders');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistoryCount(parsed.length);
        }
      }
    } catch (e) {}
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {displayName}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                <span>⚡</span> {shopConfig.tagline}
              </span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {!isAdmin && onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="View Order History"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">My Orders</span>
              {historyCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {historyCount}
                </span>
              )}
            </button>
          )}

          {/* Store Online Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px]">Store Online</span>
          </div>

          {isAdmin ? (
            <Link
              href="/"
              className="text-xs text-slate-600 hover:text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors"
            >
              Customer View
            </Link>
          ) : (
            <Link
              href="/admin"
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Admin Portal"
            >
              <Shield className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
