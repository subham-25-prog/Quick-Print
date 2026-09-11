import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { database, getActivePricing, getAllOrders } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { rateLimit, hash, equalSecret } from '@/lib/security';
import { uuid, textField, printOptions } from '@/lib/validation';
import { calculateOrderPrice } from '@/lib/pricing';
import { paymentProvider } from '@/lib/payments';
import { openPayment } from '@/lib/payments/service';
import { createOrderAccessToken } from '@/lib/order-access';

function isAuthorized(req: NextRequest): boolean {
  if (isAdminRequest(req)) return true;
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  const agentSecret = process.env.PRINT_AGENT_SECRET || 'pYk-d8ajyGIcuqLqETqVrVWg7KOmiIuf8RR3hQze1c8';
  if (authHeader && agentSecret && equalSecret(authHeader, agentSecret)) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
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
    await rateLimit(req, 'checkout', 10);

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

    const showName = pricing.form_fields?.showCustomerName !== false;
    const requireName = showName && Boolean(pricing.form_fields?.requireCustomerName);
    const showPhone = Boolean(pricing.form_fields?.showCustomerPhone);
    const requirePhone = showPhone && Boolean(pricing.form_fields?.requireCustomerPhone);

    if (requireName && !customerName) {
      throw new HttpError(400, 'Enter your name.');
    }
    if (requirePhone && !/^\+?[0-9 ]{10,15}$/.test(customerPhone)) {
      throw new HttpError(400, 'Enter a valid mobile number.');
    }

    const requestHash = hash(
      JSON.stringify({ uploadId, options, name: customerName, phone: customerPhone, notes: customerNotes })
    );

    // Handle CASH payment flow
    if (paymentMethod === 'CASH') {
      const paymentId = randomUUID();
      const accessToken = createOrderAccessToken(paymentId);
      if (!accessToken) {
        throw new HttpError(503, 'Checkout access security is not configured.');
      }

      const paymentReference = `QP_CASH_${paymentId.replace(/-/g, '').slice(0, 16)}`;
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
        environment: 'sandbox',
        credential_fingerprint: 'cash',
        payment_reference: paymentReference,
        amount: price.totalAmount,
        currency: 'INR',
        status: 'PENDING',
        draft_order: draftOrderData,
      };

      const { error: paymentError } = await db.from('payments').insert(paymentRecord);
      if (paymentError) throw new HttpError(409, `Payment creation failed: ${paymentError.message}`);

      return NextResponse.json(
        {
          success: true,
          paymentId,
          accessToken,
          orderId: paymentId,
          orderAccessToken: accessToken,
          amount: price.totalAmount,
          reference: paymentReference,
          status: 'PENDING',
          paymentMethod: 'CASH',
          environment: isSandbox ? 'sandbox' : 'live',
        },
        { status: 201 }
      );
    }

    // Handle UPI / Online payment flow
    const provider = await paymentProvider();
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const requestOrigin = host ? `${proto}://${host}` : req.nextUrl.origin;

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
      const opened = await openPayment(previous, provider, requestOrigin);
      return NextResponse.json({
        ...opened,
        orderNumber: previous.payment_reference,
        orderId: previous.payment_reference,
        shopUpiId: provider.merchantId,
      });
    }

    const paymentId = randomUUID();
    const orderReference = `QP-${paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
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
      payment_reference: orderReference,
      amount: price.totalAmount,
      currency: 'INR',
      status: 'PENDING',
      draft_order: {
        file_name: file.file_name,
        storage_path: file.storage_path,
        page_count: file.page_count,
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
          const opened = await openPayment(activePayment, provider, requestOrigin);
          return NextResponse.json({
            ...opened,
            orderNumber: activePayment.payment_reference,
            orderId: activePayment.payment_reference,
            shopUpiId: provider.merchantId,
          });
        }

        throw new HttpError(
          409,
          'This document already has a checkout. Resume it or upload again for a new order.'
        );
      }
      throw insertError;
    }

    const opened = await openPayment(createdPayment, provider, requestOrigin);
    return NextResponse.json(
      {
        ...opened,
        orderNumber: orderReference,
        orderId: orderReference,
        shopUpiId: provider.merchantId,
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
