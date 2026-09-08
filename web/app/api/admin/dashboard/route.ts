import { NextRequest, NextResponse } from 'next/server';
import { database, getPrintAgentInfo } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError } from '@/lib/http';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const db = database();
    const shopId = getCurrentShopId();

    const [stats, orders, payments, printers, agent] = await Promise.all([
      db.rpc('shop_dashboard_stats', { p_shop_id: shopId }),
      db
        .from('orders')
        .select(
          'id, order_number, file_name, page_count, copies, paper_size, color_mode, total_amount, order_status, print_jobs!print_job_order_shop_fk(status, is_test)'
        )
        .eq('shop_id', shopId)
        .not('payment_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50),
      db
        .from('payments')
        .select(
          'id, payment_reference, amount, status, environment, review_required, created_at'
        )
        .eq('shop_id', shopId)
        .not('uploaded_file_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50),
      db.from('printers').select('name, status, last_seen').eq('shop_id', shopId),
      getPrintAgentInfo(),
    ]);

    for (const result of [stats, orders, payments, printers]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json(
      {
        stats: stats.data,
        orders: orders.data,
        payments: payments.data,
        printers: printers.data,
        agent,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
