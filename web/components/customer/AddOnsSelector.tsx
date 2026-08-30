'use client';

import React from 'react';
import { AddOnOptions, PricingConfig } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Sparkles } from '@/components/ui/Icons';

interface AddOnsSelectorProps {
  addOns: AddOnOptions;
  onAddOnsChange: (val: AddOnOptions) => void;
  pricing: PricingConfig;
}

export const AddOnsSelector: React.FC<AddOnsSelectorProps> = ({
  addOns,
  onAddOnsChange,
  pricing,
}) => {
  const enabledAddons = {
    stapling: true,
    spiralBinding: true,
    lamination: true,
    hardBinding: true,
    softBinding: false,
    ...(pricing?.enabled_addons || {}),
  };
  const customAddons = (pricing?.custom_addons || []).filter((a) => a.enabled);

  const toggleStandardAddon = (key: keyof AddOnOptions) => {
    onAddOnsChange({
      ...addOns,
      [key]: !addOns[key],
    });
  };

  const toggleCustomAddon = (addonId: string) => {
    const currentCustom = { ...(addOns.customAddons || {}) };
    currentCustom[addonId] = !currentCustom[addonId];
    onAddOnsChange({
      ...addOns,
      customAddons: currentCustom,
    });
  };

  const hasAnyAddons =
    enabledAddons.spiralBinding !== false ||
    enabledAddons.hardBinding !== false ||
    enabledAddons.softBinding === true ||
    enabledAddons.stapling !== false ||
    enabledAddons.lamination !== false ||
    customAddons.length > 0;

  if (!hasAnyAddons) {
    return (
      <div className="text-center py-4 px-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
        No extra finishing services active for this store.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 1. Spiral Binding */}
      {enabledAddons.spiralBinding !== false && (
        <label
          onClick={() => toggleStandardAddon('spiralBinding')}
          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
            addOns.spiralBinding
              ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.spiralBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Spiral Binding (Plastic Coil)</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Plastic coil binding with transparent cover
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-800">
            +{formatCurrency(pricing.addon_spiral_binding || 30)}
          </div>
        </label>
      )}

      {/* 2. Hard Cover Book Binding */}
      {enabledAddons.hardBinding !== false && (
        <label
          onClick={() => toggleStandardAddon('hardBinding')}
          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
            addOns.hardBinding
              ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.hardBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Hard Cover Book Binding</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Sturdy hardbound cover for projects & thesis
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-800">
            +{formatCurrency(pricing.addon_hard_binding || 120)}
          </div>
        </label>
      )}

      {/* 3. Soft Cover Binding */}
      {enabledAddons.softBinding === true && (
        <label
          onClick={() => toggleStandardAddon('softBinding')}
          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
            addOns.softBinding
              ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.softBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Soft Cover Binding</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Paperback style book binding
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-800">
            +{formatCurrency(pricing.addon_soft_binding || 40)}
          </div>
        </label>
      )}

      {/* 4. Corner Stapling */}
      {enabledAddons.stapling !== false && (
        <label
          onClick={() => toggleStandardAddon('stapling')}
          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
            addOns.stapling
              ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.stapling}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Corner Stapling</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Top-left corner staple per copy
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-800">
            +{formatCurrency(pricing.addon_stapling || 5)}
          </div>
        </label>
      )}

      {/* 5. Soft Lamination */}
      {enabledAddons.lamination !== false && (
        <label
          onClick={() => toggleStandardAddon('lamination')}
          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
            addOns.lamination
              ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.lamination}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">Soft Lamination (per page)</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Glossy protective film
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-slate-800">
            +{formatCurrency(pricing.addon_lamination || 20)}
          </div>
        </label>
      )}

      {/* 6. Custom Add-ons */}
      {customAddons.map((addon) => {
        const isSelected = !!addOns.customAddons?.[addon.id];
        return (
          <label
            key={addon.id}
            onClick={() => toggleCustomAddon(addon.id)}
            className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
              isSelected
                ? 'border-indigo-600 bg-indigo-50/50 text-slate-900 ring-1 ring-indigo-600'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{addon.name}</span>
                </div>
                {addon.description && (
                  <div className="text-[10px] text-slate-400 font-medium">{addon.description}</div>
                )}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-800">
              +{formatCurrency(addon.price)} <span className="text-[10px] text-slate-400 font-normal">({addon.unit.replace('_', ' ')})</span>
            </div>
          </label>
        );
      })}
    </div>
  );
};
