import { NextRequest, NextResponse } from 'next/server';
import { apiError,readJson,requireSameOrigin } from '@/lib/http';
import { revalidatePath } from 'next/cache';
import { getActivePricing, updatePricing } from '@/lib/db';
import { defaultPricingConfig } from '@/lib/config';
import { adminUnauthorizedResponse, isAdminRequest } from '@/lib/admin-auth';
import { paymentProvider } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const pricing = await getActivePricing();
    let checkoutEnabled = false;
    try {
      await paymentProvider();
      checkoutEnabled = pricing.form_fields?.allowUpiPayment !== false;
    } catch {
      // Readiness never substitutes for verification when a payment is made.
    }
    return NextResponse.json(
      { pricing, checkoutEnabled },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const payload = body.pricing || body;

    const updated = await updatePricing(payload as Partial<import('@/types').PricingConfig>);

    // Explicitly revalidate Next.js cache paths
    try {
      revalidatePath('/');
      revalidatePath('/admin');
      revalidatePath('/admin/settings');
      revalidatePath('/admin/poster');
      revalidatePath('/admin/login');
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
    return apiError(error);
  }
}
