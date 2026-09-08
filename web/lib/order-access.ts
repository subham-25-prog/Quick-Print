import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const DEVELOPMENT_SECRET = 'quickprint-development-order-access-secret-change-before-launch';

function secret(): string | null {
  const configured = process.env.ORDER_ACCESS_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  return configured || DEVELOPMENT_SECRET;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(orderId: string, expiresAt: number): string | null {
  const signingSecret = secret();
  return signingSecret
    ? createHmac('sha256', signingSecret).update(`${orderId}.${expiresAt}`).digest('base64url')
    : null;
}

export function createOrderAccessToken(orderId: string, ttlSeconds = TOKEN_TTL_SECONDS): string | null {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = sign(orderId, expiresAt);
  return signature ? `${expiresAt}.${signature}` : null;
}

export function hasOrderAccess(request: NextRequest, orderId: string): boolean {
  const token =
    request.nextUrl.searchParams.get('access_token') ||
    request.headers.get('x-order-access-token');

  if (!token) return false;
  if (token.split('.').length !== 2) return false;

  const [rawExpiry, suppliedSignature] = token.split('.');
  const expiresAt = Number(rawExpiry);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000) ||
    !suppliedSignature
  ) {
    return false;
  }

  const expectedSignature = sign(orderId, expiresAt);
  return Boolean(expectedSignature && safeEqual(suppliedSignature, expectedSignature));
}
