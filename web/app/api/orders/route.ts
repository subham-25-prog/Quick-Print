import { NextRequest, NextResponse } from 'next/server';
import { calculateOrderPrice } from '@/lib/pricing';
import { getActivePricing, createOrder, getAllOrders } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';
import { isSbiEpayConfigured, sbiEpayNotReadyMessage } from '@/lib/payments/sbiepay';
import { generateOrderNumber } from '@/lib/utils';
import { Order, OrderItemOptions, PaymentMethod } from '@/types';
import { randomUUID } from 'crypto';
import { adminUnauthorizedResponse, isAdminRequest } from '@/lib/admin-auth';
import { createOrderAccessToken } from '@/lib/order-access';
import { getCurrentShopId } from '@/lib/shop';

function customerOrderView(order: Order) {
  const {
    id, order_number, created_at, file_name, file_type, page_count, paper_size, color_mode,
    print_sides, copies, total_amount, currency, payment_method, payment_status, order_status,
    rejection_reason, failure_reason,
  } = order;
  return {
    id, order_number, created_at, file_name, file_type, page_count, paper_size, color_mode,
    print_sides, copies, total_amount, currency, payment_method, payment_status, order_status,
    rejection_reason, failure_reason,
  };
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'ALL';
    const orders = await getAllOrders(status);
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const shopId = getCurrentShopId();
    const body = await req.json();
    const {
      fileName,
      storagePath,
      signedUrl,
      fileUrl,
      fileType,
      fileSizeBytes,
      pageCount,
      paperSize = 'A4',
      colorMode = 'BW',
      printSides = 'SINGLE',
      copies = 1,
      addOns = {},
      paymentMethod = 'UPI',
      customerName,
      customerPhone,
      customerNotes,
      transactionRef,
    } = body;

    if (!fileName || !storagePath) {
      return NextResponse.json({ error: 'Missing document file metadata' }, { status: 400 });
    }

    const safePageCount = Math.min(1000, Math.max(1, parseInt(pageCount, 10) || 1));
    const safeCopies = Math.min(100, Math.max(1, parseInt(copies, 10) || 1));
    if (!['BW', 'COLOR'].includes(colorMode) || !['SINGLE', 'DOUBLE'].includes(printSides)) {
      return NextResponse.json({ error: 'Invalid print options' }, { status: 400 });
    }
    if (!['UPI', 'CASH'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }
    if (paymentMethod === 'UPI' && !isSbiEpayConfigured()) {
      return NextResponse.json({ error: sbiEpayNotReadyMessage() }, { status: 503 });
    }
    if (paymentMethod === 'UPI' && !String(customerPhone || '').trim()) {
      return NextResponse.json({ error: 'A customer phone number is required for secure UPI payment.' }, { status: 400 });
    }
    if (!storagePath.startsWith(`shop-documents/${shopId}/orders/`)) {
      return NextResponse.json({ error: 'Invalid document upload reference' }, { status: 400 });
    }

    const options: OrderItemOptions = {
      paperSize,
      colorMode,
      printSides,
      copies: safeCopies,
      addOns,
    };

    // 1. Fetch current active pricing from DB
    const activePricing = await getActivePricing();

    // 2. Server-side price recalculation (Never trust client calculation)
    const priceCalculation = calculateOrderPrice(safePageCount, options, activePricing);

    // 3. Generate unique Order ID & Order Number
    const orderId = randomUUID();
    const orderNumber = generateOrderNumber();

    // 4. Payment Verification Security Gate:
    // A UPI deep link only opens a payment app; it cannot prove a successful payment.
    // A verified gateway webhook may approve an online order later. Cash is always verified at the counter.
    const pMethod = paymentMethod as PaymentMethod;
    const initialPaymentStatus = 'AWAITING_VERIFICATION';
    const initialOrderStatus = 'PAYMENT_VERIFICATION_PENDING';

    const newOrder: Order = {
      id: orderId,
      shop_id: shopId,
      order_number: orderNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_name: fileName,
      storage_path: storagePath,
      file_type: fileType || 'application/pdf',
      file_size_bytes: fileSizeBytes || 0,
      page_count: safePageCount,
      paper_size: paperSize,
      color_mode: colorMode,
      print_sides: printSides,
      copies: safeCopies,
      add_ons: addOns,
      per_page_rate: priceCalculation.effectiveRatePerPage,
      print_subtotal: priceCalculation.printSubtotal,
      addons_subtotal: priceCalculation.addOnsSubtotal,
      total_amount: priceCalculation.totalAmount,
      currency: activePricing.currency || 'INR',
      pricing_snapshot: activePricing,
      payment_method: pMethod,
      payment_status: initialPaymentStatus,
      order_status: initialOrderStatus,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_notes: customerNotes,
      advanced_config: body.advancedConfig || body.advanced_config,
      transaction_ref: transactionRef ? String(transactionRef).trim() : undefined,
    };

    // 5. Save to database
    const savedOrder = await createOrder(newOrder);
    const accessToken = createOrderAccessToken(savedOrder.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Order access security is not configured. Set ORDER_ACCESS_SECRET before launch.' },
        { status: 503 }
      );
    }

    // An online order gets a provider-owned, one-time link. A browser redirect
    // never confirms payment; only the signed webhook below can do that.
    let paymentUrl: string | undefined;
    let paymentReference: string | undefined;
    if (pMethod === 'UPI') {
      const admin = getAdminClient();
      if (!admin) throw new Error('Payment database is unavailable. Please try again.');
      paymentReference = `qp_${savedOrder.id.replace(/-/g, '')}`;
      const { data: payment, error: paymentError } = await admin.from('payments').insert({
        order_id: savedOrder.id,
        shop_id: shopId,
        provider: 'sbiepay',
        payment_reference: paymentReference,
        amount: savedOrder.total_amount,
        currency: savedOrder.currency,
        status: 'PENDING',
      }).select('id').single();
      if (paymentError || !payment) throw new Error('Unable to create secure payment session.');

      // SBIePay's official merchant kit is required before a hosted payment
      // request can be created. This branch is unreachable while configuration
      // is disabled above, preventing an unverified or invented integration.
      await admin.from('payments').update({ status: 'FAILED' }).eq('id', payment.id);
      throw new Error(sbiEpayNotReadyMessage());
    }


    return NextResponse.json({
      success: true,
      order: customerOrderView(savedOrder),
      accessToken,
      paymentUrl,
      paymentReference,
      priceBreakdown: priceCalculation,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create order' },
      { status: 500 }
    );
  }
}
