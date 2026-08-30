import { NextRequest, NextResponse } from 'next/server';
import { calculateOrderPrice, generateUpiDeepLink } from '@/lib/pricing';
import { getActivePricing, createOrder, getAllOrders } from '@/lib/db';
import { getShopConfig } from '@/lib/config';
import { generateOrderNumber } from '@/lib/utils';
import { Order, OrderItemOptions, PaymentMethod } from '@/types';

export async function GET(req: NextRequest) {
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

    const safePageCount = Math.max(1, parseInt(pageCount, 10) || 1);
    const safeCopies = Math.max(1, parseInt(copies, 10) || 1);

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
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = generateOrderNumber();

    // 4. Safe Payment Verification Security Gate:
    // By default, ALL orders (UPI and Cash) require shopkeeper verification before printing.
    // This prevents fake UPI taps / cancelled bank payments from spooling wasted paper.
    const pMethod = paymentMethod as PaymentMethod;
    const isUpi = pMethod === 'UPI' || (pMethod as string) === 'ONLINE_UPI';
    const autoApprove = Boolean(activePricing.form_fields?.autoApproveUpiOrders && isUpi);

    const initialPaymentStatus = autoApprove ? 'VERIFIED' : 'AWAITING_VERIFICATION';
    const initialOrderStatus = autoApprove ? 'APPROVED' : 'PAYMENT_VERIFICATION_PENDING';

    const newOrder: Order = {
      id: orderId,
      order_number: orderNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      file_name: fileName,
      file_url: signedUrl || fileUrl || undefined,
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
      transaction_ref: transactionRef ? String(transactionRef).trim() : undefined,
    };

    // 5. Save to database
    const savedOrder = await createOrder(newOrder);

    // 6. Generate UPI deep link if payment method is UPI
    const shop = getShopConfig();
    const upiId = activePricing.shop_upi_id || shop.upiId;
    const payeeName = activePricing.shop_upi_name || activePricing.shop_name || shop.upiPayeeName;
    const upiLink = generateUpiDeepLink({
      upiId,
      payeeName,
      amount: savedOrder.total_amount,
      orderNumber: savedOrder.order_number,
      currency: savedOrder.currency,
    });


    return NextResponse.json({
      success: true,
      order: savedOrder,
      upiLink,
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
