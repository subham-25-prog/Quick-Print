import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  isAdminRequest,
  isAdminSecurityConfigured,
  verifyAdminPin,
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: isAdminRequest(req) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, action } = body;

    if (action === 'CHANGE_PIN') {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json(
        { error: 'Change ADMIN_PIN in your hosting environment to update the administrator credential.' },
        { status: 409 }
      );
    }

    if (!isAdminSecurityConfigured()) {
      return NextResponse.json(
        { error: 'Administrator security is not configured. Set ADMIN_PIN and ADMIN_SESSION_SECRET.' },
        { status: 503 }
      );
    }

    if (verifyAdminPin(pin)) {
      const session = createAdminSession();
      if (!session) throw new Error('Administrator session security is not configured.');
      const response = NextResponse.json({ success: true, message: 'Unlocked successfully.' });
      response.cookies.set(ADMIN_SESSION_COOKIE, session.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: session.maxAge,
      });
      return response;
    }

    return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 });

  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Locked successfully.' });
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
