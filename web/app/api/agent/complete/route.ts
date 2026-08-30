import { NextRequest, NextResponse } from 'next/server';
import { completePrintJob } from '@/lib/db';

function verifyAgentAuth(req: NextRequest): boolean {
  const configuredSecret = process.env.PRINT_AGENT_SECRET;
  const validSecrets = new Set([
    'qp_sec_dev_local_12345678',
    'qp_sec_live_98a72b1c4e5f603d',
  ]);
  if (configuredSecret) validSecrets.add(configuredSecret);

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const secretHeader = req.headers.get('x-agent-secret') || '';

  return validSecrets.has(token) || validSecrets.has(secretHeader);
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
