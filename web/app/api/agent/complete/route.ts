import { NextRequest, NextResponse } from 'next/server';
import { completePrintJob } from '@/lib/db';
import { verifyAgentAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    if (!verifyAgentAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid agent secret token' }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, success = true, errorMessage, agentId } = body;

    if (!orderId || typeof agentId !== 'string' || !agentId.trim()) {
      return NextResponse.json({ error: 'orderId and agentId are required' }, { status: 400 });
    }

    await completePrintJob(orderId, success, errorMessage, agentId.trim());

    return NextResponse.json({
      success: true,
      message: `Print job for order ${orderId} marked as ${success ? 'PRINTED' : 'FAILED'}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update job status' },
      { status: 500 }
    );
  }
}
