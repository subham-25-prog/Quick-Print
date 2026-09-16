import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readText } from '../http';
import {
  PaymentContext,
  PaymentProvider,
  VerifiedPayment,
  assertVerified,
} from './provider';

// Source contracts: Cashfree PG API v2023-08-01 / PG Payment Links
export class CashfreeProvider implements PaymentProvider {
  readonly name = 'cashfree';
  readonly fingerprint: string;
  readonly merchantId: string;
  readonly environment: 'sandbox' | 'live';
  private secretKey: string;
  private apiVersion: string;
  private transport: typeof fetch;
  private baseUrl: string;

  constructor(
    merchantId: string,
    environment: 'sandbox' | 'live',
    secretKey: string,
    apiVersion = '2023-08-01',
    transport: typeof fetch = fetch
  ) {
    this.merchantId = merchantId.trim();
    this.environment = environment;
    this.secretKey = secretKey.trim();
    this.apiVersion = apiVersion.trim();
    this.transport = transport;

    this.baseUrl =
      environment === 'live'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    this.fingerprint = createHash('sha256')
      .update(`${this.merchantId}:${this.environment}`)
      .digest('hex');
  }

  private async call(path: string, options: { method?: string; body?: object } = {}) {
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method: options.method || (options.body ? 'POST' : 'GET'),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.merchantId,
        'x-client-secret': this.secretKey,
        'x-api-version': this.apiVersion,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Provider request unavailable (${response.status})`);
    }

    return response.json();
  }

  async createPayment(
    payment: PaymentContext,
    returnUrl: string
  ): Promise<{ url: string; providerOrderId: string }> {
    if (
      payment.provider !== this.name ||
      payment.merchant_id !== this.merchantId ||
      payment.environment !== this.environment ||
      payment.credential_fingerprint !== this.fingerprint
    ) {
      throw new Error('Merchant configuration mismatch');
    }

    const amountMinor = Math.round(Number(payment.amount) * 100);
    if (payment.currency !== 'INR' || amountMinor < 100 || !Number.isSafeInteger(amountMinor)) {
      throw new Error('Cashfree requires at least INR 1');
    }

    // Cashfree link_id max 50 characters; letters, numbers, underscores, hyphens
    const linkId = payment.payment_reference;
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(linkId)) {
      throw new Error('Invalid payment reference format');
    }

    const data = await this.call('/links', {
      method: 'POST',
      body: {
        link_id: linkId,
        link_amount: Number(payment.amount.toFixed(2)),
        link_currency: 'INR',
        link_purpose: `QuickPrint Order ${payment.id.slice(0, 8)}`,
        customer_details: {
          customer_phone: '9999999999',
          customer_name: 'QuickPrint Customer',
        },
        link_meta: {
          return_url: returnUrl,
          upi_intent: true,
        },
        link_notes: {
          udf1: payment.shop_id,
          udf2: payment.id,
          udf3: this.merchantId,
          udf4: this.fingerprint,
        },
      },
    });

    if (!data.link_url || typeof data.link_url !== 'string') {
      throw new Error('Invalid provider payment URL');
    }

    const paymentUrl = new URL(data.link_url);
    if (
      paymentUrl.protocol !== 'https:' ||
      paymentUrl.username ||
      paymentUrl.password ||
      !(
        paymentUrl.hostname === 'cashfree.com' ||
        paymentUrl.hostname.endsWith('.cashfree.com')
      )
    ) {
      throw new Error('Invalid provider payment URL domain');
    }

    const providerOrderId = String(data.cf_link_id || data.link_id);
    if (!providerOrderId) {
      throw new Error('Missing provider order ID');
    }

    return {
      url: paymentUrl.href,
      providerOrderId,
    };
  }

  async getPaymentStatus(payment: PaymentContext): Promise<VerifiedPayment> {
    if (
      payment.provider !== this.name ||
      payment.merchant_id !== this.merchantId ||
      payment.credential_fingerprint !== this.fingerprint ||
      payment.environment !== this.environment
    ) {
      throw new Error('Merchant configuration changed');
    }

    const data = await this.call(`/links/${encodeURIComponent(payment.payment_reference)}`);

    if (
      !['ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'].includes(data.link_status) ||
      typeof data.link_amount !== 'number'
    ) {
      throw new Error('Invalid provider status response');
    }

    // Validate metadata binding
    const notes = data.link_notes || {};
    const metaShopId = typeof notes.udf1 === 'string' ? notes.udf1.trim() : notes.udf1;
    const metaPaymentId = typeof notes.udf2 === 'string' ? notes.udf2.trim() : notes.udf2;
    const metaMerchantId = typeof notes.udf3 === 'string' ? notes.udf3.trim() : notes.udf3;
    const metaFingerprint = typeof notes.udf4 === 'string' ? notes.udf4.trim() : notes.udf4;

    if (
      metaShopId !== payment.shop_id ||
      metaPaymentId !== payment.id ||
      metaMerchantId !== this.merchantId ||
      metaFingerprint !== this.fingerprint ||
      (data.link_currency && data.link_currency !== 'INR') ||
      (payment.provider_link_id &&
        String(data.cf_link_id) !== payment.provider_link_id &&
        String(data.link_id) !== payment.provider_link_id)
    ) {
      throw new Error('Provider order identity mismatch');
    }

    const amountMinor = Math.round(Number(data.link_amount) * 100);
    const expectedMinor = Math.round(Number(payment.amount) * 100);
    if (amountMinor !== expectedMinor) {
      throw new Error('Provider amount mismatch');
    }

    if (data.link_status === 'PAID') {
      let transactionId: string | undefined;

      try {
        const orders = await this.call(`/links/${encodeURIComponent(payment.payment_reference)}/orders`);
        if (Array.isArray(orders) && orders.length > 0) {
          const paidOrder = orders.find((o: any) => o.order_status === 'PAID') || orders[0];
          if (paidOrder?.order_id) {
            const payments = await this.call(`/orders/${encodeURIComponent(paidOrder.order_id)}/payments`);
            if (Array.isArray(payments) && payments.length > 0) {
              const successful = payments.find((p: any) => p.payment_status === 'SUCCESS') || payments[0];
              if (successful?.cf_payment_id) {
                transactionId = String(successful.cf_payment_id);
              }
            }
          }
        }
      } catch (err) {
        // Fallback: If orders/payments sub-query is unavailable, use cf_link_id as reference if marked PAID
        console.warn('Could not fetch child order payments:', err);
      }

      if (!transactionId) {
        transactionId = String(data.cf_link_id || `CF_${payment.payment_reference}`);
      }

      return {
        state: 'SUCCESS',
        provider: this.name,
        reference: payment.payment_reference,
        providerOrderId: String(data.cf_link_id || data.link_id),
        merchantId: this.merchantId,
        shopId: payment.shop_id,
        currency: 'INR',
        amountMinor,
        transactionId,
        environment: this.environment,
        fingerprint: this.fingerprint,
      };
    }

    const state = ['EXPIRED', 'CANCELLED'].includes(data.link_status) ? 'FAILED' : 'PENDING';

    return {
      state,
      provider: this.name,
      reference: payment.payment_reference,
      providerOrderId: String(data.cf_link_id || data.link_id),
      merchantId: this.merchantId,
      shopId: payment.shop_id,
      currency: 'INR',
      amountMinor,
      environment: this.environment,
      fingerprint: this.fingerprint,
    };
  }

  async verifyPayment(payment: PaymentContext): Promise<VerifiedPayment> {
    const result = await this.getPaymentStatus(payment);
    assertVerified(payment, result);
    return result;
  }

  async handleWebhook(
    req: Request
  ): Promise<{ reference: string; merchantId: string; eventHash: string }> {
    const raw = await readText(req, 65536);
    const signature = req.headers.get('x-webhook-signature')?.trim() || '';
    const timestamp = req.headers.get('x-webhook-timestamp')?.trim() || '';

    if (!signature || !timestamp) {
      throw new Error('Missing webhook signature or timestamp');
    }

    // Replay attack prevention: timestamp must be within 10 minutes
    const tsNum = Number(timestamp);
    if (Number.isFinite(tsNum)) {
      const diffMs = Math.abs(Date.now() - (tsNum > 1e11 ? tsNum : tsNum * 1000));
      if (diffMs > 600000) {
        throw new Error('Webhook timestamp expired');
      }
    }

    // Cashfree signature verification: HMAC-SHA256 of (timestamp + rawBody) using secretKey
    const signatureData = timestamp + raw;
    const expected = createHmac('sha256', this.secretKey)
      .update(signatureData)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const suppliedBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== suppliedBuf.length ||
      !timingSafeEqual(expectedBuf, suppliedBuf)
    ) {
      throw new Error('Invalid webhook signature');
    }

    let data: any;
    try {
      data = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    // Accept webhook registration probe / test events
    if (
      !data.type ||
      ['TEST_PROBE', 'test', 'ping', 'check', 'validation'].includes(data.type) ||
      data.data?.order?.order_id === 'test' ||
      data.data?.link?.link_id === 'test'
    ) {
      return {
        reference: 'TEST_PROBE',
        merchantId: this.merchantId,
        eventHash: createHash('sha256').update(raw || 'probe').digest('hex'),
      };
    }

    // Extract reference from Cashfree payload
    const reference =
      data.data?.link?.link_id ||
      data.data?.order?.order_id ||
      data.data?.payment?.order_id ||
      '';

    if (!reference || !/^[A-Za-z0-9_-]{1,63}$/.test(reference)) {
      throw new Error('Invalid webhook reference');
    }

    return {
      reference,
      merchantId: this.merchantId,
      eventHash: createHash('sha256').update(raw).digest('hex'),
    };
  }
}
