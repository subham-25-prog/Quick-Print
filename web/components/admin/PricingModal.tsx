'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Check, Tag, DollarSign, Smartphone } from '@/components/ui/Icons';
import { PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPricing: PricingConfig;
  onPricingUpdated: (updated: PricingConfig) => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({
  isOpen,
  onClose,
  currentPricing,
  onPricingUpdated,
}) => {
  const [formData, setFormData] = useState<PricingConfig>(currentPricing || defaultPricingConfig);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (currentPricing) {
      setFormData(currentPricing);
    }
  }, [currentPricing, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof PricingConfig, val: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: formData }),
      });
      const data = await res.json();
      if (res.ok && data.pricing) {
        onPricingUpdated(data.pricing);
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
      } else {
        alert(data.error || 'Failed to update pricing');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating pricing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              💰
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Edit Shop Pricing & Rates</h3>
              <p className="text-xs text-slate-400 font-medium">Changes apply immediately to all new customer orders</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Section 1: Shop Identity & UPI */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1.5">
              <span>🏪</span>
              <span>Shop Identity & UPI Receiver</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Shop Name</label>
                <input
                  type="text"
                  value={formData.shop_name || ''}
                  onChange={(e) => handleChange('shop_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. QuickPrint Copy Center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Shop Phone Number</label>
                <input
                  type="text"
                  value={formData.shop_phone || ''}
                  onChange={(e) => handleChange('shop_phone', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Shopkeeper UPI ID (VPA)</label>
                <input
                  type="text"
                  value={formData.shop_upi_id || ''}
                  onChange={(e) => handleChange('shop_upi_id', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-indigo-700 focus:border-indigo-500 focus:outline-none"
                  placeholder="quickprint@upi"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">UPI Payee Name</label>
                <input
                  type="text"
                  value={formData.shop_upi_name || ''}
                  onChange={(e) => handleChange('shop_upi_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  placeholder="Shopkeeper Full Name"
                />
              </div>
            </div>
          </div>

          {/* Section 2: A4 Paper Printing Rates */}
          <div className="space-y-3 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200">
            <h4 className="text-xs font-black uppercase text-indigo-700 tracking-wider flex items-center gap-1.5">
              <span>📄</span>
              <span>A4 Paper Printing Rates (per page)</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">A4 B&W Single</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.a4_bw_per_page ?? 2}
                    onChange={(e) => handleChange('a4_bw_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">A4 B&W Duplex</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.a4_bw_double_per_page ?? 3.5}
                    onChange={(e) => handleChange('a4_bw_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">A4 Color Single</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.a4_color_per_page ?? 10}
                    onChange={(e) => handleChange('a4_color_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">A4 Color Duplex</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.a4_color_double_per_page ?? 18}
                    onChange={(e) => handleChange('a4_color_double_per_page', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Add-on Finishing Services */}
          <div className="space-y-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200">
            <h4 className="text-xs font-black uppercase text-emerald-700 tracking-wider flex items-center gap-1.5">
              <span>📚</span>
              <span>Add-on Finishing Services</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">Spiral Binding (coil)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.addon_spiral_binding ?? 30}
                    onChange={(e) => handleChange('addon_spiral_binding', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">Hard Cover Binding</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.addon_hard_binding ?? 120}
                    onChange={(e) => handleChange('addon_hard_binding', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">Soft Cover Binding</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.addon_soft_binding ?? 40}
                    onChange={(e) => handleChange('addon_soft_binding', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : success ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? 'Saving...' : success ? 'Saved!' : 'Save Pricing Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
