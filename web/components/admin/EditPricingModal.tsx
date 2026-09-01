'use client';

import React, { useState, useEffect } from 'react';
import { PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { X, CheckCircle2, Save, Tag, RefreshCw } from '@/components/ui/Icons';

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
        setNotice('Pricing updated successfully! Rates are live.');
        setTimeout(() => {
          setNotice(null);
          onClose();
        }, 1200);
      } else {
        throw new Error(data.error || 'Failed to update pricing');
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error saving pricing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Edit Shop Rates & Pricing</h3>
              <p className="text-[11px] text-slate-500 font-medium">Changes apply immediately to future orders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Section 1: A4 Paper Rates */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="font-extrabold text-slate-800 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <span>📄</span>
              <span>A4 Paper Printing Rates (₹ per page)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1">B&W Single-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.a4_bw_per_page}
                  onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">B&W Back-to-Back</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.a4_bw_double_per_page || 3}
                  onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Color Single-Sided</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.a4_color_per_page}
                  onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Color Back-to-Back</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.a4_color_double_per_page || 18}
                  onChange={(e) => handleChange('a4_color_double_per_page', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Add-on Binding & Finishing Rates */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="font-extrabold text-slate-800 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <span>📚</span>
              <span>Binding & Add-on Rates (₹ per copy)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Spiral Binding</label>
                <input
                  type="number"
                  step="1"
                  value={form.addon_spiral_binding}
                  onChange={(e) => handleChange('addon_spiral_binding', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Hard Cover Binding</label>
                <input
                  type="number"
                  step="1"
                  value={form.addon_hard_binding}
                  onChange={(e) => handleChange('addon_hard_binding', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Soft Cover Binding</label>
                <input
                  type="number"
                  step="1"
                  value={form.addon_soft_binding}
                  onChange={(e) => handleChange('addon_soft_binding', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Stapling Rate</label>
                <input
                  type="number"
                  step="1"
                  value={form.addon_stapling}
                  onChange={(e) => handleChange('addon_stapling', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Shopkeeper UPI Details */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
            <div className="font-extrabold text-indigo-900 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <span>⚡</span>
              <span>Shopkeeper UPI Details</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1">UPI VPA (ID)</label>
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
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
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
                  <span>Saving Rates...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Pricing Settings</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
