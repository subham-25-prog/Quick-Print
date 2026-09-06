import { NextRequest, NextResponse } from 'next/server';
import { getOrderById } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';
import { sbiEpayNotReadyMessage } from '@/lib/payments/sbiepay';
import { hasOrderAccess } from '@/lib/order-access';
import { getCurrentShopId } from '@/lib/shop';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasOrderAccess(req, id)) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  try {
    const order = await getOrderById(id);
    if (!order || order.payment_method !== 'UPI') return NextResponse.json({ error: 'Online payment not found' }, { status: 404 });
    const admin = getAdminClient();
    if (!admin) throw new Error('Payment database unavailable');
    const { data: payment, error } = await admin.from('payments').select('*').eq('order_id', id).eq('shop_id', getCurrentShopId()).maybeSingle();
    if (error || !payment) return NextResponse.json({ error: 'Payment session not found' }, { status: 404 });
    if (payment.status === 'SUCCESS') return NextResponse.json({ status: 'SUCCESS', orderId: id });
    if (payment.provider !== 'sbiepay') {
      return NextResponse.json({ error: 'This legacy payment cannot be verified after the payment provider change.' }, { status: 409 });
    }
    return NextResponse.json({ error: sbiEpayNotReadyMessage() }, { status: 503 });
  } catch (error) {
    console.error('Payment status verification error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 502 });
  }
}
