import { NextRequest, NextResponse } from 'next/server';
import { claimNextPrintJob } from '@/lib/db';
import { agentIdentity } from '@/lib/security';
import { apiError } from '@/lib/http';

export async function POST(req: NextRequest) {
  try {
    const agentId = agentIdentity(req);
    const result = await claimNextPrintJob(agentId);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
