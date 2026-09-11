import { PaymentContext, PaymentProvider, VerifiedPayment } from './provider';

export interface DirectUpiConfig {
  upiId: string;
  payeeName: string;
  testAmount?: number;
  environment?: 'sandbox' | 'live';
}

export class DirectUpiProvider implements PaymentProvider {
  readonly name = 'direct_upi';
  readonly merchantId: string;
  readonly environment: 'sandbox' | 'live';
  readonly fingerprint: string;
  readonly upiId: string;
  readonly payeeName: string;
  readonly testAmount: number;

  constructor(
    upiId = 'wbs.erf@icici',
    payeeName = 'West Bengal State Emergency Relief Fund',
    testAmount = 1,
    environment: 'sandbox' | 'live' = 'sandbox'
  ) {
    this.upiId = upiId.trim();
    this.payeeName = payeeName.trim();
    this.testAmount = testAmount;
    this.merchantId = this.upiId;
    this.environment = environment;
    this.fingerprint = `upi_${this.upiId}_${this.environment}`;
  }

  /**
   * Generates standard upi://pay URI according to NPCI UPI specification.
   * Parameters:
   * pa: Payee UPI ID (VPA)
   * pn: Payee Name
   * am: Amount (₹1 in test mode)
   * cu: Currency (INR)
   * tn: Transaction Note (QuickPrint Test <Order-ID>)
   * tr: Transaction Reference (QuickPrint Order ID)
   */
  generateUpiUri(orderNumber: string, amount: number = this.testAmount): string {
    const note = `QuickPrint Test ${orderNumber}`;
    const params = new URLSearchParams({
      pa: this.upiId,
      pn: this.payeeName,
      am: String(amount),
      cu: 'INR',
      tn: note,
      tr: orderNumber,
    });
    return `upi://pay?${params.toString()}`;
  }

  async createPayment(
    payment: PaymentContext,
    _returnUrl: string
  ): Promise<{ url: string; providerOrderId: string }> {
    const orderNumber = payment.payment_reference;
    const upiUri = this.generateUpiUri(orderNumber, this.testAmount);
    return {
      url: upiUri,
      providerOrderId: orderNumber,
    };
  }

  async getPaymentStatus(payment: PaymentContext): Promise<VerifiedPayment> {
    return this.verifyPayment(payment);
  }

  /**
   * Important payment-status rule:
   * Do NOT fake payment success.
   * Do NOT mark the order PAID simply because:
   * - the UPI app opened
   * - the customer returned to QuickPrint
   * - the URI returned a SUCCESS value
   * - the customer clicked "I Paid"
   *
   * Automatic printing must remain disabled until a trusted bank/PSP transaction-status API is connected.
   */
  async verifyPayment(payment: PaymentContext): Promise<VerifiedPayment> {
    return {
      state: 'PENDING',
      provider: this.name,
      reference: payment.payment_reference,
      providerOrderId: payment.provider_link_id || payment.payment_reference,
      merchantId: this.merchantId,
      shopId: payment.shop_id,
      amountMinor: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,
      environment: this.environment,
      fingerprint: this.fingerprint,
    };
  }

  async handleWebhook(): Promise<{ reference: string; merchantId: string; eventHash: string }> {
    throw new Error('Direct UPI does not use standard PG webhooks. Connect a trusted bank API for webhooks.');
  }
}

/**
 * Architectural function ready for future server-side trusted bank/PSP confirmation:
 * verifyPayment(orderId, transactionReference)
 *
 * Only after a trusted server-side confirmation returns SUCCESS should production QuickPrint eventually perform:
 * PAYMENT_PENDING -> PAID -> QUEUED -> PRINTING -> COMPLETED
 */
export async function verifyPayment(
  _orderId: string,
  _transactionReference: string
): Promise<{ success: boolean; state: 'PENDING' | 'SUCCESS' | 'FAILED' }> {
  // Architecture placeholder: Once a bank webhook or PSP status API (e.g. Setu, Decentro, ICICI Eazypay)
  // is connected, query and verify the bank transaction status here.
  return {
    success: false,
    state: 'PENDING',
  };
}
