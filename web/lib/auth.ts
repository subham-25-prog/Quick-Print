import { NextRequest } from 'next/server';

/**
 * Verify print agent secret token against process.env.PRINT_AGENT_SECRET
 */
export function verifyAgentAuth(req: NextRequest): boolean {
  const configuredSecret = process.env.PRINT_AGENT_SECRET;

  // In development mode if PRINT_AGENT_SECRET is not explicitly set, use dev secret fallback
  const effectiveSecret = configuredSecret || 'qp_sec_dev_local_12345678';

  const authHeader = req.headers.get('authorization') || '';
  const agentHeader = req.headers.get('x-agent-secret') || '';

  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  return bearerToken === effectiveSecret || agentHeader === effectiveSecret;
}
