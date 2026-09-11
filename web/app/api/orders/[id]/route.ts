import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById, getPrintAgentInfo } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { hasOrderAccess } from '@/lib/order-access';
import { getCurrentShopId } from '@/lib/shop';
import { apiError, HttpError } from '@/lib/http';
import { uuid } from '@/lib/validation';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = uuid(rawId);
    const isAdmin = isAdminRequest(req);

    if (!isAdmin && !hasOrderAccess(req, id)) {
      throw new HttpError(404, 'Order not found.');
    }

    let order = await getOrderById(id);
    if (!order) {
      const { data: orderByPayment } = await database()
        .from('orders')
        .select('*')
        .eq('payment_id', id)
        .eq('shop_id', getCurrentShopId())
        .maybeSingle();

      if (orderByPayment) {
        order = orderByPayment as typeof order;
      }
    }

    if (!order || !order.payment_id) {
      throw new HttpError(404, 'Order not found.');
    }

    const resolvedOrderId = order.id;

    const { data: job, error } = await database()
      .from('print_jobs')
      .select('status, is_test, submitted_at')
      .eq('order_id', resolvedOrderId)
      .eq('shop_id', getCurrentShopId())
      .maybeSingle();

    if (error) throw error;

    const {
      order_number,
      created_at,
      file_name,
      page_count,
      paper_size,
      color_mode,
      print_sides,
      copies,
      total_amount,
      currency,
      payment_status,
      order_status,
    } = order;

    const agent = await getPrintAgentInfo();

    return NextResponse.json(
      {
        order: isAdmin
          ? order
          : {
              id: resolvedOrderId,
              order_number,
              created_at,
              file_name,
              page_count,
              paper_size,
              color_mode,
              print_sides,
              copies,
              total_amount,
              currency,
              payment_status,
              order_status,
            },
        job,
        agentOnline: agent?.status === 'ONLINE',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
