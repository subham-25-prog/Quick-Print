'use client';

import React, { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { PricingConfig, CustomAddon } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
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
  Settings,
  Tag,
} from '@/components/ui/Icons';

export default function AdminSettingsPage() {
  const [form, setForm] = useState<PricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Custom Addon Form State
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState<number | ''>('');
  const [newAddonUnit, setNewAddonUnit] = useState<'per_copy' | 'per_page' | 'per_order'>('per_copy');
  const [newAddonDesc, setNewAddonDesc] = useState('');

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

  // Toggle Custom Option
  const toggleCustomOption = (addonId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_addons: (prev.custom_addons || []).map((a) =>
        a.id === addonId ? { ...a, enabled: !a.enabled } : a
      ),
    }));
  };

  // Delete Custom Option
  const handleDeleteCustomOption = (addonId: string) => {
    setForm((prev) => ({
      ...prev,
      custom_addons: (prev.custom_addons || []).filter((a) => a.id !== addonId),
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
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col font-sans pb-24">
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

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 flex-1 w-full space-y-6">
        {/* Page Title Header */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Shop Customization & Rates</h1>
              <p className="text-xs text-slate-500 font-medium">
                Control active paper sizes, printing options, custom add-on services, & rates
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Settings</span>
              </>
            )}
          </button>
        </div>

        {/* Section 1: Paper Sizes & Per-Page Rates */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📄</span>
              <h2 className="text-base font-extrabold text-slate-900">1. Paper Sizes & Per-Page Rates</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Enable stock & set rates in ₹</span>
          </div>

          {/* A4 Paper */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-xs">A4 Paper (Standard)</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-xs font-bold text-slate-600">Available in Shop</span>
                <input
                  type="checkbox"
                  checked={form.enabled_papers?.a4 !== false}
                  onChange={() => toggleEnabledPaper('a4')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </label>
            </div>

            {form.enabled_papers?.a4 !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">B&W Single-Sided (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_bw_per_page}
                    onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">B&W Duplex (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_bw_double_per_page || 3}
                    onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">Color Single-Sided (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_color_per_page}
                    onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">Color Duplex (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a4_color_double_per_page || 18}
                    onChange={(e) => handleChange('a4_color_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* A3 Paper */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-xs">A3 Paper (Large Format)</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-xs font-bold text-slate-600">Available in Shop</span>
                <input
                  type="checkbox"
                  checked={form.enabled_papers?.a3 !== false}
                  onChange={() => toggleEnabledPaper('a3')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </label>
            </div>

            {form.enabled_papers?.a3 !== false && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">A3 B&W (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a3_bw_per_page}
                    onChange={(e) => handleChange('a3_bw_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">A3 Color (₹/pg)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.a3_color_per_page}
                    onChange={(e) => handleChange('a3_color_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Legal & Photo */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">Legal Size Paper</span>
              <input
                type="checkbox"
                checked={form.enabled_papers?.legal !== false}
                onChange={() => toggleEnabledPaper('legal')}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">Glossy Photo Paper</span>
              <input
                type="checkbox"
                checked={form.enabled_papers?.photo !== false}
                onChange={() => toggleEnabledPaper('photo')}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Customer Print Controls */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎨</span>
              <h2 className="text-base font-extrabold text-slate-900">2. Customer Print Controls</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Turn OFF unavailable printing features</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 text-xs">Allow Color Printing</span>
                <p className="text-[11px] text-slate-500 font-medium">Turn OFF if color printer is empty or undergoing maintenance</p>
              </div>
              <input
                type="checkbox"
                checked={form.form_fields?.allowColorPrinting !== false}
                onChange={() => toggleFormField('allowColorPrinting')}
                className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 text-xs">Allow Double-Sided (Duplex) Printing</span>
                <p className="text-[11px] text-slate-500 font-medium">Turn OFF if printer only supports single-sided printing</p>
              </div>
              <input
                type="checkbox"
                checked={form.form_fields?.allowDoubleSided !== false}
                onChange={() => toggleFormField('allowDoubleSided')}
                className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Add-on Services & Custom Extra Options */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📚</span>
              <h2 className="text-base font-extrabold text-slate-900">3. Binding, Finishing & Custom Options</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Standard & custom shop services</span>
          </div>

          {/* Standard Finishing Services */}
          <div className="space-y-3">
            <div className="font-extrabold text-slate-800 text-xs">Standard Finishing Services</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Spiral Binding */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.spiralBinding !== false}
                    onChange={() => toggleEnabledAddon('spiralBinding')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs">Spiral Binding</span>
                    <p className="text-[10px] text-slate-400">Plastic coil binding</p>
                  </div>
                </div>
                <input
                  type="number"
                  disabled={form.enabled_addons?.spiralBinding === false}
                  value={form.addon_spiral_binding}
                  onChange={(e) => handleChange('addon_spiral_binding', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-slate-900 text-xs"
                  placeholder="₹30"
                />
              </div>

              {/* Hard Cover Binding */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.hardBinding !== false}
                    onChange={() => toggleEnabledAddon('hardBinding')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs">Hard Cover Binding</span>
                    <p className="text-[10px] text-slate-400">Project / thesis book</p>
                  </div>
                </div>
                <input
                  type="number"
                  disabled={form.enabled_addons?.hardBinding === false}
                  value={form.addon_hard_binding}
                  onChange={(e) => handleChange('addon_hard_binding', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-slate-900 text-xs"
                  placeholder="₹120"
                />
              </div>

              {/* Soft Binding */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.softBinding !== false}
                    onChange={() => toggleEnabledAddon('softBinding')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs">Soft Cover Binding</span>
                    <p className="text-[10px] text-slate-400">Paperback binding</p>
                  </div>
                </div>
                <input
                  type="number"
                  disabled={form.enabled_addons?.softBinding === false}
                  value={form.addon_soft_binding}
                  onChange={(e) => handleChange('addon_soft_binding', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-slate-900 text-xs"
                  placeholder="₹40"
                />
              </div>

              {/* Stapling */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.enabled_addons?.stapling !== false}
                    onChange={() => toggleEnabledAddon('stapling')}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs">Stapling</span>
                    <p className="text-[10px] text-slate-400">Corner staple</p>
                  </div>
                </div>
                <input
                  type="number"
                  disabled={form.enabled_addons?.stapling === false}
                  value={form.addon_stapling}
                  onChange={(e) => handleChange('addon_stapling', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold text-slate-900 text-xs"
                  placeholder="₹5"
                />
              </div>
            </div>
          </div>

          {/* Custom Options List & Add New Form */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-3">
            <div className="font-extrabold text-indigo-900 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>✨ Custom Options & Extra Services</span>
              </span>
              <span className="text-[10px] text-indigo-600 font-bold font-mono">
                {(form.custom_addons || []).length} Active
              </span>
            </div>

            {/* List */}
            {(form.custom_addons || []).length > 0 ? (
              <div className="space-y-2">
                {form.custom_addons!.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={addon.enabled}
                        onChange={() => toggleCustomOption(addon.id)}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-slate-900 text-xs">{addon.name}</span>
                        {addon.description && (
                          <p className="text-[10px] text-slate-400">{addon.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-black text-slate-900 text-xs">₹{addon.price}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({addon.unit.replace('_', ' ')})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomOption(addon.id)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete custom option"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic text-center py-2">
                No custom extra options added yet. Add custom options below!
              </p>
            )}

            {/* Add New Form */}
            <div className="p-3.5 rounded-xl bg-white border border-indigo-200 space-y-3">
              <div className="font-extrabold text-slate-800 text-xs">+ Add New Custom Option</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder="Option Name (e.g. Document Scanning, ID Cover)"
                  value={newAddonName}
                  onChange={(e) => setNewAddonName(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={newAddonPrice}
                  onChange={(e) => setNewAddonPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={newAddonUnit}
                  onChange={(e) => setNewAddonUnit(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                >
                  <option value="per_copy">Per Copy / Book</option>
                  <option value="per_page">Per Page</option>
                  <option value="per_order">Flat Fee (Per Order)</option>
                </select>
                <input
                  type="text"
                  placeholder="Description (Optional)"
                  value={newAddonDesc}
                  onChange={(e) => setNewAddonDesc(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomOption}
                disabled={!newAddonName.trim() || newAddonPrice === ''}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Option to Shop</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 4: Shop Print Configuration */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h2 className="text-base font-extrabold text-slate-900">4. Shop Print Configuration</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Banners, Order Limits & Form Controls</span>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1 text-xs">Shop Name (Displayed on Customer Page)</label>
              <input
                type="text"
                placeholder="e.g. Subham Cyber Cafe"
                value={form.shop_name || ''}
                onChange={(e) => handleChange('shop_name', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 text-xs">
                Customer Announcement Banner Text (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Lunch break 1:30 PM - 2:00 PM. Prints submitted now will be spooled right after!"
                value={form.form_fields?.announcementText || ''}
                onChange={(e) => handleFormFieldChange('announcementText', e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1 text-xs">Minimum Order Total (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  value={form.form_fields?.minOrderAmount || 0}
                  onChange={(e) => handleFormFieldChange('minOrderAmount', parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1 text-xs">Urgent / Express Fee (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 10"
                  value={form.form_fields?.urgentFee || 0}
                  onChange={(e) => handleFormFieldChange('urgentFee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 text-xs">Require Customer Name</span>
                <input
                  type="checkbox"
                  checked={form.form_fields?.requireCustomerName !== false}
                  onChange={() => toggleFormField('requireCustomerName')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 text-xs">Require Customer Phone Number</span>
                <input
                  type="checkbox"
                  checked={form.form_fields?.requireCustomerPhone !== false}
                  onChange={() => toggleFormField('requireCustomerPhone')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 text-xs">Allow Customer Notes / Special Instructions</span>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowCustomerNotes !== false}
                  onChange={() => toggleFormField('allowCustomerNotes')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Payment Methods & UPI VPA */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">💳</span>
              <h2 className="text-base font-extrabold text-slate-900">5. Payment Options & UPI Details</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Counter cash & mobile UPI settings</span>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1 text-xs">Shopkeeper UPI VPA (ID)</label>
                <input
                  type="text"
                  placeholder="e.g. shop@okaxis"
                  value={form.shop_upi_id || ''}
                  onChange={(e) => handleChange('shop_upi_id', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-mono font-bold text-indigo-700 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1 text-xs">Payee Name</label>
                <input
                  type="text"
                  placeholder="e.g. Royal Xerox"
                  value={form.shop_upi_name || ''}
                  onChange={(e) => handleChange('shop_upi_name', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-indigo-100">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-indigo-100">
                <span className="font-bold text-slate-800 text-xs">Allow UPI Mobile Payment</span>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowUpiPayment !== false}
                  onChange={() => toggleFormField('allowUpiPayment')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-indigo-100">
                <span className="font-bold text-slate-800 text-xs">Allow Cash at Counter</span>
                <input
                  type="checkbox"
                  checked={form.form_fields?.allowCashPayment !== false}
                  onChange={() => toggleFormField('allowCashPayment')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-indigo-100">
                <div>
                  <span className="font-bold text-slate-900 text-xs">Auto-Start Printing for UPI</span>
                  <p className="text-[10px] text-slate-500 font-medium">Automatically send UPI orders to printer without waiting for counter tap</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.form_fields?.autoApproveUpiOrders !== false}
                  onChange={() => toggleFormField('autoApproveUpiOrders')}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Save Action */}
        <div className="flex items-center justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving All Settings...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save All Shop Settings & Rates</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
