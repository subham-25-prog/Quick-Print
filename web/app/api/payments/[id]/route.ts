import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { hasOrderAccess, createOrderAccessToken } from '@/lib/order-access';
import { rateLimit } from '@/lib/security';
import { apiError, HttpError } from '@/lib/http';
import { paymentProvider } from '@/lib/payments';
import { reconcilePayment } from '@/lib/payments/service';
import { uuid } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = uuid(rawId);

    if (!hasOrderAccess(req, id)) {
      throw new HttpError(404, 'Payment not found.');
    }

    await rateLimit(req, `payment:${id}`, 20);

    const db = database();
    const shopId = getCurrentShopId();

    const { data: payment, error } = await db
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (error) throw error;
    if (!payment) {
      throw new HttpError(404, 'Payment not found.');
    }

    let currentPayment = payment;
    let verificationPending = false;

    if (currentPayment.status === 'PENDING' && !currentPayment.review_required) {
      const { data: lock, error: lockError } = await db
        .from('payments')
        .update({ reconcile_after: new Date(Date.now() + 15000).toISOString() })
        .eq('id', id)
        .eq('shop_id', shopId)
        .lte('reconcile_after', new Date().toISOString())
        .select('id')
        .maybeSingle();

      if (lockError) throw lockError;

      if (lock) {
        try {
          const provider = await paymentProvider();
          currentPayment = await reconcilePayment(currentPayment, provider);
        } catch {
          verificationPending = true;
        }
      }
    }

    return NextResponse.json(
      {
        status: currentPayment.status,
        reference: currentPayment.payment_reference,
        amount: currentPayment.amount,
        environment: currentPayment.environment,
        paymentUrl: currentPayment.status === 'PENDING' ? currentPayment.payment_url : undefined,
        reviewRequired: currentPayment.review_required,
        verificationPending,
        orderId: currentPayment.status === 'SUCCESS' ? currentPayment.order_id : undefined,
        orderAccessToken:
          currentPayment.status === 'SUCCESS'
            ? createOrderAccessToken(currentPayment.order_id)
            : undefined,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
