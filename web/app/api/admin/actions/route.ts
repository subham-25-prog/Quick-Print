import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    if (body.action === 'DIAGNOSE_STATUS') {
      const statuses = [
        'PENDING_PAYMENT',
        'PAYMENT_VERIFICATION_PENDING',
        'CONFIRMED',
        'APPROVED',
        'PRINTING',
        'SUBMITTED',
        'PRINTED',
        'COMPLETED',
        'PAID',
        'PENDING',
        'FAILED',
        'CANCELLED',
        'REJECTED',
        'SUCCESS',
      ];
      const results: Record<string, string> = {};
      for (const s of statuses) {
        const testId = randomUUID();
        const { error } = await database().from('orders').insert({
          id: testId,
          shop_id: getCurrentShopId(),
          order_number: `DIAG-${randomUUID().slice(0, 8).toUpperCase()}`,
          file_name: 'diag.pdf',
          storage_path: 'diag',
          file_type: 'application/pdf',
          per_page_rate: 1,
          print_subtotal: 1,
          total_amount: 1,
          pricing_snapshot: {},
          order_status: s,
        });
        if (error) {
          results[s] = error.message;
        } else {
          results[s] = 'ALLOWED';
          await database().from('orders').delete().eq('id', testId);
        }
      }
      return NextResponse.json({ success: true, results });
    }

    const orderId = uuid(body.orderId);
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
