import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from './db';
import { getCurrentShopId } from './shop';
import { HttpError } from './http';

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function equalSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export function appOrigin(preferredOrigin?: string): string {
  if (preferredOrigin) {
    try {
      const u = new URL(preferredOrigin);
      const isLocalDev = process.env.NODE_ENV !== 'production' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      if (u.protocol === 'https:' || isLocalDev) {
        return u.origin;
      }
    } catch {}
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (origin && !origin.includes('quick-print-pi.vercel.app')) {
    try {
      const u = new URL(origin);
      const isLocalDev = process.env.NODE_ENV !== 'production' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      if (u.protocol === 'https:' || isLocalDev) {
        return u.origin;
      }
    } catch {}
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  if (origin) {
    try {
      const u = new URL(origin);
      return u.origin;
    } catch {}
  }

  throw new HttpError(503, 'The shop URL is not configured.');
}

export async function rateLimit(
  req: Request,
  scope: string,
  limit: number,
  seconds = 60
): Promise<void> {
  const ip = process.env.VERCEL
    ? req.headers.get('x-vercel-forwarded-for') || 'unknown'
    : 'local';
  const key = hash(`${getCurrentShopId()}:${scope}:${ip}`);

  const { data, error } = await database().rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });

  if (error) {
    throw error;
  }

  if (data !== true) {
    throw new HttpError(429, 'Too many requests. Please wait a minute and retry.');
  }
}

const DEFAULT_AGENT_ID = 'agent-main-pc';

export function agentIdentity(req: Request): string {
  const expectedId = process.env.PRINT_AGENT_ID || DEFAULT_AGENT_ID;
  const expectedSecret = process.env.PRINT_AGENT_SECRET || '';
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  const agentId = req.headers.get('x-agent-id') || '';

  if (
    !expectedId ||
    expectedSecret.length < 32 ||
    agentId !== expectedId ||
    !equalSecret(expectedSecret, token)
  ) {
    throw new HttpError(401, 'Invalid agent credentials.');
  }

  return agentId;
}
