import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { agentIdentity } from '@/lib/security';
import { getCurrentShopId } from '@/lib/shop';
import { apiError, HttpError, readJson } from '@/lib/http';
import { uuid } from '@/lib/validation';

export async function POST(req: NextRequest) {
  try {
    const agentId = agentIdentity(req);
    const body = await readJson(req);

    if (!['SUBMITTED', 'FAILED', 'REVIEW'].includes(String(body.outcome))) {
      throw new HttpError(400, 'Explicit print outcome is required.');
    }

    const { error } = await database().rpc('finish_print_job', {
      p_shop_id: getCurrentShopId(),
      p_agent_id: agentId,
      p_job_id: uuid(body.jobId),
      p_claim_token: uuid(body.claimToken),
      p_outcome: body.outcome,
    });

    if (error) {
      throw new HttpError(409, 'Completion rejected: check the job claim and current state.');
    }

    return NextResponse.json({ success: true, outcome: body.outcome });
  } catch (error) {
    return apiError(error);
  }
}
