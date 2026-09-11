import { NextRequest, NextResponse } from 'next/server';
import { recordAgentHeartbeat, getPrintAgentInfo } from '@/lib/db';
import { agentIdentity } from '@/lib/security';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson } from '@/lib/http';
import { textField } from '@/lib/validation';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const agent = await getPrintAgentInfo();
    return NextResponse.json({ agent });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const agentId = agentIdentity(req);
    const body = await readJson(req);

    const mode = body.mode;
    if (mode !== 'live' && mode !== 'sandbox') {
      throw new HttpError(400, 'Agent mode is required.');
    }

    const expectedEnv = process.env.PAYMENT_ENVIRONMENT || 'sandbox';
    if (mode !== expectedEnv) {
      throw new HttpError(409, 'Agent and payment environment must match.');
    }

    const printerName = textField(body.printerName, 200) || 'Unavailable';
    const systemInfo = textField(body.systemInfo, 200);

    let installedPrinters: string[] | undefined = undefined;
    if (Array.isArray(body.installedPrinters)) {
      installedPrinters = body.installedPrinters
        .filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 50)
        .map((p: string) => textField(p, 200));
    }

    const { activePrinter } = await recordAgentHeartbeat(
      agentId,
      printerName,
      systemInfo,
      mode,
      installedPrinters
    );

    return NextResponse.json({ success: true, activePrinter });
  } catch (error) {
    return apiError(error);
  }
}
