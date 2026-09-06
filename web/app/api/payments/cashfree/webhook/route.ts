import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { cashfreeStatus, verifyCashfreeWebhook } from '@/lib/payments/cashfree';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-webhook-timestamp');
  const signature = req.headers.get('x-webhook-signature');
  if (!verifyCashfreeWebhook(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 10 * 60 * 1000) {
    return NextResponse.json({ error: 'Expired webhook timestamp' }, { status: 400 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, any>;
    const data = payload.data || payload;
    const providerOrder = data.order || payload.order || {};
    const linkId = String(data.link_id || payload.link_id || '');
    const reference = String(linkId || data.link_notes?.payment_reference || payload.link_notes?.payment_reference || '');
    const status = cashfreeStatus(data.link_status || payload.link_status || providerOrder.order_status || data.order_status || payload.order_status || providerOrder.transaction_status);
    const transactionId = String(providerOrder.transaction_id || data.transaction_id || payload.transaction_id || data.cf_payment_id || providerOrder.order_id || '');
    const amount = Number(data.link_amount_paid ?? payload.link_amount_paid ?? providerOrder.order_amount ?? data.order_amount ?? payload.order_amount);
    const currency = String(data.link_currency || payload.link_currency || providerOrder.order_currency || data.order_currency || payload.order_currency || 'INR');
    const admin = getAdminClient();
    if (!admin) throw new Error('Payment database unavailable');

    let query = admin.from('payments').select('*');
    if (linkId) query = query.eq('provider_link_id', linkId);
    else if (reference) query = query.eq('payment_reference', reference);
    else return NextResponse.json({ error: 'Payment reference missing' }, { status: 400 });
    const { data: payment, error } = await query.maybeSingle();
    if (error || !payment) return NextResponse.json({ error: 'Unknown payment' }, { status: 404 });
    if (reference && payment.payment_reference !== reference) {
      return NextResponse.json({ error: 'Payment reference mismatch' }, { status: 400 });
    }

    if (status !== 'SUCCESS') {
      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
        await admin.from('payments').update({ status, provider_payload: payload }).eq('id', payment.id).neq('status', 'SUCCESS');
      }
      return NextResponse.json({ received: true });
    }
    if (!Number.isFinite(amount) || Number(amount.toFixed(2)) !== Number(Number(payment.amount).toFixed(2)) || currency !== payment.currency) {
      await admin.from('payments').update({ status: 'FAILED', provider_payload: payload }).eq('id', payment.id).neq('status', 'SUCCESS');
      return NextResponse.json({ error: 'Payment amount or currency mismatch' }, { status: 400 });
    }
    if (!transactionId) return NextResponse.json({ error: 'Transaction ID missing' }, { status: 400 });

    const { error: confirmError } = await admin.rpc('confirm_verified_payment', {
      p_payment_id: payment.id,
      p_transaction_id: transactionId,
      p_provider_payload: payload,
    });
    if (confirmError) throw confirmError;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Cashfree webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
