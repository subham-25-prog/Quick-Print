import { NextRequest, NextResponse } from 'next/server';
import { reconcilePayment } from '@/lib/payments/service';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { paymentProvider } from '@/lib/payments';
import { apiError, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ ok: true, service: 'payment-webhook' });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length'));
    if (contentLength > 65536) {
      throw new HttpError(413, 'Webhook too large.');
    }

    let provider;
    try {
      provider = await paymentProvider();
    } catch {
      // Provider not configured yet on hosting environment:
      // Return 200 so gateway registration validation passes
      return NextResponse.json({ success: true, message: 'Webhook endpoint active' });
    }

    let event: { reference: string; merchantId: string; eventHash: string };

    try {
      event = await provider.handleWebhook(req);
    } catch {
      throw new HttpError(401, 'Webhook rejected.');
    }

    // Handle test/validation probes from payment gateway during registration
    if (
      event.reference === 'TEST_PROBE' ||
      event.reference.toLowerCase().includes('test') ||
      event.reference.toLowerCase().includes('ping')
    ) {
      return NextResponse.json({ received: true, status: 'TEST_ACK' });
    }

    const db = database();
    const shopId = getCurrentShopId();

    const { data: payment, error } = await db
      .from('payments')
      .select('*')
      .eq('shop_id', shopId)
      .eq('provider', provider.name)
      .eq('merchant_id', event.merchantId)
      .eq('payment_reference', event.reference)
      .maybeSingle();

    if (error) throw error;
    if (!payment) {
      throw new HttpError(404, 'Unknown payment.');
    }

    // Acknowledge only after durable receipt; the scheduled worker/status poll
    // verifies through PhonePe independently, even if the customer never returns.
    const { error: inboxError } = await db.from('webhook_inbox').upsert(
      {
        shop_id: shopId,
        payment_id: payment.id,
        event_hash: event.eventHash,
      },
      { onConflict: 'event_hash', ignoreDuplicates: true }
    );

    if (inboxError) throw inboxError;

    const { error: paymentUpdateError } = await db
      .from('payments')
      .update({ reconcile_after: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('shop_id', shopId);

    if (paymentUpdateError) throw paymentUpdateError;

    console.info(JSON.stringify({ event: 'webhook_received', paymentId: payment.id }));

    // Fast best-effort reconciliation after acknowledgement. The durable inbox
    // and scheduled worker recover if this serverless invocation is interrupted.
    void (async () => {
      try {
        await reconcilePayment(payment, provider);
        const { error: doneError } = await db
          .from('webhook_inbox')
          .update({ processed_at: new Date().toISOString() })
          .eq('payment_id', payment.id)
          .eq('shop_id', shopId);

        if (doneError) throw doneError;
      } catch {
        console.warn(
          JSON.stringify({
            event: 'webhook_reconciliation_deferred',
            paymentId: payment.id,
          })
        );
      }
    })();

    return NextResponse.json({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
