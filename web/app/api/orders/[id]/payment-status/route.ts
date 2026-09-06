import { NextRequest, NextResponse } from 'next/server';
import { getOrderById } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';
import { fetchRazorpayLinkPayment, toRazorpayMinorUnits } from '@/lib/payments/razorpay';
import { hasOrderAccess } from '@/lib/order-access';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasOrderAccess(req, id)) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  try {
    const order = await getOrderById(id);
    if (!order || order.payment_method !== 'UPI') return NextResponse.json({ error: 'Online payment not found' }, { status: 404 });
    const admin = getAdminClient();
    if (!admin) throw new Error('Payment database unavailable');
    const { data: payment, error } = await admin.from('payments').select('*').eq('order_id', id).maybeSingle();
    if (error || !payment) return NextResponse.json({ error: 'Payment session not found' }, { status: 404 });
    if (payment.status === 'SUCCESS') return NextResponse.json({ status: 'SUCCESS', orderId: id });
    if (!payment.provider_link_id) return NextResponse.json({ status: payment.status });

    if (payment.provider !== 'razorpay') return NextResponse.json({ error: 'Payment provider is not supported for this order.' }, { status: 409 });
    const result = await fetchRazorpayLinkPayment(payment.provider_link_id);
    if (result.status !== 'SUCCESS') return NextResponse.json({ status: payment.status === 'PENDING' ? 'PENDING' : payment.status });
    if (
      result.paymentReference !== payment.payment_reference
      || !Number.isFinite(result.amountMinor)
      || result.amountMinor !== toRazorpayMinorUnits(Number(payment.amount))
      || result.amountPaidMinor !== result.amountMinor
      || result.currency !== payment.currency
      || !result.transactionId
    ) {
      return NextResponse.json({ error: 'Payment verification mismatch' }, { status: 409 });
    }
    const { error: confirmError } = await admin.rpc('confirm_verified_payment', {
      p_payment_id: payment.id,
      p_transaction_id: result.transactionId,
      p_provider_payload: { source: 'razorpay_status_check', data: result.raw },
    });
    if (confirmError) throw confirmError;
    return NextResponse.json({ status: 'SUCCESS', orderId: id });
  } catch (error) {
    console.error('Payment status verification error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 502 });
  }
}
