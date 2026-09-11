import {PricingConfig} from '@/types';
import shopTemplate from '../public/config/pricing_config.json';
export const shopConfig={
  name:process.env.NEXT_PUBLIC_SHOP_NAME||'Cyber Cafe',
  tagline:process.env.NEXT_PUBLIC_SHOP_TAGLINE||'Self-Service Document Printing',
  address:process.env.NEXT_PUBLIC_SHOP_ADDRESS||'',
  phone:process.env.NEXT_PUBLIC_SHOP_PHONE||'',
  logoUrl:process.env.NEXT_PUBLIC_SHOP_LOGO_URL||'',
  currencySymbol:'₹',appUrl:process.env.NEXT_PUBLIC_APP_URL||'',
};
export const defaultPricingConfig:PricingConfig={...shopTemplate,shop_name:shopConfig.name,shop_address:shopConfig.address,shop_phone:shopConfig.phone,currency:'INR'} as PricingConfig;
export const developerConfig = {
  name: 'Shubhamoy',
  phone: '9144457475',
  formattedPhone: '+91 9144457475',
  whatsappUrl: 'https://wa.me/919144457475?text=Hi%20Shubhamoy,%20I%20am%20interested%20in%20getting%20this%20print%20system%20for%20my%20shop',
};
export function getShopConfig(){return shopConfig;}
