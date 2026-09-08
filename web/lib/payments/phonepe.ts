import { createHash, timingSafeEqual } from 'node:crypto';
import { readText } from '../http';
import {
  PaymentContext,
  PaymentProvider,
  VerifiedPayment,
  assertVerified,
} from './provider';

// Source contracts: docs/MERCHANT_PROVIDER_SETUP.md (PhonePe v2, checked 2026-09-07).
export class PhonePeProvider implements PaymentProvider {
  readonly name = 'phonepe';
  readonly fingerprint: string;
  private token?: { value: string; expires: number };
  private baseUrl: string;

  constructor(
    readonly merchantId: string,
    readonly environment: 'sandbox' | 'live',
    private clientId: string,
    private clientVersion: string,
    private clientSecret: string,
    private webhookUser: string,
    private webhookPassword: string,
    private transport: typeof fetch = fetch
  ) {
    this.baseUrl =
      environment === 'live'
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    this.fingerprint = createHash('sha256')
      .update(`${clientId}:${clientVersion}:${environment}`)
      .digest('hex');
  }

  private async authorization(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60000) {
      return this.token.value;
    }

    const tokenUrl =
      this.environment === 'live'
        ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
        : `${this.baseUrl}/v1/oauth/token`;

    const response = await this.transport(tokenUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_version: this.clientVersion,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      throw new Error('Provider authentication unavailable');
    }

    const data = await response.json();
    if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_at)) {
      throw new Error('Invalid provider authorization');
    }

    this.token = {
      value: data.access_token,
      expires: data.expires_at * 1000,
    };

    return data.access_token;
  }

  private async call(path: string, body?: object) {
    const token = await this.authorization();
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `O-Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.token = undefined;
      }
      throw new Error('Provider request unavailable');
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
      throw new Error('PhonePe requires at least INR 1');
    }

    const data = await this.call('/checkout/v2/pay', {
      merchantOrderId: payment.payment_reference,
      amount: amountMinor,
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: returnUrl },
      },
      metaInfo: {
        udf1: payment.shop_id,
        udf2: payment.id,
        udf3: this.merchantId,
        udf4: this.fingerprint,
      },
    });

    const paymentUrl = new URL(data.redirectUrl);
    if (
      paymentUrl.protocol !== 'https:' ||
      paymentUrl.username ||
      paymentUrl.password ||
      !(paymentUrl.hostname === 'phonepe.com' || paymentUrl.hostname.endsWith('.phonepe.com'))
    ) {
      throw new Error('Invalid provider payment URL');
    }

    if (typeof data.orderId !== 'string' || !data.orderId) {
      throw new Error('Missing provider order');
    }

    return {
      url: paymentUrl.href,
      providerOrderId: data.orderId,
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

    const data = await this.call(
      `/checkout/v2/order/${encodeURIComponent(payment.payment_reference)}/status?details=true`
    );

    if (!['COMPLETED', 'FAILED', 'PENDING'].includes(data.state) || !Number.isSafeInteger(data.amount)) {
      throw new Error('Invalid provider status');
    }

    // Status is scoped by merchant OAuth credentials. PhonePe v2 defines amounts
    // in INR paisa; it does not supply a currency/merchant field on every status.
    // Metadata plus stored provider order ID bind this response to this checkout.
    const meta = data.metaInfo;
    if (
      meta?.udf1 !== payment.shop_id ||
      meta?.udf2 !== payment.id ||
      meta?.udf3 !== this.merchantId ||
      meta?.udf4 !== this.fingerprint ||
      (data.merchantId && data.merchantId !== this.merchantId) ||
      (data.currency && data.currency !== 'INR') ||
      (payment.provider_link_id && data.orderId !== payment.provider_link_id)
    ) {
      throw new Error('Provider order identity mismatch');
    }

    const completedPayments = (data.paymentDetails || []).filter(
      (detail: { state: string }) => detail.state === 'COMPLETED'
    );

    if (
      data.state === 'COMPLETED' &&
      (completedPayments.length !== 1 || completedPayments[0].amount !== data.amount)
    ) {
      throw new Error('Ambiguous provider payment');
    }

    return {
      state: data.state === 'COMPLETED' ? 'SUCCESS' : data.state === 'FAILED' ? 'FAILED' : 'PENDING',
      provider: this.name,
      reference: payment.payment_reference,
      providerOrderId: data.orderId,
      merchantId: this.merchantId,
      shopId: payment.shop_id,
      currency: 'INR',
      amountMinor: data.amount,
      transactionId: completedPayments[0]?.transactionId,
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
    // Select SHA username/password authentication in the PhonePe dashboard.
    const expected = createHash('sha256')
      .update(`${this.webhookUser}:${this.webhookPassword}`)
      .digest('hex');
    const supplied = req.headers.get('authorization') || '';

    if (
      !this.webhookUser ||
      !this.webhookPassword ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      throw new Error('Invalid webhook authentication');
    }

    const raw = await readText(req, 65536);
    const data = JSON.parse(raw);

    if (
      !['checkout.order.completed', 'checkout.order.failed'].includes(data.event) ||
      data.payload?.merchantId !== this.merchantId ||
      !/^[A-Za-z0-9_-]{1,63}$/.test(data.payload?.merchantOrderId || '')
    ) {
      throw new Error('Invalid webhook identity');
    }

    // Authenticate/store notification only. Every success is independently fetched
    // from the provider API; replayed or modified notification bodies cannot pay.
    return {
      reference: data.payload.merchantOrderId,
      merchantId: this.merchantId,
      eventHash: createHash('sha256').update(raw).digest('hex'),
    };
  }
}
