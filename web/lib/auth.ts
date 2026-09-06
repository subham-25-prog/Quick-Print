import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Verify print agent secret token against process.env.PRINT_AGENT_SECRET
 */
export function verifyAgentAuth(req: NextRequest): boolean {
  const configuredSecret = (process.env.PRINT_AGENT_SECRET || '').trim();

  const authHeader = req.headers.get('authorization') || '';
  const agentHeader = req.headers.get('x-agent-secret') || '';

  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const providedSecret = (bearerToken || agentHeader).trim();

  const developmentSecret = 'qp_sec_dev_local_12345678';
  const expectedSecret = configuredSecret || (process.env.NODE_ENV === 'production' ? '' : developmentSecret);
  if (!expectedSecret || (process.env.NODE_ENV === 'production' && expectedSecret === developmentSecret)) {
    return false;
  }

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
