'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, Lock, Save, Check } from '@/components/ui/Icons';
import { shopConfig } from '@/lib/config';

interface AdminHeaderProps {
  onSave?: () => void;
  saving?: boolean;
  saveButtonText?: string;
  showSave?: boolean;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  onSave,
  saving = false,
  saveButtonText = 'Save Changes',
  showSave = false,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const storeName = shopConfig.name;

  const navItems = [
    { label: 'Orders & History', href: '/admin', icon: '📋' },
    { label: 'Shop QR Code', href: '/admin/poster', icon: '📱' },
  ];

  const handleLockPortal = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('qp_admin_auth');
    }
    router.replace('/admin/login');
  };

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Shop Logo & Title */}
          <Link
            href="/admin"
            prefetch={true}
            className="flex items-center gap-2.5 group active:scale-95 transition-transform"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                {storeName}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">
                Shopkeeper Command Center
              </div>
            </div>
          </Link>

          {/* Central Nav Tabs, Header Save Button & Lock Button */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto text-xs font-semibold scrollbar-none">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-75 whitespace-nowrap active:scale-95 ${
                      isActive
                        ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <span className="text-xs">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {showSave && onSave && (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{saving ? 'Saving...' : saveButtonText}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLockPortal}
              title="Lock Admin Portal"
              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition-all active:scale-95 flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {/* Fixed Header Spacer */}
      <div className="h-16 w-full shrink-0" aria-hidden="true" />
    </>
  );
};


