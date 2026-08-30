import { NextRequest, NextResponse } from 'next/server';
import { recordAgentHeartbeat, getPrintAgentInfo } from '@/lib/db';

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId') || 'agent-main-pc';
    const info = await getPrintAgentInfo(agentId);
    return NextResponse.json({ agent: info });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve agent status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAgentAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid agent secret token' }, { status: 401 });
    }

    const body = await req.json();
    const { agentId = 'agent-main-pc', printerName = 'Default Printer', systemInfo = '' } = body;

    await recordAgentHeartbeat(agentId, printerName, systemInfo);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: 'ONLINE',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Heartbeat failed' },
      { status: 500 }
    );
  }
}
