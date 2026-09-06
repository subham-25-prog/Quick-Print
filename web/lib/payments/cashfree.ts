import { createHmac, timingSafeEqual } from 'crypto';

const apiVersion = '2025-01-01';

function credentials() {
  const clientId = process.env.CASHFREE_CLIENT_ID?.trim();
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Online payments are not configured. Please try cash payment or contact the shop.');
  return { clientId, clientSecret };
}

function baseUrl() {
  return process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export function isCashfreeConfigured() {
  return Boolean(process.env.CASHFREE_CLIENT_ID?.trim() && process.env.CASHFREE_CLIENT_SECRET?.trim());
}

export async function createCashfreeUpiLink(input: {
  reference: string;
  amount: number;
  currency: string;
  customerName?: string;
  customerPhone?: string;
  returnUrl: string;
  notifyUrl: string;
}) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${baseUrl()}/links`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-version': apiVersion,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      'x-idempotency-key': input.reference,
    },
    body: JSON.stringify({
      link_id: input.reference,
      link_amount: Number(input.amount.toFixed(2)),
      link_currency: input.currency,
      link_purpose: `QuickPrint ${input.reference}`,
      link_partial_payments: false,
      link_auto_reminders: false,
      customer_details: {
        customer_name: input.customerName || 'QuickPrint customer',
        // Cashfree requires a phone number. A server-side placeholder is never
        // used because it would send the link to the wrong person.
        customer_phone: input.customerPhone || undefined,
      },
      link_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
      link_notify: { send_sms: false, send_email: false },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.link_url || !body?.link_id) {
    throw new Error(body?.message || 'Unable to start the UPI payment. Please try again.');
  }
  return { providerLinkId: String(body.link_id), paymentUrl: String(body.link_url), expiresAt: body.link_expiry_time as string | undefined };
}

export async function fetchCashfreeLinkPayment(providerLinkId: string) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${baseUrl()}/links/${encodeURIComponent(providerLinkId)}/orders`, {
    headers: {
      'x-api-version': apiVersion,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || 'Unable to check payment status.');
  const paidOrder = Array.isArray(body?.orders)
    ? body.orders.find((order: Record<string, unknown>) => cashfreeStatus(order.order_status) === 'SUCCESS')
    : undefined;
  if (!paidOrder) return { status: 'PENDING' as const, raw: body };
  return {
    status: 'SUCCESS' as const,
    transactionId: String(paidOrder.order_id || paidOrder.transaction_id || ''),
    amount: Number(paidOrder.order_amount),
    currency: String(paidOrder.order_currency || 'INR'),
    raw: body,
  };
}

export function verifyCashfreeWebhook(rawBody: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET?.trim() || process.env.CASHFREE_CLIENT_SECRET?.trim();
  if (!secret || !timestamp || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function cashfreeStatus(value: unknown): 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'PENDING' {
  const status = String(value || '').toUpperCase();
  if (['PAID', 'SUCCESS'].includes(status)) return 'SUCCESS';
  if (['FAILED', 'FAILURE'].includes(status)) return 'FAILED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'EXPIRED') return 'EXPIRED';
  return 'PENDING';
}
