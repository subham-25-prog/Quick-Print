import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

const COOKIE_NAME = 'qp_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET must be configured in production.');
  }
  return secret || 'quickprint-development-session-secret-change-before-launch';
}

function signature(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createAdminSession(): { value: string; maxAge: number } {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return { value: `${payload}.${signature(payload)}`, maxAge: SESSION_TTL_SECONDS };
}

export function isAdminRequest(request: NextRequest): boolean {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) return false;

  const expectedSignature = signature(payload);
  const validSignature = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (validSignature.length !== expected.length || !timingSafeEqual(validSignature, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function adminUnauthorizedResponse() {
  return Response.json({ error: 'Administrator authentication required.' }, { status: 401 });
}

export { COOKIE_NAME };
