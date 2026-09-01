import { NextRequest, NextResponse } from 'next/server';
import { getOrderById, getFileBuffer, getAllOrders } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetId = params.id;
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

    // 2. Check Supabase Cloud Storage
    const admin = getAdminClient();
    if (admin && order.storage_path) {
      try {
        const cleanPath = order.storage_path.replace(/^shop-documents\//, '');
        const { data, error } = await admin.storage.from('shop-documents').download(cleanPath);
        if (data && !error) {
          const arrayBuffer = await data.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          if (buf.length > 0) {
            return createBufferResponse(buf);
          }
        }
      } catch (sErr) {
        console.warn('Supabase storage download notice:', sErr);
      }
    }

    // 3. Check order.file_url (Data URL or Remote HTTP URL)
    if (order.file_url) {
      if (order.file_url.startsWith('data:')) {
        const base64Data = order.file_url.split(',')[1];
        if (base64Data) {
          const buf = Buffer.from(base64Data, 'base64');
          if (buf.length > 0) return createBufferResponse(buf);
        }
      } else if (order.file_url.startsWith('http://') || order.file_url.startsWith('https://')) {
        try {
          const res = await fetch(order.file_url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);
            if (buf.length > 0) return createBufferResponse(buf);
          }
        } catch (fetchErr) {
          console.warn('Remote file_url fetch notice:', fetchErr);
        }
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
