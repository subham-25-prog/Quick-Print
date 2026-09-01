import { NextRequest, NextResponse } from 'next/server';
import { claimNextPrintJob } from '@/lib/db';
import { verifyAgentAuth } from '@/lib/auth';

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
