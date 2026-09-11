import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById, getPrintAgentInfo } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { hasOrderAccess, createOrderAccessToken } from '@/lib/order-access';
import { getCurrentShopId } from '@/lib/shop';
import { apiError, HttpError } from '@/lib/http';
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
    const isAdmin = isAdminRequest(req);

    let authorized = isAdmin || hasOrderAccess(req, id);
    if (!authorized) {
      // Check if access token is signed for the associated payment_id
      const { data: maybeOrder } = await database()
        .from('orders')
        .select('payment_id')
        .eq('id', id)
        .eq('shop_id', getCurrentShopId())
        .maybeSingle();

      if (maybeOrder?.payment_id && hasOrderAccess(req, maybeOrder.payment_id)) {
        authorized = true;
      }
    }

    if (!authorized) {
      // Check if access token is signed for the order_id linked to this payment
      const { data: maybePayment } = await database()
        .from('payments')
        .select('order_id')
        .eq('id', id)
        .eq('shop_id', getCurrentShopId())
        .maybeSingle();

      if (maybePayment?.order_id && hasOrderAccess(req, maybePayment.order_id)) {
        authorized = true;
      }
    }

    if (!authorized) {
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

    if (!order) {
      const { data: payment } = await database()
        .from('payments')
        .select('*')
        .eq('id', id)
        .eq('shop_id', getCurrentShopId())
        .maybeSingle();

      if (payment) {
        if (payment.order_id) {
          order = await getOrderById(payment.order_id);
        } else if (payment.draft_order) {
          const draft = payment.draft_order as any;
          return NextResponse.json(
            {
              order: {
                id: payment.id,
                order_number: `QP-${payment.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
                created_at: payment.created_at,
                file_name: draft.file_name || 'document.pdf',
                page_count: draft.page_count || 1,
                paper_size: draft.paper_size || 'A4',
                color_mode: draft.color_mode || 'BW',
                print_sides: draft.print_sides || 'SINGLE',
                copies: draft.copies || 1,
                total_amount: payment.amount,
                currency: payment.currency || 'INR',
                payment_method: payment.provider === 'cash' ? 'CASH' : 'UPI',
                payment_status: payment.status === 'SUCCESS' ? 'PAID' : 'AWAITING_VERIFICATION',
                order_status: payment.status === 'SUCCESS' ? 'CONFIRMED' : 'PAYMENT_VERIFICATION_PENDING',
                customer_name: draft.customer_name,
                customer_phone: draft.customer_phone,
                customer_notes: draft.customer_notes,
              },
              job: null,
              agentOnline: true,
            },
            { headers: { 'Cache-Control': 'private, no-store' } }
          );
        }
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
      payment_method,
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
              payment_method: payment_method || (order.payment_id ? 'CASH' : 'UPI'),
              payment_status,
              order_status,
              customer_name: order.customer_name,
              customer_phone: order.customer_phone,
              customer_notes: order.customer_notes,
            },
        job,
        agentOnline: agent?.status === 'ONLINE',
        orderAccessToken: createOrderAccessToken(resolvedOrderId),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return apiError(error);
  }
}
