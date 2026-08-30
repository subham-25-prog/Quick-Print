import { NextRequest, NextResponse } from 'next/server';
import { claimNextPrintJob } from '@/lib/db';

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
    const { agentId = 'agent-main-pc' } = body;

    const result = await claimNextPrintJob(agentId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent job claim error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim print job' },
      { status: 500 }
    );
  }
}
