import { NextRequest, NextResponse } from 'next/server';
import { updateOrderStatus, getOrderById, getAllOrders } from '@/lib/db';
import { OrderStatus } from '@/types';
import { adminUnauthorizedResponse, isAdminRequest } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
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

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const actualId = order.id;
    let targetStatus: OrderStatus = order.order_status;
    const extraData: Record<string, unknown> = {};
    let shouldQueuePrintJob = false;

    switch (action) {
      case 'VERIFY_PAYMENT':
        if (order.payment_method !== 'CASH') {
          return NextResponse.json({ error: 'Online UPI payments can only be confirmed by the verified payment provider.' }, { status: 409 });
        }
        targetStatus = 'APPROVED';
        extraData.payment_status = 'VERIFIED';
        extraData.approved_at = new Date().toISOString();
        shouldQueuePrintJob = true;
        break;

      case 'APPROVE_PRINT':
        if (order.payment_method === 'UPI') {
          return NextResponse.json({ error: 'Online UPI orders are queued automatically after provider verification.' }, { status: 409 });
        }
        if (order.payment_status !== 'VERIFIED') {
          return NextResponse.json({ error: 'Verify cash payment before sending this order to print.' }, { status: 409 });
        }
        targetStatus = 'APPROVED';
        extraData.approved_at = new Date().toISOString();
        shouldQueuePrintJob = true;
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
        if (!['PAID', 'VERIFIED'].includes(order.payment_status)) {
          return NextResponse.json({ error: 'Only paid or cash-verified orders can be retried.' }, { status: 409 });
        }
        targetStatus = 'CONFIRMED';
        extraData.printed_at = null;
        extraData.failure_reason = null;
        {
          const { getAdminClient } = await import('@/lib/supabase/admin');
          const admin = getAdminClient();
          if (admin) {
            const { error } = await admin.from('print_jobs')
              .update({ status: 'PENDING', attempts: 0, claimed_by: null, claimed_at: null, error_message: null, printed_at: null })
              .eq('order_id', actualId);
            if (error) throw error;
          }
        }
        break;

      case 'MARK_PRINTED':
        targetStatus = 'PRINTED';
        extraData.printed_at = new Date().toISOString();
        break;

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    const updated = await updateOrderStatus(actualId, targetStatus, 'ADMIN', extraData);
    if (shouldQueuePrintJob) {
      const { getAdminClient } = await import('@/lib/supabase/admin');
      const admin = getAdminClient();
      if (admin) {
        const { error } = await admin.from('print_jobs')
          .upsert({ order_id: actualId, status: 'PENDING', attempts: 0 }, { onConflict: 'order_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    }

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
