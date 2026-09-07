import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById, getAllOrders, updateOrderStatus } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { OrderStatus } from '@/types';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  try {
    requireSameOrigin(req);
    const body = (await readJson(req)) as { orderId?: string; action?: string; reason?: string };
    const { orderId, action, reason } = body;

    if (!orderId || !action) {
      throw new HttpError(400, 'Order ID and action are required');
    }

    let order = await getOrderById(orderId);
    if (!order) {
      const all = await getAllOrders();
      order = all.find(
        (o) =>
          o.id === orderId ||
          o.id.toLowerCase() === String(orderId).toLowerCase() ||
          o.order_number?.toUpperCase() === String(orderId).toUpperCase()
      ) || null;
    }

    if (!order) throw new HttpError(404, 'Order not found.');

    const actualId = order.id;
    let targetStatus: OrderStatus = order.order_status;
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

      case 'RETRY_PRINT': {
        targetStatus = 'APPROVED';
        extraData.payment_status = 'VERIFIED';
        extraData.approved_at = new Date().toISOString();
        extraData.printed_at = null;
        extraData.failure_reason = null;
        try {
          await database().rpc('retry_safe_print', { p_shop_id: getCurrentShopId(), p_order_id: actualId });
        } catch {}
        break;
      }

      case 'MARK_PRINTED':
        targetStatus = 'PRINTED';
        extraData.printed_at = new Date().toISOString();
        break;

      default:
        throw new HttpError(400, `Unsupported action: ${action}`);
    }

    const updated = await updateOrderStatus(actualId, targetStatus, 'ADMIN', extraData);

    return NextResponse.json({
      success: true,
      order: updated,
      message: `Action ${action} executed successfully`,
    });
  } catch (e) {
    return apiError(e);
  }
}
