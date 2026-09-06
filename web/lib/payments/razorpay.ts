import { createHmac, timingSafeEqual } from 'crypto';

type RazorpayPayment = Record<string, unknown>;
type RazorpayPaymentLink = {
  id?: unknown;
  short_url?: unknown;
  reference_id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  currency?: unknown;
  status?: unknown;
  payments?: RazorpayPayment[] | null;
};

const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error('Online payments are not configured. Please try cash payment or contact the shop.');
  }
  return { keyId, keySecret };
}

function authorizationHeader() {
  const { keyId, keySecret } = credentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

function asMinorUnits(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount.');
  return Math.round(amount * 100);
}

function providerError(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback;
  const value = body as Record<string, unknown>;
  const error = value.error;
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).description === 'string') {
    return (error as Record<string, string>).description;
  }
  return typeof value.error === 'string' ? value.error : fallback;
}

function normalizeContact(phone?: string) {
  const normalized = String(phone || '').trim().replace(/[\s()-]/g, '');
  if (!normalized) return undefined;
  if (/^\d{10}$/.test(normalized)) return `+91${normalized}`;
  return normalized;
}

function capturedPaymentId(payments: RazorpayPayment[] | null | undefined) {
  if (!Array.isArray(payments)) return undefined;
  const captured = payments.find((payment) => String(payment.status || '').toLowerCase() === 'captured') || payments[0];
  return captured?.id ? String(captured.id) : undefined;
}

export function isRazorpayConfigured() {
  return Boolean(
    process.env.RAZORPAY_KEY_ID?.trim()
    && process.env.RAZORPAY_KEY_SECRET?.trim()
    && process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
  );
}

export async function createRazorpayUpiLink(input: {
  reference: string;
  orderId: string;
  amount: number;
  currency: string;
  customerName?: string;
  customerPhone?: string;
  returnUrl: string;
}) {
  if (input.reference.length > 40) throw new Error('Payment reference is too long.');
  const response = await fetch(`${RAZORPAY_API_URL}/payment_links`, {
    method: 'POST',
    headers: {
      authorization: authorizationHeader(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      upi_link: true,
      amount: asMinorUnits(input.amount),
      currency: input.currency,
      accept_partial: false,
      reference_id: input.reference,
      description: `QuickPrint ${input.reference}`,
      customer: {
        name: input.customerName?.trim() || 'QuickPrint customer',
        contact: normalizeContact(input.customerPhone),
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      // A short-lived link avoids a payment being made against an abandoned
      // document order much later. Expiry is enforced by Razorpay.
      expire_by: Math.floor(Date.now() / 1000) + (30 * 60),
      callback_url: input.returnUrl,
      callback_method: 'get',
      notes: {
        quickprint_payment_reference: input.reference,
        quickprint_order_id: input.orderId,
      },
    }),
  });
  const body = await response.json().catch(() => ({})) as RazorpayPaymentLink;
  if (!response.ok || !body.id || !body.short_url) {
    throw new Error(providerError(body, 'Unable to start the UPI payment. Please try again.'));
  }
  return {
    providerLinkId: String(body.id),
    paymentUrl: String(body.short_url),
  };
}

export function razorpayPaymentStatus(value: unknown): 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'PENDING' {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return 'SUCCESS';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'expired') return 'EXPIRED';
  return 'PENDING';
}

export async function fetchRazorpayLinkPayment(providerLinkId: string) {
  const response = await fetch(`${RAZORPAY_API_URL}/payment_links/${encodeURIComponent(providerLinkId)}`, {
    headers: { authorization: authorizationHeader() },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as RazorpayPaymentLink;
  if (!response.ok) throw new Error(providerError(body, 'Unable to check payment status.'));
  return {
    status: razorpayPaymentStatus(body.status),
    paymentReference: body.reference_id ? String(body.reference_id) : undefined,
    transactionId: capturedPaymentId(body.payments),
    amountMinor: Number(body.amount),
    amountPaidMinor: Number(body.amount_paid),
    currency: String(body.currency || 'INR'),
    raw: body,
  };
}

export function verifyRazorpayWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function toRazorpayMinorUnits(amount: number) {
  return asMinorUnits(amount);
}
