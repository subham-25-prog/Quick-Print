import { PricingConfig, OrderItemOptions, AdvancedPrintConfig } from '@/types';
import { HttpError } from './http';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'Invalid reference.');
  return value;
}
export function textField(value: unknown, max: number): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || [...value].some(c=>c.charCodeAt(0)<32&&!['\t','\n','\r'].includes(c))) throw new HttpError(400, 'Invalid text field.');
  return value.trim();
}
export function printOptions(body: Record<string, unknown>, pricing: PricingConfig): OrderItemOptions {
  const { paperSize = 'A4', colorMode = 'BW', printSides = 'SINGLE', copies = 1, addOns = {} } = body;
  if (!['A4', 'A3', 'LEGAL', 'PHOTO'].includes(String(paperSize)) || pricing.enabled_papers?.[String(paperSize).toLowerCase()] === false) throw new HttpError(400, 'This paper size is unavailable.');
  if (!['BW','COLOR'].includes(String(colorMode)) || (colorMode === 'COLOR' && pricing.form_fields?.allowColorPrinting === false)) throw new HttpError(400, 'Invalid colour option.');
  if (!['SINGLE','DOUBLE'].includes(String(printSides)) || (printSides === 'DOUBLE' && pricing.form_fields?.allowDoubleSided === false)) throw new HttpError(400, 'Invalid duplex option.');
  if (!Number.isSafeInteger(copies) || Number(copies) < 1 || Number(copies) > 100) throw new HttpError(400, 'Copies must be a whole number from 1 to 100.');
  if (!addOns || typeof addOns !== 'object' || Array.isArray(addOns)) throw new HttpError(400, 'Invalid add-ons.');
  const allowed = ['stapling','spiralBinding','lamination','hardBinding','softBinding'];
  for (const [key, value] of Object.entries(addOns)) {
    if (key === 'customAddons' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [id, enabled] of Object.entries(value)) {
        if (typeof enabled !== 'boolean' || (enabled && !pricing.custom_addons?.some(a => a.id === id && a.enabled))) throw new HttpError(400, 'Invalid custom add-on.');
      }
    } else if (!allowed.includes(key) || typeof value !== 'boolean' || (value && pricing.enabled_addons?.[key] === false)) throw new HttpError(400, 'Invalid add-on.');
  }
  const advanced = body.advancedConfig as Record<string, unknown> | undefined;
  let advancedConfig: AdvancedPrintConfig | undefined = undefined;
  if (advanced && typeof advanced === 'object' && !Array.isArray(advanced)) {
    const pageRangeMode = ['ALL', 'RANGE', 'ODD', 'EVEN'].includes(String(advanced.pageRangeMode)) ? (advanced.pageRangeMode as any) : 'ALL';
    const pagesPerSheet = ['1', '2', '4', 'booklet'].includes(String(advanced.pagesPerSheet)) ? (advanced.pagesPerSheet as any) : '1';
    const pageScaling = ['FIT', 'ACTUAL', 'SHRINK', 'CUSTOM'].includes(String(advanced.pageScaling)) ? (advanced.pageScaling as any) : 'FIT';
    const orientation = ['AUTO', 'PORTRAIT', 'LANDSCAPE'].includes(String(advanced.orientation)) ? (advanced.orientation as any) : 'AUTO';
    const watermark = ['NONE', 'CONFIDENTIAL', 'DRAFT', 'SAMPLE'].includes(String(advanced.watermark)) ? (advanced.watermark as any) : 'NONE';
    const customPageRange = textField(advanced.customPageRange, 100);
    const customScalePercent = Number.isFinite(advanced.customScalePercent) ? Math.min(150, Math.max(50, Number(advanced.customScalePercent))) : 100;
    advancedConfig = {
      pageRangeMode,
      customPageRange,
      pagesPerSheet,
      pageScaling,
      customScalePercent,
      orientation,
      watermark,
      printQuality: 'STANDARD',
    };
  }
  return { paperSize: String(paperSize), colorMode, printSides, copies, addOns, ...(advancedConfig ? { advancedConfig } : {}) } as OrderItemOptions & { advancedConfig?: AdvancedPrintConfig };
}
export function validatePricing(value: PricingConfig): PricingConfig {
  for (const [key, number] of Object.entries(value)) {
    if ((key.includes('per_page') || key.startsWith('addon_') || key === 'double_sided_multiplier') &&
      (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 100000)) throw new HttpError(400, 'Pricing must contain valid non-negative rates.');
  }
  if (value.currency !== 'INR') throw new HttpError(400, 'This installation supports INR only.');
  for(const key of ['shop_name','shop_phone','shop_address'] as const)if(value[key]!==undefined)textField(value[key],key==='shop_address'?300:100);
  for(const key of ['enabled_papers','enabled_addons','form_fields'] as const){
    const group=value[key];
    if(group!==undefined&&(!group||typeof group!=='object'||Array.isArray(group)))throw new HttpError(400,'Invalid settings group.');
    for(const [field,v] of Object.entries(group||{})){
      if(['minOrderAmount','urgentFee'].includes(field)){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000)throw new HttpError(400,'Invalid fee.');}
      else if(field==='announcementText')textField(v,500);
      else if(typeof v!=='boolean')throw new HttpError(400,'Invalid settings switch.');
    }
  }
  if(value.custom_papers?.length)throw new HttpError(400,'Custom paper sizes need a supported printer adapter; use standard sizes.');
  if(value.custom_addons!==undefined&&!Array.isArray(value.custom_addons))throw new HttpError(400,'Invalid add-ons.');
  for(const a of value.custom_addons||[])if(!a||!['per_copy','per_page','per_order'].includes(a.unit)||typeof a.enabled!=='boolean'||!/^[a-zA-Z0-9_-]{1,64}$/.test(a.id)||typeof a.name!=='string'||a.name.length>100)throw new HttpError(400,'Invalid custom add-on.');
  for (const addon of value.custom_addons || []) if (!Number.isFinite(addon.price) || addon.price < 0) throw new HttpError(400, 'Invalid add-on price.');
  const {admin_pin:_pin,shop_upi_id:_upi,shop_upi_name:_name,shop_merchant_qr_image:_qr,...clean}=value as PricingConfig&{admin_pin?:unknown};
  return {...clean,form_fields:{...clean.form_fields,allowCashPayment:false,autoApproveUpiOrders:false}};
}
