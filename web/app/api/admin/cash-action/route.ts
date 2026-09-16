import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getCurrentShopId } from '@/lib/shop';
import { uuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const reference = uuid(body.orderId);
    if (body.action !== 'ACCEPT' && body.action !== 'REJECT') {
      throw new HttpError(400, 'Choose ACCEPT or REJECT.');
    }
    // Resolve, lock and validate the cash payment inside one transaction.
    // Never fall back to deleting orders or manually finalizing online payments.
    const { data, error } = await database().rpc('resolve_cash_payment', {
      p_shop_id: getCurrentShopId(), p_reference: reference, p_action: body.action,
    });
    if (error) {
      console.error('Cash action failed:', error);
      if (error.code === 'PGRST202') {
        throw new HttpError(
          409,
          'Database setup required: Please run migration 20260913052027_secure_cash_actions.sql in Supabase SQL Editor to enable cash verification.'
        );
      }
      throw new HttpError(409, error.message || 'Cash action could not be completed. Refresh the order status before retrying.');
    }
    if (body.action === 'ACCEPT' && !data) {
      throw new HttpError(409, 'This payment needs review. No new print job was created.');
    }
    return NextResponse.json({ success: true, orderId: data,
      message: body.action === 'ACCEPT' ? 'Cash payment accepted. Print job queued.' : 'Cash payment rejected.',
    });
  } catch (error) {
    return apiError(error);
  }
}
