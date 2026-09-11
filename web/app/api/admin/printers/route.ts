import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { apiError, HttpError, readJson, requireSameOrigin } from '@/lib/http';
import { getShopPrinters, setActivePrinter } from '@/lib/db';
import { textField } from '@/lib/validation';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const data = await getShopPrinters();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    requireSameOrigin(req);
    const body = await readJson(req);
    const printerName = textField(body.printerName, 200);

    if (!printerName) {
      throw new HttpError(400, 'Printer name is required.');
    }

    const activePrinter = await setActivePrinter(printerName);

    try {
      revalidatePath('/admin');
      revalidatePath('/admin/settings');
    } catch {}

    return NextResponse.json(
      {
        success: true,
        activePrinter,
        message: `Active printer set to ${activePrinter}`,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    return apiError(error);
  }
}
