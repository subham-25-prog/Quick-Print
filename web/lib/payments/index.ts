import { DirectUpiProvider } from './direct-upi';
import { PaymentProvider } from './provider';
import { getActivePricing } from '../db';
import { HttpError } from '../http';
import { defaultPricingConfig } from '../config';

export function configuredProvider(customUpiId?: string, customShopName?: string): PaymentProvider {
  const providerName = (process.env.PAYMENT_PROVIDER || 'direct_upi').trim().toLowerCase();

  if (providerName === 'mock') {
    throw new HttpError(
      503,
      'Mock payment provider is unavailable in production environments.'
    );
  }

  // Direct UPI Payment Flow — Money flows directly to shopkeeper's UPI VPA with zero payment gateway
  const upiId =
    customUpiId?.trim() ||
    process.env.SHOP_UPI_ID?.trim() ||
    (defaultPricingConfig as any).shop_upi_id?.trim() ||
    'shubhamoy27@okaxis';
  const payeeName =
    customShopName?.trim() ||
    (defaultPricingConfig as any).shop_upi_name?.trim() ||
    defaultPricingConfig.shop_name ||
    'QuickPrint Shop';
  const env = process.env.PAYMENT_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'live';

  return new DirectUpiProvider(upiId, payeeName, env);
}

export async function paymentProvider(): Promise<PaymentProvider> {
  let upiId: string | undefined;
  let shopName: string | undefined;

  try {
    const pricing = await getActivePricing();
    upiId = pricing.shop_upi_id;
    shopName = pricing.shop_upi_name || pricing.shop_name;
  } catch {}

  return configuredProvider(upiId, shopName);
}

