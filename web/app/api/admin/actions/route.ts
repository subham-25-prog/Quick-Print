import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    if (body.action === 'CLEAR_HISTORY') {
      const shopId = getCurrentShopId();
      const db = database();

      const { data: orders, error: fetchErr } = await db
        .from('orders')
        .select('id, payment_id, uploaded_file_id')
        .eq('shop_id', shopId);

      if (fetchErr) throw fetchErr;

      if (orders && orders.length > 0) {
        for (const order of orders) {
          await db.from('print_jobs').delete().eq('order_id', order.id);
          if (order.payment_id) {
            await db.from('payments').update({ order_id: null }).eq('id', order.payment_id);
          }
          await db.from('order_events').delete().eq('order_id', order.id);
          await db.from('audit_logs').delete().eq('order_id', order.id);
          await db.from('orders').delete().eq('id', order.id);
          if (order.payment_id) {
            await db.from('payments').delete().eq('id', order.payment_id);
          }
          if (order.uploaded_file_id) {
            await db.from('uploaded_files').delete().eq('id', order.uploaded_file_id);
          }
        }
      }

      return NextResponse.json({ success: true, clearedCount: orders?.length || 0 });
    }

    const orderId = uuid(body.orderId);

    if (body.action === 'DELETE_ORDER') {
      const shopId = getCurrentShopId();
      const db = database();

      const { data: order, error: fetchErr } = await db
        .from('orders')
        .select('id, payment_id, uploaded_file_id')
        .eq('id', orderId)
        .eq('shop_id', shopId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (order) {
        await db.from('print_jobs').delete().eq('order_id', orderId);
        if (order.payment_id) {
          await db.from('payments').update({ order_id: null }).eq('id', order.payment_id);
        }
        await db.from('order_events').delete().eq('order_id', orderId);
        await db.from('audit_logs').delete().eq('order_id', orderId);
        await db.from('orders').delete().eq('id', orderId);
        if (order.payment_id) {
          await db.from('payments').delete().eq('id', order.payment_id);
        }
        if (order.uploaded_file_id) {
          await db.from('uploaded_files').delete().eq('id', order.uploaded_file_id);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (body.action !== 'RETRY_PRINT') {
      throw new HttpError(
        409,
        'Payment and print status are controlled by verification and the print agent.'
      );
    }

    const order = await getOrderById(orderId);
    if (!order) {
      throw new HttpError(404, 'Order not found.');
    }

    const { error } = await database().rpc('retry_safe_print', {
      p_shop_id: getCurrentShopId(),
      p_order_id: orderId,
    });

    if (error) {
      throw new HttpError(
        409,
        'Only a failure before dispatch can be retried. Check uncertain jobs at the printer.'
      );
    }

    const updatedOrder = await getOrderById(orderId);
    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error) {
    return apiError(error);
  }
}
