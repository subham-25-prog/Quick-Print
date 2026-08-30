import { NextRequest, NextResponse } from 'next/server';
import { completePrintJob } from '@/lib/db';

function verifyAgentAuth(req: NextRequest): boolean {
  const configuredSecret = process.env.PRINT_AGENT_SECRET || 'qp_sec_dev_local_12345678';
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const secretHeader = req.headers.get('x-agent-secret') || '';

  return token === configuredSecret || secretHeader === configuredSecret;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAgentAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid agent secret token' }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, success = true, errorMessage } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    await completePrintJob(orderId, success, errorMessage);

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
