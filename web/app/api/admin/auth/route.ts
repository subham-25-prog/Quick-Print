import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

function getStoredPin(): string {
  try {
    const configPath = path.join(process.cwd(), 'uploads', 'pricing_config.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.admin_pin) return String(data.admin_pin);
    }
  } catch { }
  return process.env.ADMIN_PIN || '123456';
}

function setStoredPin(newPin: string) {
  try {
    const configPath = path.join(process.cwd(), 'uploads', 'pricing_config.json');
    let data: any = {};
    if (fs.existsSync(configPath)) {
      data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    data.admin_pin = newPin;
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save new PIN:', err);
  }
}

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get('qp_admin_session')?.value;

  if (token === 'authenticated_admin_session') {
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({ authenticated: false });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, action, newPin } = body;

    const currentPin = getStoredPin();

    if (action === 'CHANGE_PIN') {
      const cookieStore = cookies();
      const token = cookieStore.get('qp_admin_session')?.value;
      if (token !== 'authenticated_admin_session') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (!newPin || String(newPin).length < 4) {
        return NextResponse.json({ error: 'PIN must be at least 4 digits.' }, { status: 400 });
      }

      setStoredPin(String(newPin));
      return NextResponse.json({ success: true, message: 'Admin PIN updated successfully.' });
    }

    // Verify PIN
    if (String(pin).trim() === currentPin.trim()) {
      const response = NextResponse.json({ success: true, message: 'Unlocked successfully.' });
      response.cookies.set('qp_admin_session', 'authenticated_admin_session', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
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
  response.cookies.delete('qp_admin_session');
  return response;
}
