import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';
import { equalSecret } from '@/lib/security';

function isAuthorized(req: NextRequest): boolean {
  if (isAdminRequest(req)) return true;
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  const agentSecret = process.env.PRINT_AGENT_SECRET || 'pYk-d8ajyGIcuqLqETqVrVWg7KOmiIuf8RR3hQze1c8';
  if (authHeader && agentSecret && equalSecret(authHeader, agentSecret)) {
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    if (isAdminRequest(req)) {
      requireSameOrigin(req);
    }
    const body = await readJson(req);
    if (body.action === 'CLEAR_HISTORY') {
      const shopId = getCurrentShopId();
      const db = database();
      const scope = body.scope === 'COMPLETED' ? 'COMPLETED' : 'ALL';

      // 1. Try atomic PostgreSQL RPC if available
      if (typeof db.rpc === 'function') {
        const { data: rpcData, error: rpcErr } = await db.rpc('delete_orders', {
          p_shop_id: shopId,
          p_order_ids: null,
          p_scope: scope,
        });

        if (!rpcErr) {
          const count = Array.isArray(rpcData)
            ? (rpcData[0]?.deleted_count ?? rpcData.length)
            : (typeof rpcData === 'number' ? rpcData : 0);
          return NextResponse.json({ success: true, clearedCount: count });
        }

        // If error is other than function missing, log it
        if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn('delete_orders RPC returned error, falling back:', rpcErr);
        }
      }

      if (typeof db.from !== 'function') {
        return NextResponse.json({ success: true, clearedCount: 0 });
      }

      let query = db
        .from('orders')
        .select('id, payment_id, uploaded_file_id, storage_path')
        .eq('shop_id', shopId);

      if (scope === 'COMPLETED') {
        query = query.in('order_status', ['PRINTED', 'REJECTED', 'CANCELLED', 'FAILED']);
      }

      const { data: orders, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      if (orders && orders.length > 0) {
        const orderIds = orders.map((o) => o.id);
        const storagePaths = orders.map((o) => o.storage_path).filter(Boolean) as string[];
        const paymentIds = orders.map((o) => o.payment_id).filter(Boolean) as string[];
        const uploadedFileIds = orders.map((o) => o.uploaded_file_id).filter(Boolean) as string[];

        // 1. Delete storage objects in background so database response is immediate
        if (storagePaths.length > 0 && db.storage?.from) {
          db.storage.from('shop-documents').remove(storagePaths).catch((e) => {
            console.warn('Storage removal warning:', e);
          });
        }

        // 2 & 3. Delete child relations and unlink payments concurrently
        await Promise.all([
          db.from('print_jobs').delete().in('order_id', orderIds),
          db.from('order_events').delete().in('order_id', orderIds),
          db.from('audit_logs').delete().in('order_id', orderIds),
          paymentIds.length > 0
            ? db.from('webhook_inbox').delete().in('payment_id', paymentIds)
            : Promise.resolve(),
          db.from('payments').update({ order_id: null }).in('order_id', orderIds),
          paymentIds.length > 0
            ? db.from('payments').update({ order_id: null }).in('id', paymentIds)
            : Promise.resolve(),
        ]);

        // 4. Delete orders - verify error is handled
        const { error: deleteOrdersErr } = await db
          .from('orders')
          .delete()
          .in('id', orderIds)
          .eq('shop_id', shopId);

        if (deleteOrdersErr) {
          console.error('Failed to delete orders:', deleteOrdersErr);
          throw new HttpError(500, `Failed to delete orders: ${deleteOrdersErr.message}`);
        }

        // 5. Clean up payments and uploaded file records in background
        if (paymentIds.length > 0 || uploadedFileIds.length > 0) {
          Promise.all([
            paymentIds.length > 0 ? db.from('payments').delete().in('id', paymentIds) : Promise.resolve(),
            uploadedFileIds.length > 0 ? db.from('uploaded_files').delete().in('id', uploadedFileIds) : Promise.resolve(),
          ]).catch((e) => console.warn('Orphan cleanup warning:', e));
        }
      }

      return NextResponse.json({ success: true, clearedCount: orders?.length || 0 });
    }

    const orderId = uuid(body.orderId);

    if (body.action === 'DELETE_ORDER') {
      const shopId = getCurrentShopId();
      const db = database();

      // 1. Try atomic PostgreSQL RPC if available
      if (typeof db.rpc === 'function') {
        const { data: rpcData, error: rpcErr } = await db.rpc('delete_orders', {
          p_shop_id: shopId,
          p_order_ids: [orderId],
          p_scope: 'SELECTED',
        });

        if (!rpcErr) {
          return NextResponse.json({ success: true });
        }

        if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn('delete_orders RPC returned error, falling back:', rpcErr);
        }
      }

      if (typeof db.from !== 'function') {
        return NextResponse.json({ success: true });
      }

      const { data: order, error: fetchErr } = await db
        .from('orders')
        .select('id, payment_id, uploaded_file_id, storage_path')
        .eq('id', orderId)
        .eq('shop_id', shopId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (order) {
        if (order.storage_path && db.storage?.from) {
          db.storage.from('shop-documents').remove([order.storage_path]).catch((e) => {
            console.warn('Storage removal warning:', e);
          });
        }

        await Promise.all([
          db.from('print_jobs').delete().eq('order_id', orderId),
          db.from('order_events').delete().eq('order_id', orderId),
          db.from('audit_logs').delete().eq('order_id', orderId),
          order.payment_id
            ? db.from('webhook_inbox').delete().eq('payment_id', order.payment_id)
            : Promise.resolve(),
          order.payment_id
            ? db.from('payments').update({ order_id: null }).eq('id', order.payment_id)
            : Promise.resolve(),
          db.from('payments').update({ order_id: null }).eq('order_id', orderId),
        ]);

        const { error: deleteOrderErr } = await db
          .from('orders')
          .delete()
          .eq('id', orderId)
          .eq('shop_id', shopId);

        if (deleteOrderErr) {
          console.error('Failed to delete order:', deleteOrderErr);
          throw new HttpError(500, `Failed to delete order: ${deleteOrderErr.message}`);
        }

        if (order.payment_id || order.uploaded_file_id) {
          Promise.all([
            order.payment_id ? db.from('payments').delete().eq('id', order.payment_id) : Promise.resolve(),
            order.uploaded_file_id ? db.from('uploaded_files').delete().eq('id', order.uploaded_file_id) : Promise.resolve(),
          ]).catch((e) => console.warn('Single delete orphan cleanup warning:', e));
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
