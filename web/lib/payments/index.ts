import { DirectUpiProvider } from './direct-upi';
import { PaymentProvider } from './provider';
import { database, getActivePricing } from '../db';
import { getCurrentShopId } from '../shop';
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
  const shopId = getCurrentShopId();
  let upiId: string | undefined;
  let shopName: string | undefined;

  try {
    const pricing = await getActivePricing();
    upiId = pricing.shop_upi_id;
    shopName = pricing.shop_upi_name || pricing.shop_name;
  } catch {}

  const provider = configuredProvider(upiId, shopName);
  const db = database();

  const { data, error } = await db
    .from('payment_configs')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!error) {
    const needsSync =
      !data ||
      data.provider !== provider.name ||
      data.merchant_id !== provider.merchantId ||
      data.environment !== provider.environment ||
      data.credential_fingerprint !== provider.fingerprint ||
      !data.enabled;

    if (needsSync) {
      await db.from('payment_configs').upsert({
        shop_id: shopId,
        provider: provider.name,
        merchant_id: provider.merchantId,
        credential_fingerprint: provider.fingerprint,
        environment: provider.environment,
        enabled: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return provider;
}
