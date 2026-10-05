'use client';

import React, { memo } from 'react';
import { AddOnOptions, PricingConfig } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface AddOnsSelectorProps {
  addOns: AddOnOptions;
  onAddOnsChange: (val: AddOnOptions) => void;
  pricing: PricingConfig;
}

const AddOnsSelectorComponent: React.FC<AddOnsSelectorProps> = ({
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
      <div className="text-center py-4 px-3 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-400">
        No extra finishing services active for this store.
      </div>
    );
  }

  const getCardClasses = (isSelected: boolean) =>
    `p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all duration-150 active-press select-none ${
      isSelected
        ? 'border-red-500 bg-gradient-to-r from-red-950/60 via-slate-900/80 to-slate-900 text-white ring-1 ring-red-500/60 shadow-md shadow-red-950/30'
        : 'border-slate-800/90 bg-slate-900/60 text-slate-300 hover:border-red-500/40 hover:bg-slate-850'
    }`;

  return (
    <div className="space-y-2.5 contain-layout">
      {/* 1. Spiral Binding */}
      {enabledAddons.spiralBinding !== false && (
        <label
          onClick={() => toggleStandardAddon('spiralBinding')}
          className={getCardClasses(!!addOns.spiralBinding)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.spiralBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>Spiral Binding (Plastic Coil)</span>
                {addOns.spiralBinding && <span className="text-[10px] text-red-400 font-black">🕸️ BOUND</span>}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Plastic coil binding with transparent cover
              </div>
            </div>
          </div>
          <div className="text-xs font-extrabold text-amber-400">
            +{formatCurrency(pricing.addon_spiral_binding || 30)}
          </div>
        </label>
      )}

      {/* 2. Hard Cover Book Binding */}
      {enabledAddons.hardBinding !== false && (
        <label
          onClick={() => toggleStandardAddon('hardBinding')}
          className={getCardClasses(!!addOns.hardBinding)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.hardBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>Hard Cover Book Binding</span>
                {addOns.hardBinding && <span className="text-[10px] text-red-400 font-black">🛡️ HARD</span>}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Sturdy hardbound cover for projects & thesis
              </div>
            </div>
          </div>
          <div className="text-xs font-extrabold text-amber-400">
            +{formatCurrency(pricing.addon_hard_binding || 120)}
          </div>
        </label>
      )}

      {/* 3. Soft Cover Binding */}
      {enabledAddons.softBinding === true && (
        <label
          onClick={() => toggleStandardAddon('softBinding')}
          className={getCardClasses(!!addOns.softBinding)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.softBinding}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-slate-100">Soft Cover Binding</div>
              <div className="text-[10px] text-slate-400 font-medium">
                Paperback style book binding
              </div>
            </div>
          </div>
          <div className="text-xs font-extrabold text-amber-400">
            +{formatCurrency(pricing.addon_soft_binding || 40)}
          </div>
        </label>
      )}

      {/* 4. Corner Stapling */}
      {enabledAddons.stapling !== false && (
        <label
          onClick={() => toggleStandardAddon('stapling')}
          className={getCardClasses(!!addOns.stapling)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.stapling}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>Corner Stapling</span>
                {addOns.stapling && <span className="text-[10px] text-red-400 font-black">📌 PINNED</span>}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Top-left corner staple per copy
              </div>
            </div>
          </div>
          <div className="text-xs font-extrabold text-amber-400">
            +{formatCurrency(pricing.addon_stapling || 5)}
          </div>
        </label>
      )}

      {/* 5. Soft Lamination */}
      {enabledAddons.lamination !== false && (
        <label
          onClick={() => toggleStandardAddon('lamination')}
          className={getCardClasses(!!addOns.lamination)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!addOns.lamination}
              onChange={() => {}}
              className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>Soft Lamination (per page)</span>
                {addOns.lamination && <span className="text-[10px] text-blue-400 font-black">✨ SHIELDED</span>}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                Glossy protective film
              </div>
            </div>
          </div>
          <div className="text-xs font-extrabold text-amber-400">
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
            className={getCardClasses(isSelected)}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="w-4 h-4 rounded border-slate-700 text-red-600 accent-red-600 focus:ring-0 cursor-pointer pointer-events-none"
              />
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>{addon.name}</span>
                </div>
                {addon.description && (
                  <div className="text-[10px] text-slate-400 font-medium">{addon.description}</div>
                )}
              </div>
            </div>
            <div className="text-xs font-extrabold text-amber-400">
              +{formatCurrency(addon.price)} <span className="text-[10px] text-slate-400 font-normal">({addon.unit.replace('_', ' ')})</span>
            </div>
          </label>
        );
      })}
    </div>
  );
};

export const AddOnsSelector = memo(AddOnsSelectorComponent);
