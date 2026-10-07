import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { hasOrderAccess } from '@/lib/order-access';
import { uuid } from '@/lib/validation';
import { apiError, HttpError } from '@/lib/http';
import { rateLimit } from '@/lib/security';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = uuid(rawId);

    // Preview URLs are bearer credentials and downloading a document is
    // storage-expensive. Apply a shared per-client limit before any storage
    // or database work so a leaked link cannot be used as an amplification path.
    await rateLimit(req, 'document-preview', 20);

    if (!hasOrderAccess(req, id)) {
      throw new HttpError(404, 'Document link is invalid or expired.');
    }

    const db = database();
    const shopId = getCurrentShopId();

    const { data: fileRecord, error } = await db
      .from('uploaded_files')
      .select('storage_path, expires_at')
      .eq('id', id)
      .eq('shop_id', shopId)
      .is('deleted_at', null)
      .is('deletion_claimed_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!fileRecord || Date.parse(fileRecord.expires_at) < Date.now()) {
      throw new HttpError(404, 'Document not found.');
    }

    const { data: fileData, error: downloadError } = await db.storage
      .from('shop-documents')
      .download(fileRecord.storage_path);

    if (downloadError || !fileData) {
      throw new HttpError(404, 'Document not found.');
    }

    const buffer = await fileData.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="preview.pdf"',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
