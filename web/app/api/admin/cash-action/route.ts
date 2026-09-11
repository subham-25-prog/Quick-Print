import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';

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

    const db = database();
    const shopId = getCurrentShopId();

    // Query orders and payments in parallel for instant resolution
    const [orderRes, paymentDirectRes] = await Promise.all([
      db
        .from('orders')
        .select('id, payment_id, shop_id, uploaded_file_id')
        .eq('id', orderId)
        .eq('shop_id', shopId)
        .maybeSingle(),
      db
        .from('payments')
        .select('*')
        .eq('id', orderId)
        .eq('shop_id', shopId)
        .maybeSingle(),
    ]);

    const existingOrder = orderRes.data;
    let payment = paymentDirectRes.data;

    // If orderId was an order row ID rather than payment ID, look up payment by order's payment_id
    if (!payment && existingOrder?.payment_id) {
      const { data: linkedPayment } = await db
        .from('payments')
        .select('*')
        .eq('id', existingOrder.payment_id)
        .eq('shop_id', shopId)
        .maybeSingle();
      payment = linkedPayment;
    }

    if (!payment) {
      throw new HttpError(404, 'Payment record not found.');
    }

    if (action === 'ACCEPT') {
      // If a draft order row already existed in orders table, remove it so finalize_payment can run cleanly
      if (existingOrder) {
        await db.from('orders').delete().eq('id', existingOrder.id).eq('shop_id', shopId);
      }

      const amountMinor = Math.round(Number(payment.amount) * 100);
      const transactionId = `CASH_${Date.now().toString(36).toUpperCase()}`;

      // Call finalize_payment - the PostgreSQL SECURITY DEFINER RPC already verified on Supabase!
      const { data: createdOrderId, error: rpcError } = await db.rpc('finalize_payment', {
        p_shop_id: shopId,
        p_payment_id: payment.id,
        p_provider: payment.provider || 'cash',
        p_merchant_id: payment.merchant_id || 'cash',
        p_reference: payment.payment_reference,
        p_transaction_id: transactionId,
        p_amount_minor: amountMinor,
        p_currency: payment.currency || 'INR',
        p_environment: payment.environment || 'sandbox',
        p_credential_fingerprint: payment.credential_fingerprint || 'cash',
      });

      if (rpcError) {
        console.error('finalize_payment RPC error:', rpcError);
        throw new HttpError(409, `Payment finalization failed: ${rpcError.message}`);
      }

      if (createdOrderId) {
        await db
          .from('orders')
          .update({ payment_method: 'CASH' })
          .eq('id', createdOrderId)
          .eq('shop_id', shopId);
      }

      return NextResponse.json({
        success: true,
        orderId: createdOrderId,
        message: 'Cash payment verified! Document sent to printer.',
      });
    }

    if (action === 'REJECT') {
      if (existingOrder) {
        await db.from('orders').delete().eq('id', existingOrder.id).eq('shop_id', shopId);
      }

      await db
        .from('payments')
        .update({
          status: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id)
        .eq('shop_id', shopId);

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
