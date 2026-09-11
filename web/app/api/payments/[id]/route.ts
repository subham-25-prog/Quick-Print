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

    if (
      currentPayment.status === 'PENDING' &&
      currentPayment.provider !== 'cash' &&
      currentPayment.provider !== 'direct_upi' &&
      !currentPayment.review_required
    ) {
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

    let qrDataUrl: string | undefined;
    let upiUri = currentPayment.payment_url?.startsWith('upi://')
      ? currentPayment.payment_url
      : undefined;

    if (!upiUri && currentPayment.status === 'PENDING' && currentPayment.provider !== 'cash') {
      try {
        const provider = await paymentProvider();
        if ('generateUpiUri' in provider && typeof (provider as any).generateUpiUri === 'function') {
          upiUri = (provider as any).generateUpiUri({
            upiId: (provider as any).getUpiId?.() || 'shubhamoy27@okaxis',
            payeeName: (provider as any).getPayeeName?.() || 'QuickPrint Shop',
            amount: currentPayment.amount,
            reference: currentPayment.payment_reference,
          });
        }
      } catch {}
    }

    if (upiUri && currentPayment.status === 'PENDING') {
      try {
        const { generateDynamicQrDataUrl } = await import('@/lib/payments/direct-upi');
        qrDataUrl = await generateDynamicQrDataUrl(upiUri);
      } catch {}
    }

    return NextResponse.json(
      {
        status: currentPayment.status,
        reference: currentPayment.payment_reference,
        amount: currentPayment.amount,
        environment: currentPayment.environment,
        paymentMethod: currentPayment.provider === 'cash' ? 'CASH' : 'UPI',
        paymentUrl:
          currentPayment.status === 'PENDING' && currentPayment.payment_url?.startsWith('http')
            ? currentPayment.payment_url
            : undefined,
        upiUri: currentPayment.status === 'PENDING' ? upiUri : undefined,
        qrDataUrl: currentPayment.status === 'PENDING' ? qrDataUrl : undefined,
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
