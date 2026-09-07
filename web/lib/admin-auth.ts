import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { getCurrentShopId } from './shop';

export const ADMIN_SESSION_COOKIE = 'qp_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEVELOPMENT_SESSION_SECRET = 'quickprint-development-session-secret-change-before-launch';
const DEVELOPMENT_PIN = '123456';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return isProduction() ? null : DEVELOPMENT_SESSION_SECRET;
}

export function configuredAdminPin(): string | null {
  const pin = process.env.ADMIN_PIN?.trim();
  if (pin && pin.length >= 12) return pin;
  return isProduction() ? null : DEVELOPMENT_PIN;
}

function signature(payload: string): string | null {
  const secret = sessionSecret();
  return secret ? createHmac('sha256', secret).update(payload).digest('base64url') : null;
}

export function isAdminSecurityConfigured(): boolean {
  return Boolean(configuredAdminPin() && sessionSecret());
}

export function verifyAdminPin(candidate: unknown): boolean {
  const pin = configuredAdminPin();
  if (typeof candidate !== 'string' || !pin) return false;
  return safeEqual(candidate.trim(), pin);
}

export function createAdminSession(): { value: string; maxAge: number } | null {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', shop: getCurrentShopId(), exp: Date.now() + SESSION_TTL_SECONDS * 1000 })
  ).toString('base64url');
  const signed = signature(payload);
  return signed ? { value: `${payload}.${signed}`, maxAge: SESSION_TTL_SECONDS } : null;
}

export function isAdminRequest(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || token.split('.').length !== 2) return false;

  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) return false;

  const expectedSignature = signature(payload);
  if (!expectedSignature || !safeEqual(providedSignature, expectedSignature)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && data.shop === getCurrentShopId() && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function adminUnauthorizedResponse() {
  return Response.json({ error: 'Administrator authentication required.' }, { status: 401 });
}
