import { NextRequest, NextResponse } from 'next/server';
import { getOrderById, getSignedFileUrl, getActivePricing } from '@/lib/db';
import { getShopConfig } from '@/lib/config';
import { generateUpiDeepLink } from '@/lib/pricing';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await getOrderById(params.id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const pricing = await getActivePricing();
    const shop = getShopConfig();
    const upiId = order.pricing_snapshot?.shop_upi_id || pricing.shop_upi_id || shop.upiId;
    const payeeName = order.pricing_snapshot?.shop_upi_name || pricing.shop_upi_name || shop.upiPayeeName;
    const upiLink = generateUpiDeepLink({
      upiId,
      payeeName,
      amount: order.total_amount,
      orderNumber: order.order_number,
      currency: order.currency,
    });

    const fileUrl = await getSignedFileUrl(order.storage_path);

    return NextResponse.json({
      order: {
        ...order,
        file_url: fileUrl,
      },
      upiLink,
      upiId,
      payeeName,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve order' }, { status: 500 });
  }
}
