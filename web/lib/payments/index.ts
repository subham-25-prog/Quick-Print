import { PhonePeProvider } from './phonepe';
import { database } from '../db';
import { getCurrentShopId } from '../shop';
import { HttpError } from '../http';

export function configuredProvider(): PhonePeProvider {
  if (process.env.PAYMENT_PROVIDER !== 'phonepe') {
    throw new HttpError(
      503,
      'Online payment is unavailable. Please contact the shopkeeper.'
    );
  }

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

export async function paymentProvider(): Promise<PhonePeProvider> {
  const provider = configuredProvider();
  const db = database();
  const shopId = getCurrentShopId();

  const { data, error } = await db
    .from('payment_configs')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error) throw error;

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

  return provider;
}
