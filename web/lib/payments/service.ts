import { database } from '../db';
import { getCurrentShopId } from '../shop';
import { appOrigin } from '../security';
import { createOrderAccessToken } from '../order-access';
import { HttpError } from '../http';
import { PaymentContext, PaymentProvider, assertVerified } from './provider';

export type StoredPayment = PaymentContext & {
  status: string;
  order_id?: string;
  payment_url?: string;
  review_required?: boolean;
  creation_started_at?: string;
};

export async function openPayment(payment: StoredPayment, provider: PaymentProvider) {
  const token = createOrderAccessToken(payment.id);
  if (!token) {
    throw new HttpError(503, 'Checkout access security is unavailable.');
  }

  let url = payment.payment_url;

  if (payment.status === 'PENDING' && !url && !payment.creation_started_at) {
    const db = database();
    const shopId = getCurrentShopId();

    const { data: lock, error: lockError } = await db
      .from('payments')
      .update({ creation_started_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('shop_id', shopId)
      .is('creation_started_at', null)
      .select('id')
      .maybeSingle();

    if (lockError) throw lockError;

    if (lock) {
      try {
        const returnUrl = `${appOrigin()}/payment/${payment.id}?access_token=${encodeURIComponent(token)}`;
        const session = await provider.createPayment(payment, returnUrl);

        const { error: saveError } = await db
          .from('payments')
          .update({
            payment_url: session.url,
            provider_link_id: session.providerOrderId,
          })
          .eq('id', payment.id)
          .eq('shop_id', shopId);

        if (saveError) throw saveError;
        url = session.url;
      } catch {
        // Unknown network outcome: retain this reference for reconciliation.
        // Never create another charge from a transport error.
        console.warn(
          JSON.stringify({
            event: 'payment_creation_pending',
            paymentId: payment.id,
          })
        );
      }
    }
  }

  return {
    success: true,
    paymentId: payment.id,
    accessToken: token,
    paymentUrl: url,
    amount: payment.amount,
    reference: payment.payment_reference,
    status: payment.status,
    environment: payment.environment,
    orderId: payment.order_id,
  };
}

export async function reconcilePayment(payment: StoredPayment, provider: PaymentProvider) {
  if (payment.status === 'SUCCESS') {
    return payment;
  }

  const result = await provider.getPaymentStatus(payment);
  const db = database();
  const shopId = getCurrentShopId();

  if (result.state === 'SUCCESS') {
    assertVerified(payment, result);

    const { data: orderId, error } = await db.rpc('finalize_payment', {
      p_shop_id: shopId,
      p_payment_id: payment.id,
      p_provider: result.provider,
      p_merchant_id: result.merchantId,
      p_reference: result.reference,
      p_transaction_id: result.transactionId,
      p_amount_minor: result.amountMinor,
      p_currency: result.currency,
      p_environment: result.environment,
      p_credential_fingerprint: result.fingerprint,
    });

    if (error) throw error;

    return {
      ...payment,
      status: orderId ? 'SUCCESS' : payment.status,
      order_id: orderId,
      review_required: !orderId,
    };
  }

  const { error } = await db
    .from('payments')
    .update({
      status: result.state,
      last_checked_at: new Date().toISOString(),
      reconcile_after: new Date(Date.now() + 60000).toISOString(),
    })
    .eq('id', payment.id)
    .eq('shop_id', shopId)
    .neq('status', 'SUCCESS');

  if (error) throw error;

  return {
    ...payment,
    status: result.state,
  };
}
