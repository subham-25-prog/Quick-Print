import {PricingConfig} from '@/types';
import shopTemplate from '../public/config/pricing_config.json';
export const shopConfig={
  name:process.env.NEXT_PUBLIC_SHOP_NAME||'QuickPrint',
  tagline:process.env.NEXT_PUBLIC_SHOP_TAGLINE||'Self-Service Document Printing',
  address:process.env.NEXT_PUBLIC_SHOP_ADDRESS||'',
  phone:process.env.NEXT_PUBLIC_SHOP_PHONE||'',
  logoUrl:process.env.NEXT_PUBLIC_SHOP_LOGO_URL||'',
  currencySymbol:'₹',appUrl:process.env.NEXT_PUBLIC_APP_URL||'',
};
export const defaultPricingConfig:PricingConfig={...shopTemplate,shop_name:shopConfig.name,shop_address:shopConfig.address,shop_phone:shopConfig.phone,currency:'INR'} as PricingConfig;
export function getShopConfig(){return shopConfig;}
