import { PhonePeProvider } from './phonepe';
import { DirectUpiProvider } from './direct-upi';
import { PaymentProvider } from './provider';
import { database, getActivePricing } from '../db';
import { getCurrentShopId } from '../shop';
import { HttpError } from '../http';
import { defaultPricingConfig } from '../config';

export function configuredProvider(customUpiId?: string, customShopName?: string): PaymentProvider {
  const providerName = (process.env.PAYMENT_PROVIDER || 'direct_upi').trim().toLowerCase();

  if (providerName === 'phonepe') {
    const requiredFields = [
      'PHONEPE_MERCHANT_ID',
      'PHONEPE_CLIENT_ID',
      'PHONEPE_CLIENT_SECRET',
      'PHONEPE_WEBHOOK_USERNAME',
      'PHONEPE_WEBHOOK_PASSWORD',
    ] as const;

    for (const field of requiredFields) {
      if (!process.env[field]) {
        throw new HttpError(503, 'Online payment setup is incomplete.');
      }
    }

    const mode = process.env.PAYMENT_ENVIRONMENT?.trim();
    if (mode !== 'live' && mode !== 'sandbox') {
      throw new HttpError(503, 'Payment environment is not configured.');
    }

    const clientVersion = process.env.PHONEPE_CLIENT_VERSION?.trim() || '1';

    return new PhonePeProvider(
      process.env.PHONEPE_MERCHANT_ID!.trim(),
      mode,
      process.env.PHONEPE_CLIENT_ID!.trim(),
      clientVersion,
      process.env.PHONEPE_CLIENT_SECRET!.trim(),
      process.env.PHONEPE_WEBHOOK_USERNAME!.trim(),
      process.env.PHONEPE_WEBHOOK_PASSWORD!.trim()
    );
  }

  if (providerName === 'direct_upi' || providerName === 'upi') {
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

  throw new HttpError(
    503,
    'Online payment is unavailable. Please contact the shopkeeper.'
  );
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
