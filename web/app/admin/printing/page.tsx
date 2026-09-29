'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { useInitialPricing } from '@/lib/initial-pricing';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import {
Printer,
CheckCircle2,
AlertCircle,
RefreshCw,
Save,
Play,
Trash2
} from '@/components/ui/Icons';

interface PrinterCardProps {
  printer: { id?: string; name: string; status: string; is_selected: boolean; last_seen?: string };
  isSelected: boolean;
  selectionPending: boolean;
  switchingPrinter: boolean;
  onSelectPrinter: (name: string) => void;
  onDeletePrinter: (e: React.MouseEvent, name: string) => void;
}

const PrinterCard = React.memo<PrinterCardProps>(({
  printer,
  isSelected,
  selectionPending,
  switchingPrinter,
  onSelectPrinter,
  onDeletePrinter,
}) => {
  const isOnline = printer.status === 'ONLINE';

  return (
    <div
      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 contain-layout ${
        isSelected
          ? 'border-indigo-600 bg-indigo-50/60 text-slate-900 ring-2 ring-indigo-600/30 shadow-xs'
          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50/60 text-slate-700'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isSelected
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Printer className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-900 break-all">
              {printer.name}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
              <span className="sr-only">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium truncate">
            {isSelected
              ? !isOnline
                ? 'Default printer (currently offline — jobs will wait for connection)'
                : selectionPending
                  ? 'Waiting for agent confirmation'
                  : 'Default printer for customer print jobs'
              : isOnline
                ? 'Ready • Click to set as default printer'
                : 'Offline • Previously connected device'}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-1.5">
        {isSelected ? (
          <span className="px-3 py-1 rounded-xl text-[10px] font-extrabold bg-indigo-600 text-white flex items-center gap-1.5 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            <span>{selectionPending ? 'Pending' : 'Default Printer'}</span>
          </span>
        ) : (
          <button
            type="button"
            disabled={switchingPrinter}
            aria-label={`Use ${printer.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPrinter(printer.name);
            }}
            className="px-3 py-1 rounded-xl text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer touch-manipulation disabled:opacity-50"
          >
            Set as Default
          </button>
        )}

        <button
          type="button"
          disabled={switchingPrinter}
          onClick={(e) => onDeletePrinter(e, printer.name)}
          className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer touch-manipulation flex items-center gap-1 text-[10px] font-bold"
          aria-label={`Forget ${printer.name}`}
          title={`Forget ${printer.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Forget</span>
        </button>
      </div>
    </div>
  );
});
PrinterCard.displayName = 'PrinterCard';

export default function AdminPrintingSettingsPage() {
  const [form, setForm] = useState<PricingConfig>(useInitialPricing());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Printer Management State
  const [printers, setPrinters] = useState<
    Array<{ id?: string; name: string; status: string; is_selected: boolean; last_seen?: string }>
  >([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [switchingPrinter, setSwitchingPrinter] = useState(false);
  const [printerError, setPrinterError] = useState('');
  const [selectionPending, setSelectionPending] = useState(false);
  const [agentMode, setAgentMode] = useState<string | null>(null);
  const printerRequest = useRef(0);
  const printerBusy = useRef(false);
  const printerLoading = useRef(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadPrinters = useCallback(async () => {
    if (printerBusy.current || printerLoading.current) return;
    const request = ++printerRequest.current;
    printerLoading.current = true;
    setLoadingPrinters(true);
    try {
      const res = await fetch('/api/admin/printers', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not refresh printers');
      if (request === printerRequest.current) {
        setPrinters(data.printers || []);
        setAgentOnline(Boolean(data.agentOnline));
        setAgentMode(data.agentMode || null);
        setSelectionPending(Boolean(data.selectionPending));
        setForm((prev) => ({ ...prev, selected_printer: data.activePrinter || null }));
        setPrinterError('');
      }
    } catch (err) {
      if (request === printerRequest.current) setPrinterError(err instanceof Error ? err.message : 'Could not refresh printers');
    } finally {
      printerLoading.current = false;
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
      fetch('/api/admin/pricing')
        .then((res) => res.json())
        .then((data) => {
          if (!disposed && data.pricing) {
            if (!data.pricing.shop_name || /quickprint/i.test(data.pricing.shop_name)) {
              data.pricing.shop_name = defaultPricingConfig.shop_name;
            }
            setForm(data.pricing);
          }
        })
      .then(() => { if (!disposed) return loadPrinters(); })
      .catch((err) => console.error('Failed to initialize printing settings:', err))
      .finally(() => { if (!disposed) setLoading(false); });
    const refresh = () => { if (!document.hidden) void loadPrinters(); };
    const interval = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      printerRequest.current++;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadPrinters]);

  const handleSelectPrinter = useCallback(async (printerName: string) => {
    if (!printerName.trim() || printerBusy.current) return;
    const target = printerName.trim();
    printerBusy.current = true;
    printerRequest.current++;
    setSwitchingPrinter(true);

    try {
      const res = await fetch('/api/admin/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName: target }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, selected_printer: data.activePrinter }));
        setPrinters((prev) => prev.map((p) => ({ ...p, is_selected: p.name === data.activePrinter })));
        setSelectionPending(true);
        showToast(`Saved "${target}". Waiting for the print agent to apply it.`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to switch printer', 'error');
      }
    } catch {
      showToast('Network error setting active printer', 'error');
    } finally {
      printerBusy.current = false;
      setSwitchingPrinter(false);
      void loadPrinters();
    }
  }, [loadPrinters]);

  const handleDeletePrinter = useCallback(async (e: React.MouseEvent, printerName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Forget "${printerName}" from saved devices for this shop?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/printers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName }),
      });
      if (res.ok) {
        showToast(`Forgot printer "${printerName}"`, 'success');
        await loadPrinters();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to forget printer', 'error');
      }
    } catch {
      showToast('Network error forgetting printer', 'error');
    }
  }, [loadPrinters]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: { ...form, selected_printer: undefined } }),
      });

      const data = await res.json();
      if (res.ok && data.pricing) {
        setForm((prev) => ({ ...data.pricing, selected_printer: prev.selected_printer }));
        showToast('Printing settings saved successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to update printing settings');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartAgent = () => {
    window.location.href = 'quickprint://start';
    showToast('Launching Windows Print Agent via quickprint://start...', 'success');
    setTimeout(() => {
      loadPrinters();
    }, 4000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <AdminHeader shopName={form.shop_name} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm font-semibold">Loading printing settings...</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedPrinterName = form.selected_printer || printers.find((p) => p.is_selected)?.name || null;
  const selectedPrinterObj = printers.find((p) => p.name === selectedPrinterName);
  const isDefaultPrinterOffline = Boolean(
    selectedPrinterName &&
    (!agentOnline || !selectedPrinterObj || selectedPrinterObj.status === 'OFFLINE')
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-28">
      <AdminHeader shopName={form.shop_name} />

      {/* Floating Action Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-3 backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-slate-900/95 text-white border-slate-700 shadow-emerald-500/10'
                : 'bg-rose-600/95 text-white border-rose-500 shadow-rose-500/20'
            }`}
          >
            {toast.type === 'success' ? (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Section 1: Connected Printers & Active Output Selection */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-bold text-slate-900">
                Printers
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-95"
                title="Scan and refresh connected printers"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${loadingPrinters ? 'animate-spin' : ''}`} />
                <span>Refresh printers</span>
              </button>
              {agentOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Agent Online
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleStartAgent}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-amber-600 text-amber-600" />
                  <span>Start Print Agent</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            Printers are detected by this shop’s local print agent and refreshed automatically. Only printers detected by the agent or previously connected by this shop are shown.
          </p>
          {agentMode === 'sandbox' && <p role="status" className="text-xs text-amber-700">Simulation mode: physical printing is disabled. Printer discovery and selection are available.</p>}
          {selectionPending && <p role="status" className="text-xs text-amber-700">Selection saved. Waiting for the print agent to confirm it.</p>}
          {printerError && <p role="alert" className="text-xs text-rose-700">{printerError}. Displayed printer information may be out of date.</p>}

          {/* Warning: Default Printer Offline */}
          {isDefaultPrinterOffline && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-amber-50 border border-amber-300/80 text-amber-950 flex items-start gap-3 shadow-xs animate-in fade-in duration-200"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                  <span>Warning: Default printer &quot;{selectedPrinterName}&quot; is Offline</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200">
                    Offline
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                  Incoming print jobs will pause until this printer reconnects. QuickPrint will not silently send jobs to another printer.
                </p>
              </div>
            </div>
          )}

          {/* List of Connected Printers */}
          <div className="space-y-2">
            {printers.length > 0 ? (
              printers.map((printer) => {
                const isSelected = form.selected_printer === printer.name || (!form.selected_printer && printer.is_selected);
                return (
                  <PrinterCard
                    key={printer.name}
                    printer={printer}
                    isSelected={isSelected}
                    selectionPending={selectionPending}
                    switchingPrinter={switchingPrinter}
                    onSelectPrinter={handleSelectPrinter}
                    onDeletePrinter={handleDeletePrinter}
                  />
                );
              })
            ) : (
              <div className="p-8 rounded-3xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mx-auto shadow-2xs">
                  <Printer className="w-6 h-6 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-slate-800">
                    No printer connected.
                  </h3>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto font-medium">
                    Connect a printer to this shop’s print device to get started.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={loadPrinters}
                    disabled={loadingPrinters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
                    <span>Refresh printers</span>
                  </button>
                  {!agentOnline && (
                    <button
                      type="button"
                      onClick={handleStartAgent}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Launch Print Agent</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Dropdown for Default Printer Selection */}
          {printers.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label htmlFor="printer-select" className="block text-xs font-bold text-slate-700">
                Choose from detected printers:
              </label>
              <select
                id="printer-select"
                aria-label="Choose from detected printers"
                disabled={switchingPrinter}
                value={selectedPrinterName || ''}
                onChange={(e) => handleSelectPrinter(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 cursor-pointer"
              >
                <option value="">-- Choose Printer --</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.status === 'ONLINE' ? '(Ready)' : '(Offline)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Bottom Save Bar */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Printing Settings</span>
              </>
            )}
          </button>
        </div>

        {/* Developer Attribution */}
        <DeveloperBadge className="pt-6 pb-2" />
      </main>
    </div>
  );
}
