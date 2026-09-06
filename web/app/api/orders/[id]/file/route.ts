import { NextRequest, NextResponse } from 'next/server';
import { getOrderById, getFileBuffer, getAllOrders } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';
import { isAdminRequest } from '@/lib/admin-auth';
import { verifyAgentAuth } from '@/lib/auth';
import { hasOrderAccess } from '@/lib/order-access';
import { getCurrentShopId } from '@/lib/shop';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isAdmin = isAdminRequest(req);
    const agentId = req.headers.get('x-agent-id')?.trim();
    const agentAuthenticated = verifyAgentAuth(req);
    let agentHasClaimedJob = false;

    // An agent may only retrieve the document it has atomically claimed. The
    // bearer secret alone is deliberately insufficient to browse all files.
    if (agentAuthenticated && agentId) {
      const admin = getAdminClient();
      if (admin) {
        const { data } = await admin
          .from('print_jobs')
          .select('id')
          .eq('order_id', id)
          .eq('shop_id', getCurrentShopId())
          .eq('claimed_by', agentId)
          .eq('status', 'PRINTING')
          .maybeSingle();
        agentHasClaimedJob = Boolean(data);
      } else if (process.env.NODE_ENV !== 'production') {
        agentHasClaimedJob = true;
      }
    }

    const hasPrivilegedAccess = isAdmin || agentHasClaimedJob;
    if (!hasPrivilegedAccess && !hasOrderAccess(req, id)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const targetId = id;
    let order = await getOrderById(targetId);

    if (!order) {
      const all = await getAllOrders();
      order = all.find(
        (o) =>
          o.id === targetId ||
          o.id.toLowerCase() === targetId.toLowerCase() ||
          o.order_number?.toUpperCase() === targetId.toUpperCase()
      ) || null;
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const fileName = order.file_name || 'document.pdf';
    const fileType = order.file_type || 'application/pdf';

    // Helper to format 200 response
    const createBufferResponse = (buf: Buffer) => {
      const isPdf = buf.slice(0, 5).toString() === '%PDF-';
      const contentType = isPdf ? 'application/pdf' : fileType;
      const finalFileName = isPdf && !fileName.toLowerCase().endsWith('.pdf')
        ? `${fileName.replace(/\.[^/.]+$/, '')}.pdf`
        : fileName;

      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(finalFileName)}"`,
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, no-store',
        },
      });
    };

    // 1. Check local disk storage by storage_path or file_name
    if (order.storage_path || fileName) {
      const pathToCheck = order.storage_path || fileName;
      const localBuffer = getFileBuffer(pathToCheck);
      if (localBuffer && localBuffer.length > 0) {
        return createBufferResponse(localBuffer);
      }
    }

    // 2. Check Supabase Cloud Storage with multiple path candidates
    const admin = getAdminClient();
    if (admin) {
      const pathsToTry = Array.from(
        new Set([
          (order.storage_path || '').replace(/^shop-documents\//, ''),
          order.storage_path,
          order.id,
          order.file_name,
          `${order.id}.pdf`,
          `${order.id}.png`,
          `${order.id}.jpg`,
        ].filter(Boolean))
      );

      for (const pathCandidate of pathsToTry) {
        try {
          const { data, error } = await admin.storage.from('shop-documents').download(pathCandidate);
          if (data && !error) {
            const arrayBuffer = await data.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);
            if (buf.length > 0) {
              return createBufferResponse(buf);
            }
          }
        } catch (sErr) {}
      }
    }

    return NextResponse.json({ error: 'Document file not found' }, { status: 404 });
  } catch (error) {
    console.error('File retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve document file' },
      { status: 500 }
    );
  }
}
