'use client';

import React, { useState, useEffect } from 'react';
import { PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { X, CheckCircle2, Save, Tag, RefreshCw, Layers, CreditCard, FileText } from '@/components/ui/Icons';

interface EditPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPricing?: PricingConfig;
  onPricingUpdated: (updated: PricingConfig) => void;
}

export const EditPricingModal: React.FC<EditPricingModalProps> = ({
  isOpen,
  onClose,
  currentPricing,
  onPricingUpdated,
}) => {
  const [form, setForm] = useState<PricingConfig>(currentPricing || defaultPricingConfig);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'paper' | 'features' | 'addons' | 'payment'>('paper');

  useEffect(() => {
    if (currentPricing) {
      setForm(currentPricing);
    }
  }, [currentPricing, isOpen]);

  if (!isOpen) return null;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: form }),
      });

      const data = await res.json();
      if (res.ok && data.pricing) {
        onPricingUpdated(data.pricing);
        setNotice('Shop customization & rates saved! Customer page updated live.');
        setTimeout(() => {
          setNotice(null);
          onClose();
        }, 1200);
      } else {
        throw new Error(data.error || 'Failed to update shop settings');
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error saving shop settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Customize Shop Options & Rates</h3>
              <p className="text-[11px] text-slate-500 font-medium">Turn services ON/OFF & set prices for customer page</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('paper')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all ${
              activeTab === 'paper' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📄 Paper Sizes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all ${
              activeTab === 'features' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎨 Print Features
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addons')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all ${
              activeTab === 'addons' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📚 Add-ons
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payment')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all ${
              activeTab === 'payment' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💳 Payment
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
          {/* TAB 1: Paper Sizes & Rates */}
          {activeTab === 'paper' && (
            <div className="space-y-4">
              {/* A4 Paper */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>📄 A4 Paper</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="text-[11px] font-bold text-slate-600">Available in Shop</span>
                    <input
                      type="checkbox"
                      checked={form.enabled_papers?.a4 !== false}
                      onChange={() => toggleEnabledPaper('a4')}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                </div>

                {form.enabled_papers?.a4 !== false && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">B&W Single-Sided (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a4_bw_per_page}
                        onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">B&W Duplex (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a4_bw_double_per_page || 3}
                        onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Color Single-Sided (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a4_color_per_page}
                        onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Color Duplex (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a4_color_double_per_page || 18}
                        onChange={(e) => handleChange('a4_color_double_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* A3 Paper */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>📑 A3 Large Paper</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="text-[11px] font-bold text-slate-600">Available in Shop</span>
                    <input
                      type="checkbox"
                      checked={form.enabled_papers?.a3 !== false}
                      onChange={() => toggleEnabledPaper('a3')}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                </div>

                {form.enabled_papers?.a3 !== false && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">A3 B&W (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a3_bw_per_page}
                        onChange={(e) => handleChange('a3_bw_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">A3 Color (₹/pg)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={form.a3_color_per_page}
                        onChange={(e) => handleChange('a3_color_per_page', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Legal & Photo Paper */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Legal Size Paper</span>
                    <input
                      type="checkbox"
                      checked={form.enabled_papers?.legal !== false}
                      onChange={() => toggleEnabledPaper('legal')}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Glossy Photo Paper</span>
                    <input
                      type="checkbox"
                      checked={form.enabled_papers?.photo !== false}
                      onChange={() => toggleEnabledPaper('photo')}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Print Features (Color/Duplex Controls) */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                  <span>⚙️ Customer Print Controls</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 text-xs">Allow Color Printing</span>
                      <p className="text-[10px] text-slate-500 font-medium">Turn OFF if color printer is empty or undergoing maintenance</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.form_fields?.allowColorPrinting !== false}
                      onChange={() => toggleFormField('allowColorPrinting')}
                      className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 text-xs">Allow Double-Sided (Duplex)</span>
                      <p className="text-[10px] text-slate-500 font-medium">Turn OFF if shop printer only supports single-sided printing</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.form_fields?.allowDoubleSided !== false}
                      onChange={() => toggleFormField('allowDoubleSided')}
                      className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Binding & Add-ons */}
          {activeTab === 'addons' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                  <span>📚 Binding & Finishing Services</span>
                </div>

                <div className="space-y-3">
                  {/* Spiral Binding */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.enabled_addons?.spiralBinding !== false}
                        onChange={() => toggleEnabledAddon('spiralBinding')}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800">Spiral Binding</span>
                        <p className="text-[10px] text-slate-400">Plastic coil binding</p>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        disabled={form.enabled_addons?.spiralBinding === false}
                        value={form.addon_spiral_binding}
                        onChange={(e) => handleChange('addon_spiral_binding', parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-bold text-slate-900"
                        placeholder="₹30"
                      />
                    </div>
                  </div>

                  {/* Hard Cover Binding */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.enabled_addons?.hardBinding !== false}
                        onChange={() => toggleEnabledAddon('hardBinding')}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800">Hard Cover Binding</span>
                        <p className="text-[10px] text-slate-400">Project / thesis book binding</p>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        disabled={form.enabled_addons?.hardBinding === false}
                        value={form.addon_hard_binding}
                        onChange={(e) => handleChange('addon_hard_binding', parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-bold text-slate-900"
                        placeholder="₹120"
                      />
                    </div>
                  </div>

                  {/* Soft Binding */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.enabled_addons?.softBinding !== false}
                        onChange={() => toggleEnabledAddon('softBinding')}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800">Soft Cover Binding</span>
                        <p className="text-[10px] text-slate-400">Paperback style binding</p>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        disabled={form.enabled_addons?.softBinding === false}
                        value={form.addon_soft_binding}
                        onChange={(e) => handleChange('addon_soft_binding', parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-bold text-slate-900"
                        placeholder="₹40"
                      />
                    </div>
                  </div>

                  {/* Stapling */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.enabled_addons?.stapling !== false}
                        onChange={() => toggleEnabledAddon('stapling')}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800">Stapling</span>
                        <p className="text-[10px] text-slate-400">Corner staple</p>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        disabled={form.enabled_addons?.stapling === false}
                        value={form.addon_stapling}
                        onChange={(e) => handleChange('addon_stapling', parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-bold text-slate-900"
                        placeholder="₹5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Payment Methods & Auto-Approve */}
          {activeTab === 'payment' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4">
                <div className="font-extrabold text-indigo-900 text-xs flex items-center gap-1.5">
                  <span>⚡ Payment Options & UPI VPA</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Shop UPI VPA (ID)</label>
                    <input
                      type="text"
                      placeholder="e.g. shop@okaxis"
                      value={form.shop_upi_id || ''}
                      onChange={(e) => handleChange('shop_upi_id', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold text-indigo-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Payee Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Royal Xerox"
                      value={form.shop_upi_name || ''}
                      onChange={(e) => handleChange('shop_upi_name', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-indigo-100">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-indigo-100">
                    <span className="font-bold text-slate-800">Allow UPI Mobile Payment</span>
                    <input
                      type="checkbox"
                      checked={form.form_fields?.allowUpiPayment !== false}
                      onChange={() => toggleFormField('allowUpiPayment')}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-indigo-100">
                    <span className="font-bold text-slate-800">Allow Cash at Counter</span>
                    <input
                      type="checkbox"
                      checked={form.form_fields?.allowCashPayment !== false}
                      onChange={() => toggleFormField('allowCashPayment')}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-indigo-100">
                    <div>
                      <span className="font-bold text-slate-900 text-xs">Auto-Start Printing for UPI</span>
                      <p className="text-[10px] text-slate-500">Automatically send UPI orders to printer without waiting for counter tap</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.form_fields?.autoApproveUpiOrders !== false}
                      onChange={() => toggleFormField('autoApproveUpiOrders')}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
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
        </form>
      </div>
    </div>
  );
};
