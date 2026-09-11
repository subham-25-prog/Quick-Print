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
        query = query.in('order_status', ['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED']);
      }

      const { data: orders, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      let unlinkedPayments: any[] = [];
      if (scope === 'ALL') {
        const { data: standalone } = await db
          .from('payments')
          .select('id, uploaded_file_id, draft_order')
          .eq('shop_id', shopId)
          .is('order_id', null);
        unlinkedPayments = standalone || [];
      }

      let totalCleared = 0;

      if (orders && orders.length > 0) {
        const orderIds = orders.map((o) => o.id);
        const storagePaths = orders.map((o) => o.storage_path).filter(Boolean) as string[];
        const paymentIds = orders.map((o) => o.payment_id).filter(Boolean) as string[];
        const uploadedFileIds = orders.map((o) => o.uploaded_file_id).filter(Boolean) as string[];

        // 1. Delete storage objects in background
        if (storagePaths.length > 0 && db.storage?.from) {
          db.storage.from('shop-documents').remove(storagePaths).catch((e) => {
            console.warn('Storage removal warning:', e);
          });
        }

        // 2. Sequential dependency cleanup to prevent race conditions and lock contention
        await db.from('print_jobs').delete().in('order_id', orderIds);
        await db.from('order_events').delete().in('order_id', orderIds);
        await db.from('audit_logs').delete().in('order_id', orderIds);

        if (paymentIds.length > 0) {
          await db.from('webhook_inbox').delete().in('payment_id', paymentIds);
          await db.from('payments').update({ order_id: null }).in('id', paymentIds);
        }
        await db.from('payments').update({ order_id: null }).in('order_id', orderIds);

        // 3. Delete orders
        const { error: deleteOrdersErr } = await db
          .from('orders')
          .delete()
          .in('id', orderIds)
          .eq('shop_id', shopId);

        if (deleteOrdersErr) {
          console.error('Failed to delete orders:', deleteOrdersErr);
          throw new HttpError(500, `Failed to delete orders: ${deleteOrdersErr.message}`);
        }

        // 4. Delete orphan payments and uploaded files
        if (paymentIds.length > 0) {
          await db.from('payments').delete().in('id', paymentIds);
        }
        await db.from('payments').delete().in('order_id', orderIds);

        if (uploadedFileIds.length > 0) {
          await db.from('uploaded_files').delete().in('id', uploadedFileIds);
        }

        totalCleared += orders.length;
      }

      // 5. Clean up unlinked cash payments if ALL scope
      if (unlinkedPayments.length > 0) {
        const standaloneIds = unlinkedPayments.map((p) => p.id);
        const standaloneFileIds = unlinkedPayments.map((p) => p.uploaded_file_id).filter(Boolean);
        const standaloneStorage = unlinkedPayments
          .map((p) => p.draft_order?.storage_path)
          .filter(Boolean) as string[];

        if (standaloneStorage.length > 0 && db.storage?.from) {
          db.storage.from('shop-documents').remove(standaloneStorage).catch(() => {});
        }

        await db.from('webhook_inbox').delete().in('payment_id', standaloneIds);
        await db.from('payments').delete().in('id', standaloneIds).eq('shop_id', shopId);

        if (standaloneFileIds.length > 0) {
          await db.from('uploaded_files').delete().in('id', standaloneFileIds);
        }

        totalCleared += unlinkedPayments.length;
      }

      return NextResponse.json({ success: true, clearedCount: totalCleared });
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
          const count = Array.isArray(rpcData)
            ? (rpcData[0]?.deleted_count ?? rpcData.length)
            : (typeof rpcData === 'number' ? rpcData : 0);
          if (count > 0) {
            return NextResponse.json({ success: true });
          }
        } else if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn('delete_orders RPC returned error, falling back:', rpcErr);
        }
      }

      if (typeof db.from !== 'function') {
        return NextResponse.json({ success: true });
      }

      // 2. Check if row exists in orders table
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

        await db.from('print_jobs').delete().eq('order_id', orderId);
        await db.from('order_events').delete().eq('order_id', orderId);
        await db.from('audit_logs').delete().eq('order_id', orderId);

        if (order.payment_id) {
          await db.from('webhook_inbox').delete().eq('payment_id', order.payment_id);
          await db.from('payments').update({ order_id: null }).eq('id', order.payment_id);
        }
        await db.from('payments').update({ order_id: null }).eq('order_id', orderId);

        const { error: deleteOrderErr } = await db
          .from('orders')
          .delete()
          .eq('id', orderId)
          .eq('shop_id', shopId);

        if (deleteOrderErr) {
          console.error('Failed to delete order:', deleteOrderErr);
          throw new HttpError(500, `Failed to delete order: ${deleteOrderErr.message}`);
        }

        if (order.payment_id) {
          await db.from('payments').delete().eq('id', order.payment_id);
        }
        await db.from('payments').delete().eq('order_id', orderId);

        if (order.uploaded_file_id) {
          await db.from('uploaded_files').delete().eq('id', order.uploaded_file_id);
        }

        return NextResponse.json({ success: true });
      }

      // 3. If not in orders table, check if it's an unlinked / pending cash payment
      const { data: payment, error: fetchPaymentErr } = await db
        .from('payments')
        .select('id, uploaded_file_id, draft_order')
        .eq('id', orderId)
        .eq('shop_id', shopId)
        .maybeSingle();

      if (fetchPaymentErr) throw fetchPaymentErr;

      if (payment) {
        const storagePath = (payment.draft_order as any)?.storage_path;
        if (storagePath && db.storage?.from) {
          db.storage.from('shop-documents').remove([storagePath]).catch(() => {});
        }

        await db.from('webhook_inbox').delete().eq('payment_id', orderId);
        const { error: deletePaymentErr } = await db
          .from('payments')
          .delete()
          .eq('id', orderId)
          .eq('shop_id', shopId);

        if (deletePaymentErr) {
          console.error('Failed to delete cash payment:', deletePaymentErr);
          throw new HttpError(500, `Failed to delete order: ${deletePaymentErr.message}`);
        }

        if (payment.uploaded_file_id) {
          await db.from('uploaded_files').delete().eq('id', payment.uploaded_file_id);
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
