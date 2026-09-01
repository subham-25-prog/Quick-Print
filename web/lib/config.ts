import { PricingConfig } from '@/types';
import shopTemplate from '../public/config/pricing_config.json';

export const shopConfig = {
  name: shopTemplate.shop_name || process.env.NEXT_PUBLIC_SHOP_NAME || 'Cyber Cafe',
  tagline: process.env.NEXT_PUBLIC_SHOP_TAGLINE || 'Self-Service Express Print',
  address: shopTemplate.shop_address || process.env.NEXT_PUBLIC_SHOP_ADDRESS || 'Main Market Road',
  phone: shopTemplate.shop_phone || process.env.NEXT_PUBLIC_SHOP_PHONE || '9144457475',
  logoUrl: process.env.NEXT_PUBLIC_SHOP_LOGO_URL || '',
  currencySymbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '₹',
  upiId: shopTemplate.shop_upi_id || process.env.NEXT_PUBLIC_SHOP_UPI_ID || 'shubhamoy27@okaxis',
  upiPayeeName: shopTemplate.shop_upi_name || process.env.NEXT_PUBLIC_SHOP_UPI_NAME || 'QuickPrint Xerox',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
};

export const defaultPricingConfig: PricingConfig = {
  ...shopTemplate,
  shop_name: shopConfig.name,
  shop_upi_id: shopConfig.upiId,
  shop_upi_name: shopConfig.upiPayeeName,
  shop_phone: shopConfig.phone,
  shop_address: shopConfig.address,
  currency: shopTemplate.currency || 'INR',
} as PricingConfig;

export function getShopConfig() {
  return shopConfig;
}
