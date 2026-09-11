import { expect, test, vi } from 'vitest';
import { assertVerified, PaymentContext } from '@/lib/payments/provider';
import { DirectUpiProvider, generateUpiUri, generateDynamicQrDataUrl } from '@/lib/payments/direct-upi';

test('generateUpiUri builds standard NPCI UPI URI with order details and exact amount', () => {
  const uri = generateUpiUri({
    upiId: 'shopkeeper@okaxis',
    payeeName: 'QuickPrint Shop',
    amount: 18.0,
    orderNumber: 'QP-1052',
    reference: 'QP-1052',
  });

  expect(uri).toContain('upi://pay?');
  expect(uri).toContain('pa=shopkeeper%40okaxis');
  expect(uri).toContain('pn=QuickPrint+Shop');
  expect(uri).toContain('am=18.00');
  expect(uri).toContain('cu=INR');
  expect(uri).toContain('tr=QP-1052');
  expect(uri).toContain('tn=QuickPrint+Order+QP-1052');
});

test('generateDynamicQrDataUrl generates valid high-contrast base64 PNG data URL', async () => {
  const uri = 'upi://pay?pa=shopkeeper%40okaxis&pn=Shop&am=18.00&cu=INR&tr=QP-1052';
  const dataUrl = await generateDynamicQrDataUrl(uri);
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
});

test('DirectUpiProvider formats standard NPCI UPI URI and generates dynamic QR code', async () => {
  const provider = new DirectUpiProvider('shop@upi', 'Test Shop');
  const uri = provider.generateUpiUri({
    upiId: 'shop@upi',
    payeeName: 'Test Shop',
    amount: 25.5,
    orderReference: 'QP-99999',
    note: 'Print Order QP-99999',
  });
  expect(uri).toContain('upi://pay?');
  expect(uri).toContain('pa=shop%40upi');
  expect(uri).toContain('pn=Test+Shop');
  expect(uri).toContain('am=25.50');
  expect(uri).toContain('cu=INR');
  expect(uri).toContain('tr=QP-99999');

  const qrDataUrl = await provider.generateDynamicQrDataUrl(uri);
  expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

  const payment = await provider.createPayment(
    {
      id: 'pay-1',
      provider: 'direct_upi',
      shop_id: 'shop-1',
      payment_reference: 'QP-99999',
      amount: 25.5,
      currency: 'INR',
      merchant_id: 'shop@upi',
      environment: 'live',
      credential_fingerprint: provider.fingerprint,
      provider_link_id: 'QP-99999',
    },
    'https://example.com/return'
  );
  expect(payment.upiUri).toBe(uri);
  expect(payment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(payment.providerOrderId).toBe('QP-99999');
});

test('DirectUpiProvider provides createDynamicQr and createUpiIntent methods', async () => {
  const provider = new DirectUpiProvider('shopkeeper@okhdfcbank', 'City Xerox');
  const p: PaymentContext = {
    id: 'pay-2',
    provider: 'direct_upi',
    shop_id: 'shop-1',
    payment_reference: 'QP-1052',
    amount: 18,
    currency: 'INR',
    merchant_id: 'shopkeeper@okhdfcbank',
    environment: 'live',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: 'QP-1052',
  };

  const qr = await provider.createDynamicQr(p, { orderNumber: 'QP-1052' });
  expect(qr.qrString).toContain('pa=shopkeeper%40okhdfcbank');
  expect(qr.qrString).toContain('am=18.00');
  expect(qr.qrDataUrl).toMatch(/^data:image\/png;base64,/);

  const intent = await provider.createUpiIntent(p, { orderNumber: 'QP-1052' });
  expect(intent.intentUrl).toBe(qr.qrString);
  expect(intent.providerOrderId).toBe('QP-1052');
});

test('DirectUpiProvider rejects verification without backend proof', async () => {
  const provider = new DirectUpiProvider();
  const p: PaymentContext = {
    id: 'pay-1',
    provider: 'direct_upi',
    shop_id: 'shop-1',
    payment_reference: 'QP-99999',
    amount: 25.5,
    currency: 'INR',
    merchant_id: 'shop@upi',
    environment: 'production',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: 'QP-99999',
  };
  await expect(provider.verifyPayment(p)).rejects.toThrow('Payment verification mismatch');
});

test('untrusted browser-like success does not satisfy normalized proof', () => {
  const provider = new DirectUpiProvider();
  const p: PaymentContext = {
    id: 'pay-1',
    provider: 'direct_upi',
    shop_id: 'shop-1',
    payment_reference: 'QP-99999',
    amount: 25.5,
    currency: 'INR',
    merchant_id: 'shop@upi',
    environment: 'production',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: 'QP-99999',
  };
  expect(() => assertVerified(p, { state: 'SUCCESS' } as never)).toThrow();
});

test('modular webhook handler parses transaction reference without gateway dependencies', async () => {
  const provider = new DirectUpiProvider('shop@upi', 'Shop');
  const payload = { reference: 'QP-1052', amount: 18 };
  const event = await provider.handleWebhook(
    new Request('https://test/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  );
  expect(event.reference).toBe('QP-1052');
  expect(event.merchantId).toBe('shop@upi');
});

test('production configuration never selects mock provider', async () => {
  vi.stubEnv('PAYMENT_PROVIDER', 'mock');
  const { paymentProvider } = await import('@/lib/payments');
  await expect(paymentProvider()).rejects.toThrow('unavailable');
  vi.unstubAllEnvs();
});
