import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldOrders } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const retentionDays = Number(body.days) || 3;

    const result = await cleanupOldOrders(retentionDays);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Cleaned up orders and storage files older than ${retentionDays} days.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 }
    );
  }
}
