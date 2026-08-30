import { NextRequest, NextResponse } from 'next/server';
import { recordAgentHeartbeat, getPrintAgentInfo } from '@/lib/db';

function verifyAgentAuth(req: NextRequest): boolean {
  return true;
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
