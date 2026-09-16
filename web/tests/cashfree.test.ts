import { expect, test, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { CashfreeProvider } from '@/lib/payments/cashfree';
import { assertVerified, PaymentContext } from '@/lib/payments/provider';

function fixture(status = 'PAID') {
  const transport = vi.fn();
  const provider = new CashfreeProvider(
    'test-app-id',
    'sandbox',
    'test-secret-key',
    '2023-08-01',
    transport
  );

  const p: PaymentContext = {
    id: '00000000-0000-4000-8000-000000000001',
    provider: 'cashfree',
    shop_id: '00000000-0000-4000-8000-000000000002',
    payment_reference: 'QP_ref123',
    amount: 15,
    currency: 'INR',
    merchant_id: 'test-app-id',
    environment: 'sandbox',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: '12345',
  };

  const linkResponse = {
    cf_link_id: 12345,
    link_id: 'QP_ref123',
    link_status: status,
    link_amount: 15,
    link_currency: 'INR',
    link_url: 'https://payments-test.cashfree.com/links/xyz123',
    link_notes: {
      udf1: p.shop_id,
      udf2: p.id,
      udf3: provider.merchantId,
      udf4: provider.fingerprint,
    },
  };

  const ordersResponse = [
    {
      order_id: 'order_123',
      order_status: 'PAID',
    },
  ];

  const paymentsResponse = [
    {
      cf_payment_id: 987654,
      payment_status: 'SUCCESS',
      payment_amount: 15,
      payment_currency: 'INR',
    },
  ];

  transport
    .mockResolvedValueOnce(Response.json(linkResponse))
    .mockResolvedValueOnce(Response.json(ordersResponse))
    .mockResolvedValueOnce(Response.json(paymentsResponse));

  return { provider, p, linkResponse, ordersResponse, paymentsResponse, transport };
}

test('createPayment initiates valid Cashfree payment link', async () => {
  const transport = vi.fn().mockResolvedValueOnce(
    Response.json({
      cf_link_id: 99999,
      link_id: 'QP_abc',
      link_url: 'https://payments.cashfree.com/links/abc',
    })
  );

  const provider = new CashfreeProvider(
    'app-id',
    'live',
    'secret',
    '2023-08-01',
    transport
  );

  const p: PaymentContext = {
    id: 'p1',
    provider: 'cashfree',
    shop_id: 's1',
    payment_reference: 'QP_abc',
    amount: 25,
    currency: 'INR',
    merchant_id: 'app-id',
    environment: 'live',
    credential_fingerprint: provider.fingerprint,
  };

  const result = await provider.createPayment(p, 'https://myshop.com/return');
  expect(result.url).toBe('https://payments.cashfree.com/links/abc');
  expect(result.providerOrderId).toBe('99999');

  const callArgs = transport.mock.calls[0];
  expect(callArgs[0]).toBe('https://api.cashfree.com/pg/links');
  const body = JSON.parse(callArgs[1].body);
  expect(body.link_id).toBe('QP_abc');
  expect(body.link_amount).toBe(25);
  expect(body.link_meta.return_url).toBe('https://myshop.com/return');
});

test('createPayment rejects untrusted payment url domain', async () => {
  const transport = vi.fn().mockResolvedValueOnce(
    Response.json({
      cf_link_id: 99999,
      link_id: 'QP_abc',
      link_url: 'https://evil-phishing.com/links/abc',
    })
  );

  const provider = new CashfreeProvider('app-id', 'live', 'secret', '2023-08-01', transport);
  const p: PaymentContext = {
    id: 'p1',
    provider: 'cashfree',
    shop_id: 's1',
    payment_reference: 'QP_abc',
    amount: 25,
    currency: 'INR',
    merchant_id: 'app-id',
    environment: 'live',
    credential_fingerprint: provider.fingerprint,
  };

  await expect(provider.createPayment(p, 'https://myshop.com/return')).rejects.toThrow('domain');
});

test('authenticated provider status verifies success', async () => {
  const f = fixture('PAID');
  const r = await f.provider.verifyPayment(f.p);
  expect(r.state).toBe('SUCCESS');
  expect(r.transactionId).toBe('987654');
  expect(r.amountMinor).toBe(1500);
  expect(f.transport.mock.calls[0][0]).toContain('/links/QP_ref123');
});

test.each(['ACTIVE', 'EXPIRED', 'CANCELLED'])('%s never verifies payment as success', async status => {
  const f = fixture(status);
  f.transport.mockReset().mockResolvedValueOnce(
    Response.json({
      ...f.linkResponse,
      link_status: status,
    })
  );
  await expect(f.provider.verifyPayment(f.p)).rejects.toThrow();
});

test.each(['amount', 'merchant', 'shop', 'fingerprint', 'currency'])(
  '%s mismatch rejects success',
  async field => {
    const f = fixture('PAID');
    if (field === 'amount') f.linkResponse.link_amount = 1;
    if (field === 'merchant') f.linkResponse.link_notes.udf3 = 'other';
    if (field === 'shop') f.linkResponse.link_notes.udf1 = 'other';
    if (field === 'fingerprint') f.linkResponse.link_notes.udf4 = 'other';
    if (field === 'currency') f.p.currency = 'USD';

    f.transport
      .mockReset()
      .mockResolvedValueOnce(Response.json(f.linkResponse))
      .mockResolvedValueOnce(Response.json(f.ordersResponse))
      .mockResolvedValueOnce(Response.json(f.paymentsResponse));

    await expect(f.provider.verifyPayment(f.p)).rejects.toThrow();
  }
);

test('forged webhook signature is rejected; valid HMAC webhook is accepted', async () => {
  const f = fixture();
  const secretKey = 'test-secret-key';
  const rawBody = JSON.stringify({
    data: {
      order: { order_id: 'QP_ref123', order_amount: 15 },
      payment: { cf_payment_id: '987654', payment_status: 'SUCCESS' },
    },
    event_time: '2026-09-16T10:00:00+05:30',
    type: 'PAYMENT_SUCCESS_WEBHOOK',
  });

  const timestamp = Date.now().toString();

  // Forged signature
  const forgedReq = new Request('https://test/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-webhook-signature': 'invalid-signature',
      'x-webhook-timestamp': timestamp,
    },
    body: rawBody,
  });
  await expect(f.provider.handleWebhook(forgedReq)).rejects.toThrow('signature');

  // Valid signature
  const validSignature = createHmac('sha256', secretKey)
    .update(timestamp + rawBody)
    .digest('base64');

  const validReq = new Request('https://test/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-webhook-signature': validSignature,
      'x-webhook-timestamp': timestamp,
    },
    body: rawBody,
  });

  const event = await f.provider.handleWebhook(validReq);
  expect(event.reference).toBe('QP_ref123');
  expect(event.merchantId).toBe('test-app-id');
  expect(event.eventHash).toBeTruthy();
});

test('webhook probe events are acknowledged without failing', async () => {
  const f = fixture();
  const secretKey = 'test-secret-key';
  const rawBody = JSON.stringify({
    type: 'TEST_PROBE',
    data: { order: { order_id: 'test' } },
  });
  const timestamp = Date.now().toString();
  const validSignature = createHmac('sha256', secretKey)
    .update(timestamp + rawBody)
    .digest('base64');

  const probeReq = new Request('https://test/api/payments/webhook', {
    method: 'POST',
    headers: {
      'x-webhook-signature': validSignature,
      'x-webhook-timestamp': timestamp,
    },
    body: rawBody,
  });

  const event = await f.provider.handleWebhook(probeReq);
  expect(event.reference).toBe('TEST_PROBE');
});

test('factory initializes CashfreeProvider when PAYMENT_PROVIDER=cashfree', async () => {
  vi.stubEnv('PAYMENT_PROVIDER', 'cashfree');
  vi.stubEnv('PAYMENT_ENVIRONMENT', 'sandbox');
  vi.stubEnv('CASHFREE_APP_ID', 'my-cf-app');
  vi.stubEnv('CASHFREE_SECRET_KEY', 'my-cf-secret');

  const { configuredProvider } = await import('@/lib/payments');
  const provider = configuredProvider();
  expect(provider.name).toBe('cashfree');
  expect(provider.merchantId).toBe('my-cf-app');
  expect(provider.environment).toBe('sandbox');

  vi.unstubAllEnvs();
});
