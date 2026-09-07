import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldOrders } from '@/lib/db';
import { adminUnauthorizedResponse, isAdminRequest } from '@/lib/admin-auth';
import {apiError,readJson,requireSameOrigin} from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return adminUnauthorizedResponse();
  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const retentionDays = Number(body.days) || 3;

    const result = await cleanupOldOrders(retentionDays);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Removed eligible documents older than ${retentionDays} days. Order and payment records are retained.`,
    });
  } catch (error) {
    return apiError(error);
  }
}
