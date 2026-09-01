import { NextRequest, NextResponse } from 'next/server';
import { updateOrderStatus, getOrderById, getAllOrders } from '@/lib/db';
import { OrderStatus } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, action, reason } = body;

    if (!orderId || !action) {
      return NextResponse.json({ error: 'Order ID and action are required' }, { status: 400 });
    }

    let order = await getOrderById(orderId);
    
    // Robust fallback: search all orders by id or order_number
    if (!order) {
      const all = await getAllOrders();
      order = all.find(
        (o) =>
          o.id === orderId ||
          o.id.toLowerCase() === String(orderId).toLowerCase() ||
          o.order_number?.toUpperCase() === String(orderId).toUpperCase()
      ) || null;
    }

    const actualId = order ? order.id : orderId;
    let targetStatus: OrderStatus = order ? order.order_status : 'APPROVED';
    const extraData: Record<string, unknown> = {};

    switch (action) {
      case 'VERIFY_PAYMENT':
        extraData.payment_status = 'VERIFIED';
        break;

      case 'APPROVE_PRINT':
        targetStatus = 'APPROVED';
        extraData.payment_status = 'VERIFIED';
        extraData.approved_at = new Date().toISOString();
        break;

      case 'REJECT':
        targetStatus = 'REJECTED';
        extraData.payment_status = 'REJECTED';
        extraData.rejection_reason = reason || 'Payment or document rejected by shopkeeper';
        break;

      case 'CANCEL':
        targetStatus = 'CANCELLED';
        extraData.rejection_reason = reason || 'Order cancelled by shopkeeper';
        break;

      case 'RETRY_PRINT':
        targetStatus = 'APPROVED';
        extraData.failure_reason = null;
        break;

      case 'MARK_PRINTED':
        targetStatus = 'PRINTED';
        extraData.printed_at = new Date().toISOString();
        break;

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    const updated = await updateOrderStatus(actualId, targetStatus, 'ADMIN', extraData);

    return NextResponse.json({
      success: true,
      order: updated,
      message: `Action ${action} executed successfully`,
    });
  } catch (error) {
    console.error('Admin action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}
