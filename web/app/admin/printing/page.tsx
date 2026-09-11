'use client';

import React, { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
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

export default function AdminPrintingSettingsPage() {
  const [form, setForm] = useState<PricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Printer Management State
  const [printers, setPrinters] = useState<
    Array<{ id?: string; name: string; status: string; is_selected: boolean; last_seen?: string }>
  >([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [manualPrinterName, setManualPrinterName] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const res = await fetch('/api/admin/printers');
      if (res.ok) {
        const data = await res.json();
        setPrinters(data.printers || []);
        setAgentOnline(Boolean(data.agentOnline));
        if (data.activePrinter) {
          setForm((prev) => ({ ...prev, selected_printer: data.activePrinter }));
        }
      }
    } catch (err) {
      console.error('Failed to load printers:', err);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const loadDbStatus = async () => {
    try {
      const res = await fetch('/api/admin/db-status');
      if (res.ok) {
        const data = await res.json();
        if (data.agentOnline !== undefined) setAgentOnline(Boolean(data.agentOnline));
      }
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/pricing')
        .then((res) => res.json())
        .then((data) => {
          if (data.pricing) {
            if (!data.pricing.shop_name || /quickprint/i.test(data.pricing.shop_name)) {
              data.pricing.shop_name = defaultPricingConfig.shop_name;
            }
            setForm(data.pricing);
          }
        }),
      loadPrinters(),
      loadDbStatus(),
    ])
      .catch((err) => console.error('Failed to initialize printing settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectPrinter = async (printerName: string) => {
    if (!printerName.trim()) return;
    const target = printerName.trim();
    setForm((prev) => ({ ...prev, selected_printer: target }));
    setPrinters((prev) =>
      prev.map((p) => ({ ...p, is_selected: p.name === target }))
    );

    try {
      const res = await fetch('/api/admin/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName: target }),
      });
      if (res.ok) {
        showToast(`Active output printer set to "${target}"`, 'success');
        loadPrinters();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to switch printer', 'error');
      }
    } catch {
      showToast('Network error setting active printer', 'error');
    }
  };

  const handleDeletePrinter = async (e: React.MouseEvent, printerName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${printerName}" from the list?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/printers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName }),
      });
      if (res.ok) {
        showToast(`Removed "${printerName}"`, 'success');
        await loadPrinters();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to remove printer', 'error');
      }
    } catch {
      showToast('Network error removing printer', 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: form }),
      });

      const data = await res.json();
      if (res.ok && data.pricing) {
        setForm(data.pricing);
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
      loadDbStatus();
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
        {/* Page Title & Save Header Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Printing Settings</h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Hardware printer selection, spooling automation & device connection
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>

        {/* Section 1: Connected Printers & Active Output Selection */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Connected Printers & Selection
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {agentOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Spooler Online
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleStartAgent}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-amber-600 text-amber-600" />
                  <span>Start Print Agent</span>
                </button>
              )}
              <button
                type="button"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Scan and refresh connected printers"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            If you have multiple printers connected (e.g. Black & White Laser, Color Inkjet, POS Slip), choose which printer Cyber Cafe should use to print customer documents automatically.
          </p>

          {/* List of Connected Printers */}
          <div className="space-y-2">
            {printers.length > 0 ? (
              printers.map((printer) => {
                const isSelected = form.selected_printer === printer.name || (!form.selected_printer && printer.is_selected);
                const isOnline = printer.status === 'ONLINE';

                return (
                  <div
                    key={printer.name}
                    onClick={() => handleSelectPrinter(printer.name)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {printer.name}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                              isOnline
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isOnline ? 'Online' : printer.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium truncate">
                          {isSelected ? 'Assigned for live document spooling' : 'Click to select this printer'}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isSelected ? (
                        <span className="px-3 py-1 rounded-xl text-[10px] font-extrabold bg-indigo-600 text-white flex items-center gap-1.5 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          <span>Active Printer</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPrinter(printer.name);
                          }}
                          className="px-3 py-1 rounded-xl text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                        >
                          Use This
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeletePrinter(e, printer.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove printer from list"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
                <Printer className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-xs font-bold text-slate-700">No printers detected yet</div>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Make sure your Windows Print Agent is running on your machine to auto-detect installed printers, or specify a printer name manually below.
                </p>
                <button
                  type="button"
                  onClick={handleStartAgent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Launch Windows Print Agent</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Dropdown & Manual Input */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="text-[11px] font-bold text-slate-600">Quick Selection & Manual Setup:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">
                  Choose from detected printers:
                </label>
                <select
                  value={form.selected_printer || ''}
                  onChange={(e) => handleSelectPrinter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                >
                  <option value="">-- Choose Printer --</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.status === 'ONLINE' ? '(Ready)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">
                  Or enter custom printer name:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. Canon LBP2900 or \\PC\Printer"
                    value={manualPrinterName}
                    onChange={(e) => setManualPrinterName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (manualPrinterName.trim()) {
                        handleSelectPrinter(manualPrinterName.trim());
                        setManualPrinterName('');
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shrink-0 cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          </div>
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
        <DeveloperBadge variant="inline" className="pt-6 pb-2" />
      </main>
    </div>
  );
}
