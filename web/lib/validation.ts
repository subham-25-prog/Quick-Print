import { PricingConfig, OrderItemOptions } from '@/types';
import { HttpError } from './http';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new HttpError(400, 'Invalid reference.');
  }
  return value;
}

export function textField(value: unknown, max: number): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (
    typeof value !== 'string' ||
    value.length > max ||
    [...value].some((c) => c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c))
  ) {
    throw new HttpError(400, 'Invalid text field.');
  }

  return value.trim();
}

export function printOptions(
  body: Record<string, unknown>,
  pricing: PricingConfig
): OrderItemOptions {
  const {
    paperSize = 'A4',
    colorMode = 'BW',
    printSides = 'SINGLE',
    copies = 1,
    addOns = {},
  } = body;

  const paperSizeStr = String(paperSize);
  const colorModeStr = String(colorMode);
  const printSidesStr = String(printSides);

  // Validate paper size
  if (
    !['A4', 'A3', 'LEGAL', 'PHOTO'].includes(paperSizeStr) ||
    pricing.enabled_papers?.[paperSizeStr.toLowerCase()] === false
  ) {
    throw new HttpError(400, 'This paper size is unavailable.');
  }

  // Validate color mode
  if (
    !['BW', 'COLOR'].includes(colorModeStr) ||
    (colorModeStr === 'COLOR' && pricing.form_fields?.allowColorPrinting === false)
  ) {
    throw new HttpError(400, 'Invalid colour option.');
  }

  // Validate print sides (duplex)
  if (
    !['SINGLE', 'DOUBLE'].includes(printSidesStr) ||
    (printSidesStr === 'DOUBLE' && pricing.form_fields?.allowDoubleSided === false)
  ) {
    throw new HttpError(400, 'Invalid duplex option.');
  }

  // Validate copies count
  if (!Number.isSafeInteger(copies) || Number(copies) < 1 || Number(copies) > 100) {
    throw new HttpError(400, 'Copies must be a whole number from 1 to 100.');
  }

  // Validate add-ons
  if (!addOns || typeof addOns !== 'object' || Array.isArray(addOns)) {
    throw new HttpError(400, 'Invalid add-ons.');
  }

  const standardAddons = ['stapling', 'spiralBinding', 'lamination', 'hardBinding', 'softBinding'];
  for (const [key, value] of Object.entries(addOns as Record<string, unknown>)) {
    if (key === 'customAddons' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [id, enabled] of Object.entries(value as Record<string, unknown>)) {
        if (
          typeof enabled !== 'boolean' ||
          (enabled && !pricing.custom_addons?.some((a) => a.id === id && a.enabled))
        ) {
          throw new HttpError(400, 'Invalid custom add-on.');
        }
      }
    } else if (
      !standardAddons.includes(key) ||
      typeof value !== 'boolean' ||
      (value && pricing.enabled_addons?.[key] === false)
    ) {
      throw new HttpError(400, 'Invalid add-on.');
    }
  }

  // Check advancedConfig defaults
  const advanced = body.advancedConfig as Record<string, unknown> | undefined;
  const defaultAdvanced: Record<string, unknown> = {
    pageRangeMode: 'ALL',
    customPageRange: '',
    pagesPerSheet: '1',
    pageScaling: 'FIT',
    customScalePercent: 100,
    orientation: 'AUTO',
    printQuality: 'STANDARD',
    watermark: 'NONE',
  };

  if (
    advanced !== undefined &&
    (!advanced ||
      typeof advanced !== 'object' ||
      Array.isArray(advanced) ||
      Object.entries(advanced).some(([k, v]) => defaultAdvanced[k] !== v))
  ) {
    throw new HttpError(400, 'Advanced printing options are not supported by this installation.');
  }

  return {
    paperSize: paperSizeStr,
    colorMode: colorModeStr as 'BW' | 'COLOR',
    printSides: printSidesStr as 'SINGLE' | 'DOUBLE',
    copies: Number(copies),
    addOns,
  } as OrderItemOptions;
}

export function validatePricing(value: PricingConfig): PricingConfig {
  // Validate per-page and addon numeric rates
  for (const [key, num] of Object.entries(value)) {
    if (
      (key.includes('per_page') || key.startsWith('addon_') || key === 'double_sided_multiplier') &&
      (typeof num !== 'number' || !Number.isFinite(num) || num < 0 || num > 100000)
    ) {
      throw new HttpError(400, 'Pricing must contain valid non-negative rates.');
    }
  }

  if (value.currency !== 'INR') {
    throw new HttpError(400, 'This installation supports INR only.');
  }

  // Validate shop identity text fields
  if (value.shop_name !== undefined) textField(value.shop_name, 100);
  if (value.shop_phone !== undefined) textField(value.shop_phone, 100);
  if (value.shop_address !== undefined) textField(value.shop_address, 300);

  // Validate boolean / numeric config groups
  const settingGroups = ['enabled_papers', 'enabled_addons', 'form_fields'] as const;
  for (const groupKey of settingGroups) {
    const group = value[groupKey];
    if (group !== undefined) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        throw new HttpError(400, 'Invalid settings group.');
      }
      for (const [field, val] of Object.entries(group as Record<string, unknown>)) {
        if (field === 'minOrderAmount' || field === 'urgentFee') {
          if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 100000) {
            throw new HttpError(400, 'Invalid fee.');
          }
        } else if (field === 'announcementText') {
          textField(val, 500);
        } else if (typeof val !== 'boolean') {
          throw new HttpError(400, 'Invalid settings switch.');
        }
      }
    }
  }

  if (value.custom_papers && value.custom_papers.length > 0) {
    throw new HttpError(400, 'Custom paper sizes need a supported printer adapter; use standard sizes.');
  }

  if (value.custom_addons !== undefined && !Array.isArray(value.custom_addons)) {
    throw new HttpError(400, 'Invalid add-ons.');
  }

  for (const addon of value.custom_addons || []) {
    if (
      !addon ||
      !['per_copy', 'per_page', 'per_order'].includes(addon.unit) ||
      typeof addon.enabled !== 'boolean' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(addon.id) ||
      typeof addon.name !== 'string' ||
      addon.name.length > 100 ||
      !Number.isFinite(addon.price) ||
      addon.price < 0
    ) {
      throw new HttpError(400, 'Invalid custom add-on.');
    }
  }

  // Strip sensitive/unwanted fields before returning
  const {
    admin_pin: _pin,
    shop_upi_id: _upi,
    shop_upi_name: _name,
    shop_merchant_qr_image: _qr,
    ...clean
  } = value as PricingConfig & { admin_pin?: unknown };

  return {
    ...clean,
    form_fields: {
      ...clean.form_fields,
      allowCashPayment: Boolean(clean.form_fields?.allowCashPayment),
      autoApproveUpiOrders: false,
    },
  };
}
