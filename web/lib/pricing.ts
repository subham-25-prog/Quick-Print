import { PricingConfig, OrderItemOptions, PriceBreakdown } from '@/types';
import { defaultPricingConfig } from './config';

/**
 * Calculates the exact price breakdown for a print order
 */
export function calculateOrderPrice(
  pageCount: number,
  options: OrderItemOptions,
  pricing: PricingConfig = defaultPricingConfig
): PriceBreakdown {
  const safePageCount = Math.max(1, pageCount || 1);
  const safeCopies = Math.max(1, options?.copies || 1);
  const isDouble = options?.printSides === 'DOUBLE';
  const isColor = options?.colorMode === 'COLOR';

  const safePricing: PricingConfig = {
    ...defaultPricingConfig,
    ...pricing,
    a4_bw_per_page: pricing?.a4_bw_per_page ?? defaultPricingConfig.a4_bw_per_page,
    a4_bw_double_per_page: pricing?.a4_bw_double_per_page ?? defaultPricingConfig.a4_bw_double_per_page ?? 4.0,
    a4_color_per_page: pricing?.a4_color_per_page ?? defaultPricingConfig.a4_color_per_page,
    a4_color_double_per_page: pricing?.a4_color_double_per_page ?? defaultPricingConfig.a4_color_double_per_page ?? 18.0,
    a3_bw_per_page: pricing?.a3_bw_per_page ?? defaultPricingConfig.a3_bw_per_page,
    a3_bw_double_per_page: pricing?.a3_bw_double_per_page ?? defaultPricingConfig.a3_bw_double_per_page ?? 8.0,
    a3_color_per_page: pricing?.a3_color_per_page ?? defaultPricingConfig.a3_color_per_page,
    a3_color_double_per_page: pricing?.a3_color_double_per_page ?? defaultPricingConfig.a3_color_double_per_page ?? 35.0,
    legal_bw_per_page: pricing?.legal_bw_per_page ?? defaultPricingConfig.legal_bw_per_page ?? 3.0,
    legal_bw_double_per_page: pricing?.legal_bw_double_per_page ?? defaultPricingConfig.legal_bw_double_per_page ?? 5.0,
    legal_color_per_page: pricing?.legal_color_per_page ?? defaultPricingConfig.legal_color_per_page ?? 12.0,
    legal_color_double_per_page: pricing?.legal_color_double_per_page ?? defaultPricingConfig.legal_color_double_per_page ?? 22.0,
    photo_paper_per_page: pricing?.photo_paper_per_page ?? defaultPricingConfig.photo_paper_per_page ?? 25.0,
    addon_stapling: pricing?.addon_stapling ?? defaultPricingConfig.addon_stapling ?? 5.0,
    addon_spiral_binding: pricing?.addon_spiral_binding ?? defaultPricingConfig.addon_spiral_binding ?? 30.0,
    addon_lamination: pricing?.addon_lamination ?? defaultPricingConfig.addon_lamination ?? 20.0,
    addon_hard_binding: pricing?.addon_hard_binding ?? defaultPricingConfig.addon_hard_binding ?? 120.0,
    addon_soft_binding: pricing?.addon_soft_binding ?? defaultPricingConfig.addon_soft_binding ?? 40.0,
  };

  // 1. Determine base rate per page
  let effectiveRatePerPage = 2.0;

  if (options?.paperSize === 'A4') {
    if (isColor) {
      effectiveRatePerPage = isDouble
        ? (safePricing.a4_color_double_per_page || safePricing.a4_color_per_page * 1.8)
        : safePricing.a4_color_per_page;
    } else {
      effectiveRatePerPage = isDouble
        ? (safePricing.a4_bw_double_per_page || safePricing.a4_bw_per_page * 1.5)
        : safePricing.a4_bw_per_page;
    }
  } else if (options?.paperSize === 'A3') {
    if (isColor) {
      effectiveRatePerPage = isDouble
        ? (safePricing.a3_color_double_per_page || safePricing.a3_color_per_page * 1.75)
        : safePricing.a3_color_per_page;
    } else {
      effectiveRatePerPage = isDouble
        ? (safePricing.a3_bw_double_per_page || safePricing.a3_bw_per_page * 1.6)
        : safePricing.a3_bw_per_page;
    }
  } else if (options?.paperSize === 'LEGAL') {
    if (isColor) {
      effectiveRatePerPage = isDouble
        ? (safePricing.legal_color_double_per_page || safePricing.legal_color_per_page * 1.8)
        : safePricing.legal_color_per_page;
    } else {
      effectiveRatePerPage = isDouble
        ? (safePricing.legal_bw_double_per_page || safePricing.legal_bw_per_page * 1.66)
        : safePricing.legal_bw_per_page;
    }
  } else if (options?.paperSize === 'PHOTO') {
    effectiveRatePerPage = safePricing.photo_paper_per_page || 25.0;
  } else {
    // Check in custom papers
    const customPaper = safePricing.custom_papers?.find((p) => p.id === options?.paperSize || p.name === options?.paperSize);
    if (customPaper) {
      if (isColor) {
        effectiveRatePerPage = isDouble ? customPaper.color_double : customPaper.color_single;
      } else {
        effectiveRatePerPage = isDouble ? customPaper.bw_double : customPaper.bw_single;
      }
    }
  }

  effectiveRatePerPage = Number((effectiveRatePerPage || 2.0).toFixed(2));

  // 2. Print Subtotal = (Pages × Rate per page × Copies)
  const printSubtotal = Number((safePageCount * effectiveRatePerPage * safeCopies).toFixed(2));

  // 3. Calculate Standard Add-ons
  const addOnsBreakdown: PriceBreakdown['addOnsBreakdown'] = [];
  let addOnsSubtotal = 0;

  if (options?.addOns?.stapling && safePricing.enabled_addons?.stapling !== false && (safePricing.addon_stapling || 5.0) > 0) {
    const rate = safePricing.addon_stapling || 5.0;
    const total = rate * safeCopies;
    addOnsBreakdown.push({
      name: 'Corner Stapling',
      unitPrice: rate,
      total,
    });
    addOnsSubtotal += total;
  }

  if (options?.addOns?.spiralBinding && safePricing.enabled_addons?.spiralBinding !== false && (safePricing.addon_spiral_binding || 30.0) > 0) {
    const rate = safePricing.addon_spiral_binding || 30.0;
    const total = rate * safeCopies;
    addOnsBreakdown.push({
      name: 'Spiral Binding (Plastic Coil)',
      unitPrice: rate,
      total,
    });
    addOnsSubtotal += total;
  }

  if (options?.addOns?.lamination && safePricing.enabled_addons?.lamination !== false && (safePricing.addon_lamination || 20.0) > 0) {
    const rate = safePricing.addon_lamination || 20.0;
    const total = rate * safePageCount * safeCopies;
    addOnsBreakdown.push({
      name: `Soft Lamination (${safePageCount} pages)`,
      unitPrice: rate,
      total,
    });
    addOnsSubtotal += total;
  }

  if (options?.addOns?.hardBinding && safePricing.enabled_addons?.hardBinding !== false && (safePricing.addon_hard_binding || 120.0) > 0) {
    const rate = safePricing.addon_hard_binding || 120.0;
    const total = rate * safeCopies;
    addOnsBreakdown.push({
      name: 'Hard Cover Book Binding',
      unitPrice: rate,
      total,
    });
    addOnsSubtotal += total;
  }

  if (options?.addOns?.softBinding && (safePricing.enabled_addons?.softBinding === true || safePricing.enabled_addons?.softBinding !== false) && (safePricing.addon_soft_binding || 40.0) > 0) {
    const rate = safePricing.addon_soft_binding || 40.0;
    const total = rate * safeCopies;
    addOnsBreakdown.push({
      name: 'Soft Cover Binding',
      unitPrice: rate,
      total,
    });
    addOnsSubtotal += total;
  }

  // 4. Calculate Custom Add-ons
  if (options?.addOns?.customAddons && safePricing.custom_addons) {
    for (const [addonId, isSelected] of Object.entries(options.addOns.customAddons)) {
      if (isSelected) {
        const addon = safePricing.custom_addons.find((a) => a.id === addonId);
        if (addon && addon.enabled) {
          let total = addon.price || 0;
          if (addon.unit === 'per_page') {
            total = (addon.price || 0) * safePageCount * safeCopies;
          } else if (addon.unit === 'per_copy') {
            total = (addon.price || 0) * safeCopies;
          }

          addOnsBreakdown.push({
            name: addon.name,
            unitPrice: addon.price || 0,
            total,
          });
          addOnsSubtotal += total;
        }
      }
    }
  }

  let totalAmount = Number((printSubtotal + addOnsSubtotal).toFixed(2));

  // 5. Apply Minimum Order Amount if set
  if (safePricing.form_fields?.minOrderAmount && totalAmount < safePricing.form_fields.minOrderAmount) {
    totalAmount = safePricing.form_fields.minOrderAmount;
  }

  return {
    pageCount: safePageCount,
    copies: safeCopies,
    baseRatePerPage: effectiveRatePerPage,
    effectiveRatePerPage,
    printSubtotal,
    addOnsBreakdown,
    addOnsSubtotal,
    totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
    currency: safePricing.currency || 'INR',
  };
}

/**
 * Builds standard UPI payment deep link
 */
export function generateUpiDeepLink({
  upiId,
  payeeName,
  amount,
  orderNumber,
  currency = 'INR',
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  orderNumber: string;
  currency?: string;
}): string {
  const cleanUpi = (upiId || '').trim();
  const cleanName = encodeURIComponent((payeeName || 'QuickPrint').trim());
  const cleanAmount = (amount || 0).toFixed(2);
  const cleanNote = encodeURIComponent(`QuickPrint Order ${orderNumber || 'QP'}`);

  return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=${currency}&tn=${cleanNote}`;
}

export type UpiAppKey = 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'cred' | 'generic';

export interface UpiLinkSet {
  schemeUrl: string;
  intentUrl: string;
  packageName?: string;
  name: string;
}

export function generateAllUpiLinks({
  upiId,
  payeeName,
  amount,
  orderNumber,
  currency = 'INR',
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  orderNumber: string;
  currency?: string;
}): Record<UpiAppKey, UpiLinkSet> {
  const cleanUpi = (upiId || '').trim();
  const cleanName = encodeURIComponent((payeeName || 'QuickPrint').trim());
  const cleanAmount = (amount || 0).toFixed(2);
  const cleanNote = encodeURIComponent(`QuickPrint Order ${orderNumber || 'QP'}`);
  const query = `pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=${currency}&tn=${cleanNote}`;

  return {
    phonepe: {
      name: 'PhonePe',
      schemeUrl: `phonepe://pay?${query}`,
      intentUrl: `intent://pay?${query}#Intent;scheme=upi;package=com.phonepe.app;end`,
      packageName: 'com.phonepe.app',
    },
    gpay: {
      name: 'Google Pay',
      schemeUrl: `tez://upi/pay?${query}`,
      intentUrl: `intent://pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`,
      packageName: 'com.google.android.apps.nbu.paisa.user',
    },
    paytm: {
      name: 'Paytm',
      schemeUrl: `paytmmp://pay?${query}`,
      intentUrl: `intent://pay?${query}#Intent;scheme=upi;package=net.one97.paytm;end`,
      packageName: 'net.one97.paytm',
    },
    bhim: {
      name: 'BHIM UPI',
      schemeUrl: `in.org.npci.upiapp://pay?${query}`,
      intentUrl: `intent://pay?${query}#Intent;scheme=upi;package=in.org.npci.upiapp;end`,
      packageName: 'in.org.npci.upiapp',
    },
    cred: {
      name: 'CRED UPI',
      schemeUrl: `credpay://upi/pay?${query}`,
      intentUrl: `intent://pay?${query}#Intent;scheme=upi;package=com.dreamplug.androidapp;end`,
      packageName: 'com.dreamplug.androidapp',
    },
    generic: {
      name: 'Other UPI App',
      schemeUrl: `upi://pay?${query}`,
      intentUrl: `upi://pay?${query}`,
    },
  };
}

