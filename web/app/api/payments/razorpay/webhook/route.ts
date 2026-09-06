import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  razorpayPaymentStatus,
  toRazorpayMinorUnits,
  verifyRazorpayWebhook,
} from '@/lib/payments/razorpay';

export const dynamic = 'force-dynamic';

type RazorpayEntity = Record<string, unknown>;

export async function POST(req: NextRequest) {
  // Razorpay signs the untouched body. Reading JSON before verification would
  // allow formatting changes to invalidate (or bypass) the signature check.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  if (!verifyRazorpayWebhook(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody) as { event?: unknown; payload?: Record<string, { entity?: RazorpayEntity }> };
    const eventName = String(event.event || '');
    const link = event.payload?.payment_link?.entity;
    const providerPayment = event.payload?.payment?.entity;
    if (!link?.id) return NextResponse.json({ error: 'Payment link missing from webhook' }, { status: 400 });

    const linkId = String(link.id);
    const reference = link.reference_id ? String(link.reference_id) : '';
    const admin = getAdminClient();
    if (!admin) throw new Error('Payment database unavailable');
    const { data: payment, error } = await admin.from('payments').select('*').eq('provider_link_id', linkId).maybeSingle();
    if (error || !payment || payment.provider !== 'razorpay') {
      return NextResponse.json({ error: 'Unknown payment link' }, { status: 404 });
    }
    if (!reference || reference !== payment.payment_reference) {
      return NextResponse.json({ error: 'Payment reference mismatch' }, { status: 400 });
    }

    if (eventName !== 'payment_link.paid') {
      const status = razorpayPaymentStatus(link.status);
      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(status)) {
        await admin.from('payments')
          .update({ status, provider_payload: event })
          .eq('id', payment.id)
          .neq('status', 'SUCCESS');
      }
      return NextResponse.json({ received: true });
    }

    const amountMinor = Number(link.amount);
    const amountPaidMinor = Number(link.amount_paid);
    const paymentAmountMinor = Number(providerPayment?.amount);
    const currency = String(link.currency || '');
    const transactionId = providerPayment?.id ? String(providerPayment.id) : '';
    if (
      razorpayPaymentStatus(link.status) !== 'SUCCESS'
      || String(providerPayment?.status || '').toLowerCase() !== 'captured'
      || !transactionId
      || !Number.isFinite(amountMinor)
      || amountMinor !== toRazorpayMinorUnits(Number(payment.amount))
      || amountPaidMinor !== amountMinor
      || paymentAmountMinor !== amountMinor
      || currency !== payment.currency
    ) {
      await admin.from('payments')
        .update({ status: 'FAILED', provider_payload: event })
        .eq('id', payment.id)
        .neq('status', 'SUCCESS');
      return NextResponse.json({ error: 'Payment amount, currency, or capture mismatch' }, { status: 400 });
    }

    const { error: confirmError } = await admin.rpc('confirm_verified_payment', {
      p_payment_id: payment.id,
      p_transaction_id: transactionId,
      p_provider_payload: event,
    });
    if (confirmError) throw confirmError;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
