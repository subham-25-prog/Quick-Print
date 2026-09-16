'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, Lock, Save, Play } from '@/components/ui/Icons';
import { startPolling } from '@/lib/polling';
import { useShopName } from '@/lib/shop-sync';

interface AdminHeaderProps {
  onSave?: () => void;
  saving?: boolean;
  saveButtonText?: string;
  showSave?: boolean;
  shopName?: string;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  onSave,
  saving = false,
  saveButtonText = 'Save Changes',
  showSave = false,
  shopName,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const storeName = useShopName(shopName);
  const [dbStatus, setDbStatus] = React.useState<{
    connected: boolean;
    mode: string;
    message: string;
    shopName?: string;
    agentOnline?: boolean;
    agentName?: string | null;
  } | null>(null);

  React.useEffect(() => {
    let stopped = false;
    const polling = startPolling({
      intervalMs: 4000,
      poll: async (signal) => {
        const res = await fetch('/api/admin/db-status', { signal });
        if (!res.ok) throw new Error('Could not refresh connection status');
        const data = await res.json();
        if (!stopped && !signal.aborted) setDbStatus(data);
      },
      onError: () => {
        if (!stopped) setDbStatus({ connected: false, mode: 'UNAVAILABLE', message: 'Offline', agentOnline: false });
      },
    });
    return () => { stopped = true; polling.stop(); };
  }, []);

  const handleStartAgent = (e: React.MouseEvent) => {
    e.preventDefault();
    // Launch agent via custom Windows protocol
    window.location.href = 'quickprint://start';
  };

  const navItems = [
    { label: 'Orders & History', href: '/admin', icon: '📋' },
    { label: 'Shop QR Code', href: '/admin/poster', icon: '📱' },
    { label: 'Shop Settings', href: '/admin/settings', icon: '⚙️' },
    { label: 'Printing Settings', href: '/admin/printing', icon: '🖨️' },
  ];

  const handleLockPortal = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {}
    router.replace('/admin/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Shop Logo & Title */}
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
            <Link
              href="/admin"
              prefetch={true}
              className="flex min-w-0 max-w-full items-center gap-2.5 group active:scale-95 transition-transform"
            >
              <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors block [overflow-wrap:anywhere]">
                  {storeName}
                </span>
              </div>
            </Link>

            {/* Cloud DB Status */}
            {dbStatus && (
              <span
                title={dbStatus.message}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  dbStatus.connected
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{dbStatus.connected ? 'Cloud DB' : 'DB Offline'}</span>
              </span>
            )}

            {/* Print Agent Status & 1-Click Launch Button */}
            {dbStatus && (
              dbStatus.agentOnline ? (
                <Link
                  href="/admin/printing"
                  title={`Active Printer: ${dbStatus.agentName || 'Online'}. Click to manage printers.`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">
                    {dbStatus.agentName && dbStatus.agentName !== 'agent-main-pc'
                      ? dbStatus.agentName
                      : 'Printer Online'}
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleStartAgent}
                  title="Click to launch Print Agent on this PC (quickprint://start)"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                >
                  <Play className="w-2.5 h-2.5 fill-indigo-600 text-indigo-600" />
                  <span>Start Agent</span>
                </button>
              )
            )}
          </div>

          {/* Central Nav Tabs, Header Save Button & Lock Button */}
          <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
            <nav className="flex flex-1 min-w-0 items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto text-xs font-semibold scrollbar-none">
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
    </>
  );
};
