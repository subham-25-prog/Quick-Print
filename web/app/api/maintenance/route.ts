import { NextRequest, NextResponse } from 'next/server';
import { database, cleanupOldOrders } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { paymentProvider } from '@/lib/payments';
import { reconcilePayment, StoredPayment } from '@/lib/payments/service';
import { equalSecret } from '@/lib/security';
import { apiError, HttpError } from '@/lib/http';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || '';
    const authHeader = req.headers.get('authorization') || '';

    if (cronSecret.length < 32 || !equalSecret(authHeader, `Bearer ${cronSecret}`)) {
      throw new HttpError(401, 'Unauthorized.');
    }

    const db = database();
    const shopId = getCurrentShopId();
    const retentionDays = Number(process.env.DOCUMENT_RETENTION_DAYS || 3);
    const retention = await cleanupOldOrders(retentionDays);

    const { data: inbox, error: inboxError } = await db
      .from('webhook_inbox')
      .select('payment_id')
      .eq('shop_id', shopId)
      .is('processed_at', null)
      .limit(4);

    if (inboxError) throw inboxError;

    const { data: duePayments, error: dueError } = await db
      .from('payments')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'PENDING')
      .lte('reconcile_after', new Date().toISOString())
      .order('reconcile_after')
      .limit(4);

    if (dueError) throw dueError;

    // Clear stale rate limit windows older than 24h
    const { error: rateError } = await db
      .from('rate_limits')
      .delete()
      .lt('window_start', new Date(Date.now() - 86400000).toISOString());

    if (rateError) throw rateError;

    // A shop can perform document retention before merchant credentials are set up
    if (!inbox?.length && !duePayments?.length) {
      return NextResponse.json({ checked: 0, failed: 0, ...retention });
    }

    const provider = await paymentProvider();
    const pendingMap = new Map<string, StoredPayment>(
      (duePayments || []).map((p: StoredPayment) => [p.id, p])
    );

    for (const row of inbox || []) {
      const { data: p } = await db
        .from('payments')
        .select('*')
        .eq('id', row.payment_id)
        .eq('shop_id', shopId)
        .maybeSingle();

      if (p) pendingMap.set(p.id, p as StoredPayment);
    }

    let checked = 0;
    let failed = 0;

    await Promise.all(
      [...pendingMap.values()].map(async (payment) => {
        try {
          const { data: lock, error: lockError } = await db
            .from('payments')
            .update({ reconcile_after: new Date(Date.now() + 60000).toISOString() })
            .eq('id', payment.id)
            .eq('shop_id', shopId)
            .lte('reconcile_after', new Date().toISOString())
            .select('id')
            .maybeSingle();

          if (lockError) throw lockError;
          if (!lock) return;

          await reconcilePayment(payment, provider);

          const { error: doneError } = await db
            .from('webhook_inbox')
            .update({ processed_at: new Date().toISOString() })
            .eq('payment_id', payment.id)
            .eq('shop_id', shopId);

          if (doneError) throw doneError;
          checked++;
        } catch {
          failed++;
        }
      })
    );

    return NextResponse.json(
      { checked, failed, ...retention },
      { status: failed ? 503 : 200 }
    );
  } catch (error) {
    return apiError(error);
  }
}
