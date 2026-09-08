import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { database, getActivePricing, getAllOrders } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { rateLimit, hash } from '@/lib/security';
import { uuid, textField, printOptions } from '@/lib/validation';
import { calculateOrderPrice } from '@/lib/pricing';
import { paymentProvider } from '@/lib/payments';
import { openPayment } from '@/lib/payments/service';
import { createOrderAccessToken } from '@/lib/order-access';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const status = req.nextUrl.searchParams.get('status') || 'ALL';
    const orders = await getAllOrders(status);
    return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    await rateLimit(req, 'checkout', 60);

    if (!createOrderAccessToken(randomUUID())) {
      throw new HttpError(503, 'Checkout security is not configured.');
    }

    const body = await readJson(req);
    const uploadId = uuid(body.uploadId);
    const idempotencyKey = uuid(body.idempotencyKey);

    const paymentMethod = body.paymentMethod === 'CASH' ? 'CASH' : 'UPI';
    if (body.paymentMethod && !['UPI', 'CASH'].includes(String(body.paymentMethod))) {
      throw new HttpError(400, 'This installation accepts UPI or Cash payments.');
    }

    const token = textField(body.uploadToken, 128);
    if (token.length !== 64) {
      throw new HttpError(404, 'Upload not found.');
    }

    const db = database();
    const shopId = getCurrentShopId();
    const owner = hash(token);

    const { data: file, error: fileError } = await db
      .from('uploaded_files')
      .select('*')
      .eq('id', uploadId)
      .eq('shop_id', shopId)
      .eq('owner_hash', owner)
      .is('deleted_at', null)
      .maybeSingle();

    if (fileError) throw fileError;
    if (!file || file.deletion_claimed_at || Date.parse(file.expires_at) < Date.now()) {
      throw new HttpError(404, 'This upload has expired. Upload it again.');
    }

    const pricing = await getActivePricing();
    if (paymentMethod === 'CASH' && pricing.form_fields?.allowCashPayment === false) {
      throw new HttpError(400, 'Cash payment is unavailable.');
    }
    if (paymentMethod === 'UPI' && pricing.form_fields?.allowUpiPayment === false) {
      throw new HttpError(503, 'Online payment is unavailable.');
    }

    const options = printOptions(body, pricing);
    const price = calculateOrderPrice(file.page_count, options, pricing);

    if (!Number.isFinite(price.totalAmount) || price.totalAmount < 1 || price.totalAmount > 100000) {
      throw new HttpError(400, 'The payment total must be between ₹1 and ₹100,000.');
    }

    const customerName = textField(body.customerName, 100);
    const customerPhone = textField(body.customerPhone, 20);
    const customerNotes = textField(body.customerNotes, 1000);

    if (pricing.form_fields?.requireCustomerName && !customerName) {
      throw new HttpError(400, 'Enter your name.');
    }
    if (pricing.form_fields?.requireCustomerPhone && !/^\+?[0-9 ]{10,15}$/.test(customerPhone)) {
      throw new HttpError(400, 'Enter a valid mobile number.');
    }

    const requestHash = hash(
      JSON.stringify({ uploadId, options, name: customerName, phone: customerPhone, notes: customerNotes })
    );

    // Handle CASH payment flow
    if (paymentMethod === 'CASH') {
      const orderId = randomUUID();
      const paymentId = randomUUID();
      const accessToken = createOrderAccessToken(orderId);
      if (!accessToken) {
        throw new HttpError(503, 'Checkout access security is not configured.');
      }

      const paymentReference = `QP_CASH_${paymentId.replace(/-/g, '').slice(0, 16)}`;
      const transactionId = `CASH_${paymentId.replace(/-/g, '').slice(0, 12)}`;
      const isSandbox = (process.env.PAYMENT_ENVIRONMENT || 'sandbox') === 'sandbox';

      const draftOrderData = {
        paper_size: options.paperSize,
        color_mode: options.colorMode,
        print_sides: options.printSides,
        copies: options.copies,
        add_ons: options.addOns,
        advanced_config: (options as unknown as Record<string, unknown>).advancedConfig,
        per_page_rate: price.effectiveRatePerPage,
        print_subtotal: price.printSubtotal,
        addons_subtotal: price.addOnsSubtotal,
        total_amount: price.totalAmount,
        currency: 'INR',
        pricing_snapshot: pricing,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_notes: customerNotes,
      };

      const paymentRecord = {
        id: paymentId,
        shop_id: shopId,
        uploaded_file_id: uploadId,
        owner_hash: owner,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        provider: 'cash',
        merchant_id: 'cash',
        environment: process.env.PAYMENT_ENVIRONMENT || 'sandbox',
        credential_fingerprint: 'cash',
        payment_reference: paymentReference,
        amount: price.totalAmount,
        currency: 'INR',
        status: 'SUCCESS',
        order_id: orderId,
        transaction_id: transactionId,
        verified_at: new Date().toISOString(),
        draft_order: draftOrderData,
      };

      const { error: paymentError } = await db.from('payments').insert(paymentRecord);
      if (paymentError) throw paymentError;

      const orderNumber = `QP-${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      const orderRecord = {
        id: orderId,
        shop_id: shopId,
        order_number: orderNumber,
        payment_id: paymentId,
        uploaded_file_id: uploadId,
        file_name: file.file_name,
        storage_path: file.storage_path,
        file_type: 'application/pdf',
        file_size_bytes: file.file_size_bytes,
        page_count: file.page_count,
        paper_size: options.paperSize,
        color_mode: options.colorMode,
        print_sides: options.printSides,
        copies: options.copies,
        add_ons: options.addOns,
        per_page_rate: price.effectiveRatePerPage,
        print_subtotal: price.printSubtotal,
        addons_subtotal: price.addOnsSubtotal,
        total_amount: price.totalAmount,
        currency: 'INR',
        pricing_snapshot: pricing,
        payment_method: 'CASH',
        payment_status: 'PAID',
        order_status: 'CONFIRMED',
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_notes: customerNotes,
        transaction_ref: transactionId,
      };

      const { error: orderError } = await db.from('orders').insert(orderRecord);
      if (orderError) throw orderError;

      const { error: jobError } = await db.from('print_jobs').insert({
        order_id: orderId,
        shop_id: shopId,
        status: 'PENDING',
        is_test: isSandbox,
      });
      if (jobError) throw jobError;

      return NextResponse.json(
        {
          success: true,
          paymentId,
          accessToken,
          orderId,
          orderAccessToken: accessToken,
          amount: price.totalAmount,
          reference: paymentReference,
          status: 'SUCCESS',
          paymentMethod: 'CASH',
          environment: paymentRecord.environment,
        },
        { status: 201 }
      );
    }

    // Handle UPI / Online payment flow
    const provider = await paymentProvider();

    // Idempotent checkout retry check
    const { data: previous, error: prevError } = await db
      .from('payments')
      .select('*')
      .eq('shop_id', shopId)
      .eq('owner_hash', owner)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (prevError) throw prevError;

    if (previous) {
      if (previous.request_hash !== requestHash) {
        throw new HttpError(409, 'Checkout already exists with different options.');
      }
      return NextResponse.json(await openPayment(previous, provider));
    }

    const paymentId = randomUUID();
    const paymentRecord = {
      id: paymentId,
      shop_id: shopId,
      uploaded_file_id: uploadId,
      owner_hash: owner,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      provider: provider.name,
      merchant_id: provider.merchantId,
      environment: provider.environment,
      credential_fingerprint: provider.fingerprint,
      payment_reference: `QP_${paymentId.replace(/-/g, '')}`,
      amount: price.totalAmount,
      currency: 'INR',
      status: 'PENDING',
      draft_order: {
        paper_size: options.paperSize,
        color_mode: options.colorMode,
        print_sides: options.printSides,
        copies: options.copies,
        add_ons: options.addOns,
        advanced_config: (options as unknown as Record<string, unknown>).advancedConfig,
        per_page_rate: price.effectiveRatePerPage,
        print_subtotal: price.printSubtotal,
        addons_subtotal: price.addOnsSubtotal,
        total_amount: price.totalAmount,
        currency: 'INR',
        pricing_snapshot: pricing,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_notes: customerNotes,
      },
    };

    const { data: createdPayment, error: insertError } = await db
      .from('payments')
      .insert(paymentRecord)
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: activePayment } = await db
          .from('payments')
          .select('*')
          .eq('uploaded_file_id', uploadId)
          .eq('shop_id', shopId)
          .in('status', ['PENDING', 'SUCCESS'])
          .maybeSingle();

        if (
          activePayment &&
          activePayment.owner_hash === owner &&
          activePayment.request_hash === requestHash
        ) {
          return NextResponse.json(await openPayment(activePayment, provider));
        }

        throw new HttpError(
          409,
          'This document already has a checkout. Resume it or upload again for a new order.'
        );
      }
      throw insertError;
    }

    const opened = await openPayment(createdPayment, provider);
    return NextResponse.json(opened, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
