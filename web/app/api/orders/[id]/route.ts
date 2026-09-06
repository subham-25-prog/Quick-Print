import { NextRequest, NextResponse } from 'next/server';
import { getOrderById } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { hasOrderAccess } from '@/lib/order-access';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCurrentShopId } from '@/lib/shop';

function customerOrderView(order: Awaited<ReturnType<typeof getOrderById>>) {
  if (!order) return null;
  const {
    id, order_number, created_at, file_name, file_type, page_count, paper_size, color_mode,
    print_sides, copies, total_amount, currency, payment_method, payment_status, order_status,
    rejection_reason, failure_reason,
  } = order;
  return {
    id, order_number, created_at, file_name, file_type, page_count, paper_size, color_mode,
    print_sides, copies, total_amount, currency, payment_method, payment_status, order_status,
    rejection_reason, failure_reason,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isAdmin = isAdminRequest(req);
    if (!isAdmin && !hasOrderAccess(req, id)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    let paymentUrl: string | undefined;
    if (!isAdmin && order.payment_method === 'UPI' && order.order_status === 'PAYMENT_VERIFICATION_PENDING') {
      const admin = getAdminClient();
      const shopId = getCurrentShopId();
      const { data: payment } = admin
        ? await admin.from('payments').select('payment_url, status').eq('order_id', order.id).eq('shop_id', shopId).maybeSingle()
        : { data: null };
      if (payment?.status === 'PENDING' && payment.payment_url) paymentUrl = payment.payment_url;
    }

    return NextResponse.json({
      order: isAdmin ? order : customerOrderView(order),
      paymentUrl,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve order' }, { status: 500 });
  }
}
