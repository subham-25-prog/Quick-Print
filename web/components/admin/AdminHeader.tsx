'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, Lock, Save, Play, Printer, X } from '@/components/ui/Icons';
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
  const [showAgentModal, setShowAgentModal] = React.useState(false);

  React.useEffect(() => {
    let stopped = false;
    const checkStatus = () => {
      fetch('/api/admin/db-status')
        .then((res) => res.json())
        .then((data) => {
          if (!stopped) setDbStatus(data);
        })
        .catch(() => {
          if (!stopped) {
            setDbStatus({
              connected: false,
              mode: 'LOCAL_MEMORY',
              message: 'Offline',
              agentOnline: false,
            });
          }
        });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  const handleStartAgent = (e: React.MouseEvent) => {
    e.preventDefault();
    // Launch agent via custom Windows protocol
    window.location.href = 'quickprint://start';
    setShowAgentModal(true);
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
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Shop Logo & Title */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/admin"
              prefetch={true}
              className="flex items-center gap-2.5 group active:scale-95 transition-transform"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors block">
                  {storeName}
                </span>
                <div className="text-[10px] text-slate-400 font-semibold">
                  Shopkeeper Command Center
                </div>
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

      {/* Print Agent Launcher Info Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-slate-900">Starting Print Agent…</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your browser was instructed to open the QuickPrint Agent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>1. Allow Browser Prompt</span>
                </p>
                <p className="text-slate-500 text-[11px]">
                  If your browser shows a popup asking to open <strong>QuickPrint</strong> or <strong>command line</strong>, click <strong>Open</strong> or <strong>Allow</strong>.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 space-y-1">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>2. First time on this computer?</span>
                </p>
                <p className="text-amber-800 text-[11px]">
                  Run <code className="bg-amber-100 px-1 py-0.2 rounded font-mono font-bold">register_protocol.bat</code> in the <code className="bg-amber-100 px-1 py-0.2 rounded font-mono font-bold">print-agent</code> folder once to enable 1-click launching from the website.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = 'quickprint://start';
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
