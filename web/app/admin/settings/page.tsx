'use client';

import React, { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { PricingConfig, CustomAddon, CustomPaperType } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { formatCurrency } from '@/lib/utils';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  FileText,
  CreditCard,
  Plus,
  Trash2,
  User,
  Phone,
  MessageSquare,
  Zap,
} from '@/components/ui/Icons';

export default function AdminSettingsPage() {
  const [form, setForm] = useState<PricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Custom Option Form State
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState<number | ''>('');
  const [newAddonUnit, setNewAddonUnit] = useState<'per_copy' | 'per_page' | 'per_order'>('per_copy');
  const [newAddonDesc, setNewAddonDesc] = useState('');

  // Custom Paper Size Form State
  const [newPaperName, setNewPaperName] = useState('');
  const [newPaperBwSingle, setNewPaperBwSingle] = useState<number | ''>('');
  const [newPaperBwDouble, setNewPaperBwDouble] = useState<number | ''>('');
  const [newPaperColorSingle, setNewPaperColorSingle] = useState<number | ''>('');
  const [newPaperColorDouble, setNewPaperColorDouble] = useState<number | ''>('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setForm(data.pricing);
      })
      .catch((err) => console.error('Failed to load pricing:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof PricingConfig, value: any) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const toggleEnabledPaper = (paperKey: 'a4' | 'a3' | 'legal' | 'photo') => {
    setForm((prev) => ({
      ...prev,
      enabled_papers: {
        ...(prev.enabled_papers || defaultPricingConfig.enabled_papers),
        [paperKey]: !(prev.enabled_papers?.[paperKey] !== false),
      },
    }));
  };

  const toggleEnabledAddon = (addonKey: 'stapling' | 'spiralBinding' | 'lamination' | 'hardBinding' | 'softBinding') => {
    setForm((prev) => ({
      ...prev,
      enabled_addons: {
        ...(prev.enabled_addons || defaultPricingConfig.enabled_addons),
        [addonKey]: !(prev.enabled_addons?.[addonKey] !== false),
      },
    }));
  };

  const toggleFormField = (fieldKey: keyof NonNullable<PricingConfig['form_fields']>) => {
    setForm((prev) => ({
      ...prev,
      form_fields: {
        ...(prev.form_fields || defaultPricingConfig.form_fields),
        [fieldKey]: !(prev.form_fields?.[fieldKey] !== false),
      },
    }));
  };

  const handleFormFieldChange = (fieldKey: keyof NonNullable<PricingConfig['form_fields']>, value: any) => {
    setForm((prev) => ({
      ...prev,
      form_fields: {
        ...(prev.form_fields || defaultPricingConfig.form_fields),
        [fieldKey]: value,
      },
    }));
  };

  // Add Custom Option
  const handleAddCustomOption = () => {
    if (!newAddonName.trim() || newAddonPrice === '' || isNaN(Number(newAddonPrice))) return;

    const newAddon: CustomAddon = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newAddonName.trim(),
      description: newAddonDesc.trim() || undefined,
      price: Number(newAddonPrice),
      unit: newAddonUnit,
      enabled: true,
    };

    setForm((prev) => ({
      ...prev,
      custom_addons: [...(prev.custom_addons || []), newAddon],
    }));

    setNewAddonName('');
    setNewAddonPrice('');
    setNewAddonDesc('');
  };

  const toggleCustomOption = (addonId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_addons: (prev.custom_addons || []).map((a) =>
        a.id === addonId ? { ...a, enabled: !a.enabled } : a
      ),
    }));
  };

  const handleDeleteCustomOption = (addonId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_addons: (prev.custom_addons || []).filter((a) => a.id !== addonId),
    }));
  };

  // Add Custom Paper Size
  const handleAddCustomPaper = () => {
    if (!newPaperName.trim() || newPaperBwSingle === '') return;

    const newPaper: CustomPaperType = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newPaperName.trim(),
      bw_single: Number(newPaperBwSingle || 0),
      bw_double: Number(newPaperBwDouble || newPaperBwSingle || 0),
      color_single: Number(newPaperColorSingle || 0),
      color_double: Number(newPaperColorDouble || newPaperColorSingle || 0),
      enabled: true,
    };

    setForm((prev) => ({
      ...prev,
      custom_papers: [...(prev.custom_papers || []), newPaper],
    }));

    setNewPaperName('');
    setNewPaperBwSingle('');
    setNewPaperBwDouble('');
    setNewPaperColorSingle('');
    setNewPaperColorDouble('');
  };

  const toggleCustomPaper = (paperId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_papers: (prev.custom_papers || []).map((p) =>
        p.id === paperId ? { ...p, enabled: !p.enabled } : p
      ),
    }));
  };

  const handleDeleteCustomPaper = (paperId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_papers: (prev.custom_papers || []).filter((p) => p.id !== paperId),
    }));
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
        showToast('Shop configuration & rates saved! Customer page updated live.', 'success');
      } else {
        throw new Error(data.error || 'Failed to update shop settings');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error saving shop settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <AdminHeader />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm font-semibold">Loading shop settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-28">
      <AdminHeader showSave={true} onSave={handleSave} saving={saving} saveButtonText="Save Settings" />

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

      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Page Title & Save Header Card */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Customize Client Page</h1>
              <p className="text-[11px] text-slate-500 font-medium">Reconfigure customer steps, rates & active options</p>
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
                <span>Save All</span>
              </>
            )}
          </button>
        </div>

        {/* Section 1: Store Branding & Customer Info Controls */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              1. Store Branding & Customer Info
            </h2>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
              Client Header
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Shop Name (Header Title)
              </label>
              <input
                type="text"
                placeholder="e.g. Cyber Cafe"
                value={form.shop_name || ''}
                onChange={(e) => handleChange('shop_name', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-[11px] font-bold text-slate-600">Customer Identification Form Fields:</div>

              {/* Require Name */}
              <label
                onClick={() => toggleFormField('requireCustomerName')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.requireCustomerName !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <User className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Customer Name Field</div>
                    <div className="text-[10px] text-slate-400 font-medium">Require customer to enter full name</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.requireCustomerName !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </label>

              {/* Require Phone */}
              <label
                onClick={() => toggleFormField('requireCustomerPhone')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.requireCustomerPhone !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">WhatsApp / Mobile Number Field</div>
                    <div className="text-[10px] text-slate-400 font-medium">Require mobile number for order pickup</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.requireCustomerPhone !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </label>

              {/* Allow Notes */}
              <label
                onClick={() => toggleFormField('allowCustomerNotes')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.allowCustomerNotes !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Special Instructions / Notes Field</div>
                    <div className="text-[10px] text-slate-400 font-medium">Allow customers to write print notes</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowCustomerNotes !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Section 2: Paper Sizes & Per-Page Rates (Customer Step 1) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              2. Paper Sizes & Per-Page Rates
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 1
            </span>
          </div>

          {/* A4 Paper */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900">📄 A4 Standard Paper</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                <input
                  type="checkbox"
                  checked={form.enabled_papers?.a4 !== false}
                  onChange={() => toggleEnabledPaper('a4')}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>
            </div>

            {form.enabled_papers?.a4 !== false && (
              <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_bw_per_page}
                    onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_bw_double_per_page || 3}
                    onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_color_per_page}
                    onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_color_double_per_page || 18}
                    onChange={(e) => handleChange('a4_color_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* A3 Paper */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-900">📑 A3 Large Paper</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                <input
                  type="checkbox"
                  checked={form.enabled_papers?.a3 !== false}
                  onChange={() => toggleEnabledPaper('a3')}
                  className="w-4 h-4 rounded text-indigo-600"
                />
              </label>
            </div>

            {form.enabled_papers?.a3 !== false && (
              <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">A3 B&W (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a3_bw_per_page}
                    onChange={(e) => handleChange('a3_bw_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">A3 Color (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a3_color_per_page}
                    onChange={(e) => handleChange('a3_color_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Legal & Photo Paper Switches */}
          <div className="grid grid-cols-2 gap-3">
            <label
              onClick={() => toggleEnabledPaper('legal')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                form.enabled_papers?.legal !== false
                  ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">Legal Size Paper</span>
              <input
                type="checkbox"
                checked={form.enabled_papers?.legal !== false}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
              />
            </label>

            <label
              onClick={() => toggleEnabledPaper('photo')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                form.enabled_papers?.photo !== false
                  ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">Glossy Photo Paper</span>
              <input
                type="checkbox"
                checked={form.enabled_papers?.photo !== false}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
              />
            </label>
          </div>

          {/* Custom Paper Sizes */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-3">
            <div className="font-extrabold text-indigo-900 text-xs flex items-center justify-between">
              <span>✨ Custom Paper Sizes</span>
              <span className="text-[10px] text-indigo-600 font-mono font-bold">
                {(form.custom_papers || []).length} Sizes
              </span>
            </div>

            {(form.custom_papers || []).length > 0 && (
              <div className="space-y-2">
                {form.custom_papers!.map((paper) => (
                  <div key={paper.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={paper.enabled}
                        onChange={() => toggleCustomPaper(paper.id)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <span className="font-bold text-slate-900">{paper.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-700">B&W ₹{paper.bw_single}</span>
                      <span className="font-semibold text-indigo-700">Color ₹{paper.color_single}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomPaper(paper.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Paper Form */}
            <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2 text-xs">
              <div className="font-bold text-slate-800 text-[11px]">+ Add Custom Paper Size</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Paper Name (A5)"
                  value={newPaperName}
                  onChange={(e) => setNewPaperName(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                />
                <input
                  type="number"
                  placeholder="B&W (₹/pg)"
                  value={newPaperBwSingle}
                  onChange={(e) => setNewPaperBwSingle(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                />
                <input
                  type="number"
                  placeholder="Color (₹/pg)"
                  value={newPaperColorSingle}
                  onChange={(e) => setNewPaperColorSingle(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomPaper}
                disabled={!newPaperName.trim() || newPaperBwSingle === ''}
                className="w-full py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Paper Option</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 3: Print Options (Customer Step 2) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              3. Color & Duplex Options
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 2
            </span>
          </div>

          <div className="space-y-2">
            <label
              onClick={() => toggleFormField('allowColorPrinting')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                form.form_fields?.allowColorPrinting !== false
                  ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-900">Color Printing Option</div>
                <div className="text-[10px] text-slate-400 font-medium">Turn OFF if color printer is out of ink</div>
              </div>
              <input
                type="checkbox"
                checked={form.form_fields?.allowColorPrinting !== false}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
            </label>

            <label
              onClick={() => toggleFormField('allowDoubleSided')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                form.form_fields?.allowDoubleSided !== false
                  ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-900">Double-Sided (Duplex) Option</div>
                <div className="text-[10px] text-slate-400 font-medium">Turn OFF if printer only supports single-sided</div>
              </div>
              <input
                type="checkbox"
                checked={form.form_fields?.allowDoubleSided !== false}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
            </label>
          </div>
        </section>

        {/* Section 4: Finishing & Add-ons (Customer Step 3) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              4. Finishing & Add-on Services
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 3
            </span>
          </div>

          {/* Standard Finishing Options */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-600">Standard Services:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Spiral Binding */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.spiralBinding !== false}
                    onChange={() => toggleEnabledAddon('spiralBinding')}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-900">Spiral Binding</span>
                </label>
                <input
                  type="number"
                  disabled={form.enabled_addons?.spiralBinding === false}
                  value={form.addon_spiral_binding}
                  onChange={(e) => handleChange('addon_spiral_binding', parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-xs"
                  placeholder="₹30"
                />
              </div>

              {/* Hard Cover Binding */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.hardBinding !== false}
                    onChange={() => toggleEnabledAddon('hardBinding')}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-900">Hard Cover</span>
                </label>
                <input
                  type="number"
                  disabled={form.enabled_addons?.hardBinding === false}
                  value={form.addon_hard_binding}
                  onChange={(e) => handleChange('addon_hard_binding', parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-xs"
                  placeholder="₹120"
                />
              </div>

              {/* Soft Binding */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.softBinding !== false}
                    onChange={() => toggleEnabledAddon('softBinding')}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-900">Soft Cover</span>
                </label>
                <input
                  type="number"
                  disabled={form.enabled_addons?.softBinding === false}
                  value={form.addon_soft_binding}
                  onChange={(e) => handleChange('addon_soft_binding', parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-xs"
                  placeholder="₹40"
                />
              </div>

              {/* Stapling */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.stapling !== false}
                    onChange={() => toggleEnabledAddon('stapling')}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-900">Stapling</span>
                </label>
                <input
                  type="number"
                  disabled={form.enabled_addons?.stapling === false}
                  value={form.addon_stapling}
                  onChange={(e) => handleChange('addon_stapling', parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-xs"
                  placeholder="₹5"
                />
              </div>
            </div>
          </div>

          {/* Custom Options List & Add New Form */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-3">
            <div className="font-extrabold text-indigo-900 text-xs flex items-center justify-between">
              <span>✨ Custom Extra Options</span>
              <span className="text-[10px] text-indigo-600 font-mono font-bold">
                {(form.custom_addons || []).length} Options
              </span>
            </div>

            {(form.custom_addons || []).length > 0 && (
              <div className="space-y-2">
                {form.custom_addons!.map((addon) => (
                  <div key={addon.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addon.enabled}
                        onChange={() => toggleCustomOption(addon.id)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-900">{addon.name}</span>
                        {addon.description && <p className="text-[10px] text-slate-400">{addon.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900">₹{addon.price}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({addon.unit.replace('_', ' ')})</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomOption(addon.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Option Form */}
            <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2 text-xs">
              <div className="font-bold text-slate-800 text-[11px]">+ Add Custom Option / Extra Service</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Option Name (Scan)"
                  value={newAddonName}
                  onChange={(e) => setNewAddonName(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-medium"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={newAddonPrice}
                  onChange={(e) => setNewAddonPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newAddonUnit}
                  onChange={(e) => setNewAddonUnit(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-800"
                >
                  <option value="per_copy">Per Copy / Book</option>
                  <option value="per_page">Per Page</option>
                  <option value="per_order">Flat Fee (Order)</option>
                </select>
                <input
                  type="text"
                  placeholder="Description"
                  value={newAddonDesc}
                  onChange={(e) => setNewAddonDesc(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-900"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomOption}
                disabled={!newAddonName.trim() || newAddonPrice === ''}
                className="w-full py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Extra Option</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 5: Payment & Checkout Options (Customer Step 4) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              5. Payment & Checkout Settings
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 4
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Shopkeeper UPI VPA (ID)</label>
                <input
                  type="text"
                  placeholder="shop@okaxis"
                  value={form.shop_upi_id || ''}
                  onChange={(e) => handleChange('shop_upi_id', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-indigo-700 bg-slate-50/60 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Payee Name</label>
                <input
                  type="text"
                  placeholder="Royal Xerox"
                  value={form.shop_upi_name || ''}
                  onChange={(e) => handleChange('shop_upi_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 bg-slate-50/60 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Min Order Amount (₹)</label>
                <input
                  type="number"
                  placeholder="5"
                  value={form.form_fields?.minOrderAmount || 0}
                  onChange={(e) => handleFormFieldChange('minOrderAmount', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 bg-slate-50/60 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Express / Urgent Fee (₹)</label>
                <input
                  type="number"
                  placeholder="10"
                  value={form.form_fields?.urgentFee || 0}
                  onChange={(e) => handleFormFieldChange('urgentFee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 bg-slate-50/60 focus:bg-white"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label
                onClick={() => toggleFormField('allowUpiPayment')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.allowUpiPayment !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">1-Tap UPI Payment (GPay / PhonePe / Paytm)</div>
                  <div className="text-[10px] text-slate-400 font-medium">Show UPI payment link on customer checkout</div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowUpiPayment !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                />
              </label>

              <label
                onClick={() => toggleFormField('allowCashPayment')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.allowCashPayment !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">Pay Cash at Counter Option</div>
                  <div className="text-[10px] text-slate-400 font-medium">Show counter cash option for walk-in customers</div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowCashPayment !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                />
              </label>

              <label
                onClick={() => toggleFormField('autoApproveUpiOrders')}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  form.form_fields?.autoApproveUpiOrders !== false
                    ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">Auto-Start Printing for UPI Orders</div>
                  <div className="text-[10px] text-slate-400 font-medium">Auto-spool UPI orders to printer without waiting for counter tap</div>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.autoApproveUpiOrders !== false}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Bottom Floating Save Bar */}
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
                <span>Save All Shop Settings & Live Rates</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
