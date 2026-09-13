import { NextRequest, NextResponse } from 'next/server';
import { database, getOrderById } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { hasOrderAccess } from '@/lib/order-access';
import { agentIdentity } from '@/lib/security';
import { getCurrentShopId } from '@/lib/shop';
import { apiError, HttpError } from '@/lib/http';
import { uuid } from '@/lib/validation';
import { transformPdf } from '@/lib/pdf-transform';
import { AdvancedPrintConfig } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = uuid(rawId);
    const db = database();
    const shopId = getCurrentShopId();

    let allowed = isAdminRequest(req) || hasOrderAccess(req, id);

    if (!allowed) {
      const agent = agentIdentity(req);
      const claimToken = uuid(req.headers.get('x-claim-token'));

      const { data: job, error: jobError } = await db
        .from('print_jobs')
        .select('id')
        .eq('order_id', id)
        .eq('shop_id', shopId)
        .eq('claimed_by', agent)
        .eq('claim_token', claimToken)
        .eq('status', 'CLAIMED')
        .gt('lease_until', new Date().toISOString())
        .maybeSingle();

      if (jobError) throw jobError;
      allowed = Boolean(job);
    }

    if (!allowed) {
      throw new HttpError(404, 'Document not found.');
    }

    const order = await getOrderById(id);
    if (!order) {
      throw new HttpError(404, 'Document not found.');
    }

    const { data: file, error: fileError } = await db
      .from('uploaded_files')
      .select('storage_path')
      .eq('id', order.uploaded_file_id)
      .eq('shop_id', shopId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fileError) throw fileError;
    if (!file || (!file.storage_path.startsWith('orders/') && !file.storage_path.startsWith(`${shopId}/orders/`))) {
      throw new HttpError(404, 'Document has expired.');
    }

    const { data: fileData, error: storageError } = await db.storage
      .from('shop-documents')
      .download(file.storage_path);

    if (storageError || !fileData) {
      throw new HttpError(404, 'Document unavailable.');
    }

    let advancedConfig = order.advanced_config as AdvancedPrintConfig | undefined;
    if (!advancedConfig && order.payment_id) {
      const { data: pay } = await db
        .from('payments')
        .select('draft_order')
        .eq('id', order.payment_id)
        .maybeSingle();
      if (pay?.draft_order && typeof pay.draft_order === 'object') {
        advancedConfig = (pay.draft_order as Record<string, unknown>).advanced_config as AdvancedPrintConfig | undefined;
      }
    }

    const rawBuffer = Buffer.from(await fileData.arrayBuffer());
    const processedBuffer = await transformPdf(rawBuffer, advancedConfig);

    return new NextResponse(new Uint8Array(processedBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
