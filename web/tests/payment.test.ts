import { expect, test, vi } from 'vitest';
import { DirectUpiProvider, verifyPayment } from '@/lib/payments/direct-upi';
import { PaymentContext, assertVerified } from '@/lib/payments/provider';

function fixture() {
  const provider = new DirectUpiProvider(
    'wbs.erf@icici',
    'West Bengal State Emergency Relief Fund',
    1,
    'sandbox'
  );

  const payment: PaymentContext = {
    id: 'payment-123',
    provider: 'direct_upi',
    shop_id: 'shop-123',
    payment_reference: 'QP-1052',
    amount: 1,
    currency: 'INR',
    merchant_id: 'wbs.erf@icici',
    environment: 'sandbox',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: 'QP-1052',
  };

  return { provider, payment };
}

test('generates standard upi://pay URI with required parameters', () => {
  const { provider } = fixture();
  const uri = provider.generateUpiUri('QP-1052', 1);

  expect(uri).toMatch(/^upi:\/\/pay\?/);
  const parsed = new URL(uri);
  expect(parsed.protocol).toBe('upi:');
  expect(parsed.hostname).toBe('pay');

  const searchParams = parsed.searchParams;
  expect(searchParams.get('pa')).toBe('wbs.erf@icici');
  expect(searchParams.get('pn')).toBe('West Bengal State Emergency Relief Fund');
  expect(searchParams.get('am')).toBe('1');
  expect(searchParams.get('cu')).toBe('INR');
  expect(searchParams.get('tn')).toBe('QuickPrint Test QP-1052');
  expect(searchParams.get('tr')).toBe('QP-1052');
});

test('createPayment returns upiUri and order ID', async () => {
  const { provider, payment } = fixture();
  const res = await provider.createPayment(payment, 'https://test/payment/123');

  expect(res.url).toContain('pa=wbs.erf%40icici');
  expect(res.url).toContain('am=1');
  expect(res.url).toContain('tr=QP-1052');
  expect(res.providerOrderId).toBe('QP-1052');
});

test('important rule: never marks status PAID or SUCCESS automatically', async () => {
  const { provider, payment } = fixture();
  const verified = await provider.verifyPayment(payment);

  // Status must remain PENDING
  expect(verified.state).toBe('PENDING');
  expect(verified.provider).toBe('direct_upi');
  expect(verified.reference).toBe('QP-1052');

  // assertVerified must reject because state is not SUCCESS
  expect(() => assertVerified(payment, verified)).toThrow();
});

test('untrusted client claim never satisfies normalized verification proof', () => {
  const { payment } = fixture();
  expect(() => assertVerified(payment, { state: 'SUCCESS' } as never)).toThrow();
});

test('architectural verifyPayment hook returns false pending bank confirmation', async () => {
  const result = await verifyPayment('QP-1052', 'BANK-REF-999');
  expect(result.success).toBe(false);
  expect(result.state).toBe('PENDING');
});

test('production configuration never selects mock provider', async () => {
  vi.stubEnv('PAYMENT_PROVIDER', 'mock');
  const { paymentProvider } = await import('@/lib/payments');
  await expect(paymentProvider()).rejects.toThrow('unavailable');
  vi.unstubAllEnvs();
});

test('default provider selects direct UPI with emergency relief fund test account', async () => {
  const { paymentProvider } = await import('@/lib/payments');
  const provider = (await paymentProvider()) as DirectUpiProvider;
  expect(provider.name).toBe('direct_upi');
  expect(provider.upiId).toBe('wbs.erf@icici');
  expect(provider.payeeName).toBe('West Bengal State Emergency Relief Fund');
});
