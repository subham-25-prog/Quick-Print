import { DirectUpiProvider } from './direct-upi';
import { PaymentProvider } from './provider';
import { getActivePricing } from '../db';
import { HttpError } from '../http';

/**
 * Returns configured Direct UPI Provider.
 * Allows overriding payee UPI ID and Payee Name via shopkeeper pricing settings or environment variables.
 * Defaults to test UPI account: wbs.erf@icici (West Bengal State Emergency Relief Fund).
 */
export function configuredProvider(customUpiId?: string, customPayeeName?: string): PaymentProvider {
  if (process.env.PAYMENT_PROVIDER === 'mock') {
    throw new HttpError(
      503,
      'Mock payment provider is unavailable in production environments.'
    );
  }

  // Priority: 1. Admin/Shop pricing setting -> 2. Environment variable -> 3. Test UPI ID
  const upiId =
    customUpiId?.trim() ||
    process.env.SHOP_UPI_ID?.trim() ||
    'wbs.erf@icici';

  const payeeName =
    customPayeeName?.trim() ||
    process.env.SHOP_UPI_NAME?.trim() ||
    'West Bengal State Emergency Relief Fund';

  const env = process.env.PAYMENT_ENVIRONMENT === 'live' ? 'live' : 'sandbox';

  return new DirectUpiProvider(upiId, payeeName, 1, env);
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
