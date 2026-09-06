import { NextRequest, NextResponse } from 'next/server';
import { getOrderById, getActivePricing } from '@/lib/db';
import { getShopConfig } from '@/lib/config';
import { generateUpiDeepLink } from '@/lib/pricing';
import { isAdminRequest } from '@/lib/admin-auth';
import { hasOrderAccess } from '@/lib/order-access';

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

    const pricing = await getActivePricing();
    const shop = getShopConfig();
    const upiId = order.pricing_snapshot?.shop_upi_id || pricing.shop_upi_id || shop.upiId;
    const payeeName = order.pricing_snapshot?.shop_upi_name || pricing.shop_upi_name || shop.upiPayeeName;
    const upiLink = generateUpiDeepLink({
      upiId,
      payeeName,
      amount: order.total_amount,
      orderNumber: order.order_number,
      currency: order.currency,
    });

    return NextResponse.json({
      order: isAdmin ? order : customerOrderView(order),
      upiLink,
      upiId,
      payeeName,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve order' }, { status: 500 });
  }
}
