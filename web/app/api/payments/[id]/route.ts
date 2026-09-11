import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { hasOrderAccess, createOrderAccessToken } from '@/lib/order-access';
import { rateLimit } from '@/lib/security';
import { apiError, HttpError } from '@/lib/http';
import { paymentProvider } from '@/lib/payments';
import { reconcilePayment } from '@/lib/payments/service';
import { uuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = uuid(rawId);

    const db = database();
    const shopId = getCurrentShopId();

    let authorized = hasOrderAccess(req, id);
    if (!authorized) {
      const { data: maybePayment } = await db
        .from('payments')
        .select('order_id')
        .eq('id', id)
        .eq('shop_id', shopId)
        .maybeSingle();

      if (maybePayment?.order_id && hasOrderAccess(req, maybePayment.order_id)) {
        authorized = true;
      }
    }

    if (!authorized) {
      throw new HttpError(404, 'Payment not found.');
    }

    await rateLimit(req, `payment:${id}`, 120);

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

    if (currentPayment.status === 'PENDING' && currentPayment.provider !== 'cash' && !currentPayment.review_required) {
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
        } catch (reconcileErr) {
          console.error('Payment reconciliation error for payment', id, reconcileErr);
          verificationPending = true;
        }
      }
    }

    const payeeVpa = process.env.SHOP_UPI_ID?.trim() || 'wbs.erf@icici';
    const payeeName = process.env.SHOP_UPI_NAME?.trim() || 'West Bengal State Emergency Relief Fund';
    const orderNumber = currentPayment.payment_reference || `QP-${id.slice(0, 4).toUpperCase()}`;
    const fallbackUpiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=1&cu=INR&tn=${encodeURIComponent(`QuickPrint Test ${orderNumber}`)}&tr=${encodeURIComponent(orderNumber)}`;
    const effectiveUpiUri = currentPayment.payment_url || fallbackUpiUri;

    return NextResponse.json(
      {
        status: currentPayment.status,
        reference: orderNumber,
        orderNumber,
        amount: currentPayment.amount,
        environment: currentPayment.environment || 'sandbox',
        paymentMethod: currentPayment.provider === 'cash' ? 'CASH' : 'UPI',
        paymentUrl: currentPayment.status === 'PENDING' ? effectiveUpiUri : undefined,
        upiUri: currentPayment.status === 'PENDING' ? effectiveUpiUri : undefined,
        payeeVpa,
        payeeName,
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
