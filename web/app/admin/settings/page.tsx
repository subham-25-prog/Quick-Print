'use client';

import { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { PricingConfig, CustomAddon, CustomPaperType } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { useInitialPricing } from '@/lib/initial-pricing';
import { publishShopNameUpdate } from '@/lib/shop-sync';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Plus,
  Trash2,
  X,
  User,
  Phone,
  MessageSquare
} from '@/components/ui/Icons';

export default function AdminSettingsPage() {
  const [form, setForm] = useState<PricingConfig>(useInitialPricing());
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
  const [showAddPaperForm, setShowAddPaperForm] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) {
          if (!data.pricing.shop_name || /quickprint/i.test(data.pricing.shop_name)) {
            data.pricing.shop_name = defaultPricingConfig.shop_name;
          }
          setForm(data.pricing);
        }
      })
      .catch((err) => console.error('Failed to initialize settings:', err))
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

  const toggleFormField = (fieldKey: keyof NonNullable<PricingConfig['form_fields']>, defaultValue = true) => {
    setForm((prev) => {
      const currentVal = prev.form_fields?.[fieldKey] ?? defaultValue;
      return {
        ...prev,
        form_fields: {
          ...(prev.form_fields || defaultPricingConfig.form_fields),
          [fieldKey]: !currentVal,
        },
      };
    });
  };

  const setFormFieldValue = (fieldKey: keyof NonNullable<PricingConfig['form_fields']>, value: any) => {
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
      bw_double: Number(newPaperBwDouble !== '' ? newPaperBwDouble : newPaperBwSingle || 0),
      color_single: Number(newPaperColorSingle || 0),
      color_double: Number(newPaperColorDouble !== '' ? newPaperColorDouble : newPaperColorSingle || 0),
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
    setShowAddPaperForm(false);
    showToast(`Added page specification "${newPaper.name}"`, 'success');
  };

  const updateCustomPaperRate = (
    paperId: string,
    field: 'bw_single' | 'bw_double' | 'color_single' | 'color_double',
    val: number
  ) => {
    setForm((prev) => ({
      ...prev,
      custom_papers: (prev.custom_papers || []).map((p) =>
        p.id === paperId ? { ...p, [field]: Math.max(0, val) } : p
      ),
    }));
  };

  const handlePhotoRateChange = (
    field: 'photo_bw_per_page' | 'photo_bw_double_per_page' | 'photo_color_per_page' | 'photo_color_double_per_page',
    val: number
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: val,
      ...(field === 'photo_color_per_page' ? { photo_paper_per_page: val } : {}),
    }));
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
    showToast('Removed custom page specification', 'success');
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
        publishShopNameUpdate(data.pricing.shop_name || form.shop_name, data.pricing);
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
        <AdminHeader shopName={form.shop_name} />
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
      <AdminHeader shopName={form.shop_name} />

      {/* Floating Action Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
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

        {/* Section 1: Store Branding */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              1. Store Branding
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
          </div>
        </section>

        {/* Section 2: Paper Sizes & Per-Page Rates (Customer Step 1) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                2. Paper Sizes & Per-Page Rates
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Configure rates and enable or disable specific page specifications.
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 1
            </span>
          </div>

          <div className="space-y-3.5">
            {/* A4 Paper */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>📄 A4 Standard Paper</span>
                  <span className="text-[10px] text-slate-400 font-normal">(210×297 mm)</span>
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                  <input
                    type="checkbox"
                    checked={form.enabled_papers?.a4 !== false}
                    onChange={() => toggleEnabledPaper('a4')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </label>
              </div>

              {form.enabled_papers?.a4 !== false && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a4_bw_per_page}
                      onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a4_bw_double_per_page ?? 3}
                      onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a4_color_per_page}
                      onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a4_color_double_per_page ?? 18}
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
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>📑 A3 Large Paper</span>
                  <span className="text-[10px] text-slate-400 font-normal">(297×420 mm)</span>
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                  <input
                    type="checkbox"
                    checked={form.enabled_papers?.a3 !== false}
                    onChange={() => toggleEnabledPaper('a3')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </label>
              </div>

              {form.enabled_papers?.a3 !== false && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a3_bw_per_page}
                      onChange={(e) => handleChange('a3_bw_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a3_bw_double_per_page ?? 8}
                      onChange={(e) => handleChange('a3_bw_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a3_color_per_page}
                      onChange={(e) => handleChange('a3_color_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.a3_color_double_per_page ?? 35}
                      onChange={(e) => handleChange('a3_color_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Legal Paper */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>⚖️ Legal Size Paper</span>
                  <span className="text-[10px] text-slate-400 font-normal">(216×356 mm)</span>
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                  <input
                    type="checkbox"
                    checked={form.enabled_papers?.legal !== false}
                    onChange={() => toggleEnabledPaper('legal')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </label>
              </div>

              {form.enabled_papers?.legal !== false && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.legal_bw_per_page ?? 3}
                      onChange={(e) => handleChange('legal_bw_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.legal_bw_double_per_page ?? 5}
                      onChange={(e) => handleChange('legal_bw_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.legal_color_per_page ?? 12}
                      onChange={(e) => handleChange('legal_color_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.legal_color_double_per_page ?? 22}
                      onChange={(e) => handleChange('legal_color_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Photo Paper */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <span>🖼️ Glossy Photo Paper</span>
                  <span className="text-[10px] text-slate-400 font-normal">(240 GSM Glossy)</span>
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                  <input
                    type="checkbox"
                    checked={form.enabled_papers?.photo !== false}
                    onChange={() => toggleEnabledPaper('photo')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </label>
              </div>

              {form.enabled_papers?.photo !== false && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-slate-200/60 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.photo_bw_per_page ?? 15}
                      onChange={(e) => handlePhotoRateChange('photo_bw_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.photo_bw_double_per_page ?? 25}
                      onChange={(e) => handlePhotoRateChange('photo_bw_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.photo_color_per_page ?? form.photo_paper_per_page ?? 25}
                      onChange={(e) => handlePhotoRateChange('photo_color_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.photo_color_double_per_page ?? 45}
                      onChange={(e) => handlePhotoRateChange('photo_color_double_per_page', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Custom Paper Sizes / Other Page Specifications */}
            {(form.custom_papers || []).map((paper) => (
              <div key={paper.id} className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900">✨ {paper.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomPaper(paper.id)}
                      title="Delete this page specification"
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span className="text-[11px] font-bold text-slate-600">Enabled</span>
                    <input
                      type="checkbox"
                      checked={paper.enabled}
                      onChange={() => toggleCustomPaper(paper.id)}
                      className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                    />
                  </label>
                </div>

                {paper.enabled && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-indigo-100 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={paper.bw_single}
                        onChange={(e) => updateCustomPaperRate(paper.id, 'bw_single', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={paper.bw_double}
                        onChange={(e) => updateCustomPaperRate(paper.id, 'bw_double', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={paper.color_single}
                        onChange={(e) => updateCustomPaperRate(paper.id, 'color_single', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={paper.color_double}
                        onChange={(e) => updateCustomPaperRate(paper.id, 'color_double', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Other Page Specification Button & Form */}
          <div className="pt-2 border-t border-slate-100">
            {!showAddPaperForm ? (
              <button
                type="button"
                onClick={() => setShowAddPaperForm(true)}
                className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/80 text-indigo-700 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Other Page Specification</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl border-2 border-indigo-300 bg-white shadow-xs space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    <span>Add Other Page Specification</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddPaperForm(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Page Specification / Paper Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A5 Pocket Size, Letter, Certificate Bond Paper"
                    value={newPaperName}
                    onChange={(e) => setNewPaperName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 2.0"
                      value={newPaperBwSingle}
                      onChange={(e) => setNewPaperBwSingle(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">B&W Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 3.0"
                      value={newPaperBwDouble}
                      onChange={(e) => setNewPaperBwDouble(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Single (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 10.0"
                      value={newPaperColorSingle}
                      onChange={(e) => setNewPaperColorSingle(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Color Duplex (₹/pg)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="e.g. 18.0"
                      value={newPaperColorDouble}
                      onChange={(e) => setNewPaperColorDouble(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddPaperForm(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomPaper}
                    disabled={!newPaperName.trim() || newPaperBwSingle === ''}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Page Specification</span>
                  </button>
                </div>
              </div>
            )}
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

        {/* Section 5: Customer Identification (Customer Step 4) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                5. Customer Identification
              </h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Enable or disable customer input fields and set whether they are mandatory or optional
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 4
            </span>
          </div>

          <div className="space-y-3">
            {/* Customer Name Field */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                form.form_fields?.showCustomerName !== false
                  ? 'border-indigo-200 bg-indigo-50/20'
                  : 'border-slate-200 bg-slate-50/40 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      form.form_fields?.showCustomerName !== false
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>Customer Name Field</span>
                      {form.form_fields?.showCustomerName !== false && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            form.form_fields?.requireCustomerName !== false
                              ? 'bg-rose-50 text-rose-600 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          }`}
                        >
                          {form.form_fields?.requireCustomerName !== false ? 'Mandatory *' : 'Optional'}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Collect customer full name on order upload
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFormField('showCustomerName', true)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    form.form_fields?.showCustomerName !== false
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {form.form_fields?.showCustomerName !== false ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {form.form_fields?.showCustomerName !== false && (
                <div className="mt-3 pt-3 border-t border-indigo-100/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-bold text-slate-600">Requirement Status:</span>
                  <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setFormFieldValue('requireCustomerName', true)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        form.form_fields?.requireCustomerName !== false
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Mandatory *
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormFieldValue('requireCustomerName', false)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        form.form_fields?.requireCustomerName === false
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Optional
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Phone Field */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                form.form_fields?.showCustomerPhone
                  ? 'border-indigo-200 bg-indigo-50/20'
                  : 'border-slate-200 bg-slate-50/40 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      form.form_fields?.showCustomerPhone
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>WhatsApp / Mobile Number</span>
                      {Boolean(form.form_fields?.showCustomerPhone) && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            form.form_fields?.requireCustomerPhone
                              ? 'bg-rose-50 text-rose-600 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          }`}
                        >
                          {form.form_fields?.requireCustomerPhone ? 'Mandatory *' : 'Optional'}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Collect mobile number for customer order identification
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFormField('showCustomerPhone', false)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    form.form_fields?.showCustomerPhone
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {form.form_fields?.showCustomerPhone ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {Boolean(form.form_fields?.showCustomerPhone) && (
                <div className="mt-3 pt-3 border-t border-indigo-100/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-bold text-slate-600">Requirement Status:</span>
                  <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setFormFieldValue('requireCustomerPhone', true)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        form.form_fields?.requireCustomerPhone
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Mandatory *
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormFieldValue('requireCustomerPhone', false)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        !form.form_fields?.requireCustomerPhone
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Optional
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Special Instructions / Notes Field */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                form.form_fields?.allowCustomerNotes !== false
                  ? 'border-indigo-200 bg-indigo-50/20'
                  : 'border-slate-200 bg-slate-50/40 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      form.form_fields?.allowCustomerNotes !== false
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>Special Instructions / Notes</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Optional
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Allow customers to leave custom notes or instructions for printing
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFormField('allowCustomerNotes', true)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    form.form_fields?.allowCustomerNotes !== false
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {form.form_fields?.allowCustomerNotes !== false ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Payment & Checkout Options (Customer Step 5) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">
              6. Payment & Checkout Options
            </h2>
            <span className="text-[10px] font-bold text-slate-400">
              Customer Step 5
            </span>
          </div>

          <div className="space-y-2">
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
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
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
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
            </label>
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

        {/* Developer Attribution */}
        <DeveloperBadge className="pt-6 pb-2" />
      </main>
    </div>
  );
}
