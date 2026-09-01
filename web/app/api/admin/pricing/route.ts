import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getActivePricing, updatePricing } from '@/lib/db';
import { defaultPricingConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const pricing = await getActivePricing();
    return NextResponse.json(
      { pricing },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching pricing:', error);
    return NextResponse.json(
      { pricing: defaultPricingConfig },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body.pricing || body;

    const updated = await updatePricing(payload);

    // Explicitly revalidate Next.js cache paths & tags
    try {
      revalidatePath('/');
      revalidatePath('/admin');
      revalidateTag('pricing');
    } catch (e) {}

    return NextResponse.json(
      {
        success: true,
        pricing: updated,
        message: 'Pricing updated successfully.',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Error updating pricing:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update pricing' },
      { status: 500 }
    );
  }
}
