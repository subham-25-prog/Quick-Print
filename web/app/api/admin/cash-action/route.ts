import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const orderId = uuid(body.orderId);
    const action = body.action === 'REJECT' ? 'REJECT' : 'ACCEPT';
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined;

    const db = database();
    const shopId = getCurrentShopId();

    const order = await getOrderById(orderId);
    if (!order) {
      throw new HttpError(404, 'Order not found.');
    }

    if (order.shop_id !== shopId) {
      throw new HttpError(403, 'Order does not belong to current shop.');
    }

    if (action === 'ACCEPT') {
      let rpcSuccess = false;
      if (typeof db.rpc === 'function') {
        const { error: rpcErr } = await db.rpc('verify_cash_order', {
          p_shop_id: shopId,
          p_order_id: orderId,
        });
        if (!rpcErr) {
          rpcSuccess = true;
        } else if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn('verify_cash_order RPC error, falling back to client queries:', rpcErr);
        }
      }

      if (!rpcSuccess) {
        if (order.payment_id) {
          await db
            .from('payments')
            .update({
              status: 'SUCCESS',
              verified_at: new Date().toISOString(),
              transaction_id: `CASH_${orderId.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
            })
            .eq('id', order.payment_id)
            .eq('shop_id', shopId);
        }

        const { error: updateErr } = await db
          .from('orders')
          .update({
            payment_status: 'PAID',
            order_status: 'CONFIRMED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .eq('shop_id', shopId);

        if (updateErr) throw updateErr;

        await db.from('print_jobs').insert({
          order_id: orderId,
          shop_id: shopId,
          status: 'PENDING',
          is_test: false,
        });

        await db.from('audit_logs').insert({
          shop_id: shopId,
          order_id: orderId,
          actor_type: 'SHOP_ADMIN',
          action: 'cash_verified_and_queued',
        });
      }

      try {
        revalidatePath('/admin');
      } catch {}

      return NextResponse.json({
        success: true,
        message: 'Cash payment verified! Sent to printer.',
      });
    }

    if (action === 'REJECT') {
      let rpcSuccess = false;
      if (typeof db.rpc === 'function') {
        const { error: rpcErr } = await db.rpc('reject_cash_order', {
          p_shop_id: shopId,
          p_order_id: orderId,
          p_reason: reason || 'Payment declined by counter',
        });
        if (!rpcErr) {
          rpcSuccess = true;
        } else if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn('reject_cash_order RPC error, falling back to client queries:', rpcErr);
        }
      }

      if (!rpcSuccess) {
        if (order.payment_id) {
          await db
            .from('payments')
            .update({
              status: 'CANCELLED',
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.payment_id)
            .eq('shop_id', shopId);
        }

        const { error: updateErr } = await db
          .from('orders')
          .update({
            payment_status: 'REJECTED',
            order_status: 'REJECTED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .eq('shop_id', shopId);

        if (updateErr) throw updateErr;

        await db.from('audit_logs').insert({
          shop_id: shopId,
          order_id: orderId,
          actor_type: 'SHOP_ADMIN',
          action: 'cash_rejected',
        });
      }

      try {
        revalidatePath('/admin');
      } catch {}

      return NextResponse.json({
        success: true,
        message: 'Order rejected.',
      });
    }

    throw new HttpError(400, 'Invalid action');
  } catch (error) {
    return apiError(error);
  }
}
