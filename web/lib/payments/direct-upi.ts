import QRCode from 'qrcode';
import { createHash } from 'node:crypto';
import { PaymentContext, PaymentProvider, VerifiedPayment, assertVerified } from './provider';

export interface UpiUriParams {
  upiId: string;
  payeeName: string;
  amount: number;
  orderNumber?: string;
  reference?: string;
  orderReference?: string;
}

/**
 * Generates an official NPCI standard UPI Payment URI.
 * Format: upi://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tr={ref}&tn={orderNote}
 */
export function generateUpiUri(params: UpiUriParams): string {
  const { upiId, payeeName, amount, orderNumber, reference, orderReference } = params;
  const cleanUpi = upiId.trim();
  const cleanName = payeeName.trim() || 'QuickPrint Shop';
  const cleanAmount = Number(amount).toFixed(2);
  const ref = reference?.trim() || orderReference?.trim() || orderNumber?.trim() || `QP_${Date.now()}`;
  const note = `QuickPrint Order ${orderNumber || orderReference || ref}`;

  const query = new URLSearchParams({
    pa: cleanUpi,
    pn: cleanName,
    am: cleanAmount,
    cu: 'INR',
    tr: ref,
    tn: note,
  });

  return `upi://pay?${query.toString()}`;
}

/**
 * Generates a high-contrast, high-resolution QR code data URL (PNG)
 * from a standard UPI URI.
 */
export async function generateDynamicQrDataUrl(upiUri: string): Promise<string> {
  return QRCode.toDataURL(upiUri, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * DirectUpiProvider:
 * Direct-to-shopkeeper UPI payment implementation.
 * Money flows directly to the shopkeeper's UPI VPA.
 * Provides modular verification hooks for admin confirmation and bank status webhooks.
 */
export class DirectUpiProvider implements PaymentProvider {
  readonly name = 'direct_upi';
  readonly merchantId: string;
  readonly environment: 'sandbox' | 'live';
  readonly fingerprint: string;
  private upiId: string;
  private payeeName: string;

  constructor(
    upiId: string = 'quickprint@upi',
    payeeName: string = 'QuickPrint Shop',
    environment: 'sandbox' | 'live' = 'live'
  ) {
    this.upiId = (upiId || 'quickprint@upi').trim();
    this.payeeName = (payeeName || 'QuickPrint Shop').trim();
    this.merchantId = this.upiId;
    this.environment = environment;
    this.fingerprint = createHash('sha256')
      .update(`${this.name}:${this.upiId}:${this.environment}`)
      .digest('hex');
  }

  generateUpiUri(params: UpiUriParams): string {
    return generateUpiUri(params);
  }

  generateDynamicQrDataUrl(upiUri: string): Promise<string> {
    return generateDynamicQrDataUrl(upiUri);
  }

  getUpiId(): string {
    return this.upiId;
  }

  getPayeeName(): string {
    return this.payeeName;
  }

  async createPayment(
    payment: PaymentContext,
    _returnUrl: string
  ): Promise<{ url: string; providerOrderId: string; upiUri?: string; qrDataUrl?: string }> {
    const upiUri = generateUpiUri({
      upiId: this.upiId,
      payeeName: this.payeeName,
      amount: payment.amount,
      reference: payment.payment_reference,
    });

    const qrDataUrl = await generateDynamicQrDataUrl(upiUri);

    return {
      url: upiUri,
      providerOrderId: payment.payment_reference,
      upiUri,
      qrDataUrl,
    };
  }

  async createDynamicQr(
    payment: PaymentContext,
    options?: { orderNumber?: string; shopName?: string; upiId?: string }
  ): Promise<{ qrString: string; qrDataUrl: string; providerOrderId: string }> {
    const upiId = options?.upiId?.trim() || this.upiId;
    const payeeName = options?.shopName?.trim() || this.payeeName;
    const upiUri = generateUpiUri({
      upiId,
      payeeName,
      amount: payment.amount,
      orderNumber: options?.orderNumber,
      reference: payment.payment_reference,
    });

    const qrDataUrl = await generateDynamicQrDataUrl(upiUri);

    return {
      qrString: upiUri,
      qrDataUrl,
      providerOrderId: payment.payment_reference,
    };
  }

  async createUpiIntent(
    payment: PaymentContext,
    options?: { orderNumber?: string; shopName?: string; upiId?: string }
  ): Promise<{ intentUrl: string; providerOrderId: string }> {
    const upiId = options?.upiId?.trim() || this.upiId;
    const payeeName = options?.shopName?.trim() || this.payeeName;
    const upiUri = generateUpiUri({
      upiId,
      payeeName,
      amount: payment.amount,
      orderNumber: options?.orderNumber,
      reference: payment.payment_reference,
    });

    return {
      intentUrl: upiUri,
      providerOrderId: payment.payment_reference,
    };
  }

  async getPaymentStatus(payment: PaymentContext): Promise<VerifiedPayment> {
    return {
      state: 'PENDING',
      provider: this.name,
      reference: payment.payment_reference,
      providerOrderId: payment.payment_reference,
      merchantId: this.merchantId,
      shopId: payment.shop_id,
      currency: 'INR',
      amountMinor: Math.round(Number(payment.amount) * 100),
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
    const raw = await req.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    const reference =
      data.reference ||
      data.merchantOrderId ||
      data.order_id ||
      data.txnRef ||
      data.tr ||
      '';

    return {
      reference,
      merchantId: this.merchantId,
      eventHash: createHash('sha256').update(raw || Date.now().toString()).digest('hex'),
    };
  }
}
