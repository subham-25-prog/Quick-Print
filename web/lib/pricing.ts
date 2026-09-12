import { PricingConfig, OrderItemOptions, PriceBreakdown } from '@/types';
import { defaultPricingConfig } from './config';

/**
 * Calculates item totals, per-page rates, add-on costs, and total price.
 * All rates (including duplex) are per document page; internal arithmetic uses integer paisa (minor currency units).
 */
export function calculateOrderPrice(
  pageCount: number,
  options: OrderItemOptions,
  pricing: PricingConfig = defaultPricingConfig
): PriceBreakdown {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error('Invalid page count');
  }
  if (!Number.isSafeInteger(options.copies) || options.copies < 1) {
    throw new Error('Invalid copy count');
  }

  const paperPrefix = options.paperSize.toLowerCase();
  const colorMode = options.colorMode === 'COLOR' ? 'color' : 'bw';
  const isDuplex = options.printSides === 'DOUBLE';

  let perPageRate: number | undefined;

  // Check if matching custom paper
  const customPaper = (pricing.custom_papers || []).find(
    (p) => p.id === options.paperSize || p.name.toLowerCase() === options.paperSize.toLowerCase()
  );

  if (customPaper) {
    if (colorMode === 'color') {
      perPageRate = isDuplex ? (customPaper.color_double || customPaper.color_single) : customPaper.color_single;
    } else {
      perPageRate = isDuplex ? (customPaper.bw_double || customPaper.bw_single) : customPaper.bw_single;
    }
  } else if (paperPrefix === 'photo') {
    const specificKey = isDuplex ? `photo_${colorMode}_double_per_page` : `photo_${colorMode}_per_page`;
    const specificVal = Number((pricing as unknown as Record<string, unknown>)[specificKey]);
    if (Number.isFinite(specificVal) && specificVal > 0) {
      perPageRate = specificVal;
    } else {
      perPageRate = Number(pricing.photo_paper_per_page) || 25;
    }
  } else {
    const doubleKey = `${paperPrefix}_${colorMode}_double_per_page`;
    const singleKey = `${paperPrefix}_${colorMode}_per_page`;
    const pricingRecord = pricing as unknown as Record<string, unknown>;
    perPageRate = isDuplex
      ? Number(pricingRecord[doubleKey] ?? pricingRecord[singleKey])
      : Number(pricingRecord[singleKey]);
  }

  if (typeof perPageRate !== 'number' || !Number.isFinite(perPageRate) || perPageRate < 0) {
    throw new Error('Pricing unavailable for this option');
  }

  const rateMinor = Math.round(perPageRate * 100);
  const printSubtotalMinor = pageCount * options.copies * rateMinor;

  const addOnsBreakdown: PriceBreakdown['addOnsBreakdown'] = [];

  // Standard Add-ons mapping
  const standardAddonDefinitions = [
    { key: 'stapling', configKey: 'addon_stapling', label: 'Stapling', perPage: false },
    { key: 'spiralBinding', configKey: 'addon_spiral_binding', label: 'Spiral binding', perPage: false },
    { key: 'lamination', configKey: 'addon_lamination', label: 'Lamination', perPage: true },
    { key: 'hardBinding', configKey: 'addon_hard_binding', label: 'Hard binding', perPage: false },
    { key: 'softBinding', configKey: 'addon_soft_binding', label: 'Soft binding', perPage: false },
  ] as const;

  for (const addon of standardAddonDefinitions) {
    const isSelected = Boolean(options.addOns?.[addon.key]);
    const isEnabled = pricing.enabled_addons?.[addon.key] === true;

    if (isSelected && isEnabled) {
      const unitPriceValue = Number(pricing[addon.configKey as keyof PricingConfig] || 0);
      const unitPriceMinor = Math.round(unitPriceValue * 100);
      const multiplier = addon.perPage ? pageCount * options.copies : options.copies;
      const addonTotalMinor = unitPriceMinor * multiplier;

      addOnsBreakdown.push({
        name: addon.label,
        unitPrice: unitPriceMinor / 100,
        total: addonTotalMinor / 100,
      });
    }
  }

  // Custom Add-ons
  const customAddonsList = pricing.custom_addons || [];
  for (const customAddon of customAddonsList) {
    const isSelected = Boolean(options.addOns?.customAddons?.[customAddon.id]);
    if (customAddon.enabled && isSelected) {
      const unitPriceMinor = Math.round(customAddon.price * 100);
      let multiplier = 1;
      if (customAddon.unit === 'per_page') {
        multiplier = pageCount * options.copies;
      } else if (customAddon.unit === 'per_copy') {
        multiplier = options.copies;
      }

      const totalMinor = unitPriceMinor * multiplier;
      addOnsBreakdown.push({
        name: customAddon.name,
        unitPrice: unitPriceMinor / 100,
        total: totalMinor / 100,
      });
    }
  }

  const addOnsSubtotalMinor = addOnsBreakdown.reduce(
    (sum, item) => sum + Math.round(item.total * 100),
    0
  );

  const minOrderAmount = pricing.form_fields?.minOrderAmount ?? 1;
  const minOrderMinor = Math.round(minOrderAmount * 100);
  const totalAmountMinor = Math.max(printSubtotalMinor + addOnsSubtotalMinor, minOrderMinor);

  return {
    pageCount,
    copies: options.copies,
    baseRatePerPage: rateMinor / 100,
    effectiveRatePerPage: rateMinor / 100,
    printSubtotal: printSubtotalMinor / 100,
    addOnsBreakdown,
    addOnsSubtotal: addOnsSubtotalMinor / 100,
    totalAmount: totalAmountMinor / 100,
    currency: 'INR',
  };
}
