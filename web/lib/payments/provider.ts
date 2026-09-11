export type PaymentState = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentContext {
  id: string;
  shop_id: string;
  payment_reference: string;
  amount: number;
  currency: string;
  provider: string;
  merchant_id: string;
  environment: 'sandbox' | 'live';
  credential_fingerprint: string;
  provider_link_id?: string;
}

export interface VerifiedPayment {
  state: PaymentState;
  provider: string;
  reference: string;
  providerOrderId: string;
  merchantId: string;
  shopId: string;
  amountMinor: number;
  currency: string;
  environment: string;
  fingerprint: string;
  transactionId?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly merchantId: string;
  readonly environment: 'sandbox' | 'live';
  readonly fingerprint: string;

  createPayment(
    payment: PaymentContext,
    returnUrl: string
  ): Promise<{ url: string; providerOrderId: string; upiUri?: string; qrDataUrl?: string }>;

  createDynamicQr?(
    payment: PaymentContext,
    options?: { orderNumber?: string; shopName?: string; upiId?: string }
  ): Promise<{ qrString: string; qrDataUrl: string; providerOrderId: string }>;

  createUpiIntent?(
    payment: PaymentContext,
    options?: { orderNumber?: string; shopName?: string; upiId?: string }
  ): Promise<{ intentUrl: string; providerOrderId: string }>;

  getPaymentStatus(payment: PaymentContext): Promise<VerifiedPayment>;

  verifyPayment(payment: PaymentContext): Promise<VerifiedPayment>;

  handleWebhook(
    req: Request
  ): Promise<{ reference: string; merchantId: string; eventHash: string }>;
}

export function assertVerified(payment: PaymentContext, result: VerifiedPayment) {
  if (
    result.state !== 'SUCCESS' ||
    result.provider !== payment.provider ||
    result.reference !== payment.payment_reference ||
    result.merchantId !== payment.merchant_id ||
    result.shopId !== payment.shop_id ||
    result.currency !== payment.currency ||
    result.environment !== payment.environment ||
    result.fingerprint !== payment.credential_fingerprint ||
    result.amountMinor !== Math.round(Number(payment.amount) * 100) ||
    !result.transactionId ||
    (payment.provider_link_id && result.providerOrderId !== payment.provider_link_id)
  ) {
    throw new Error('Payment verification mismatch');
  }
}
