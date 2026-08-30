import { NextRequest, NextResponse } from 'next/server';
import { getOrderById, getFileBuffer } from '@/lib/db';
import { getAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await getOrderById(params.id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 1. First priority: Check local memory & disk storage
    if (order.storage_path) {
      const localBuffer = getFileBuffer(order.storage_path);
      if (localBuffer && localBuffer.length > 0) {
        const isPdf = localBuffer.slice(0, 5).toString() === '%PDF-';
        const contentType = isPdf ? 'application/pdf' : (order.file_type || 'image/jpeg');
        const fileName = isPdf && !order.file_name.toLowerCase().endsWith('.pdf')
          ? `${order.file_name.replace(/\.[^/.]+$/, '')}.pdf`
          : order.file_name;

        return new Response(new Uint8Array(localBuffer), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
          },
        });
      }
    }

    // 2. Second priority: Supabase Cloud Storage
    const admin = getAdminClient();
    if (admin && order.storage_path) {
      const cleanPath = order.storage_path.replace(/^shop-documents\//, '');
      const { data, error } = await admin.storage.from('shop-documents').download(cleanPath);
      if (data && !error) {
        const arrayBuffer = await data.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        const isPdf = buf.slice(0, 5).toString() === '%PDF-';
        const contentType = isPdf ? 'application/pdf' : (order.file_type || 'image/jpeg');
        const fileName = isPdf && !order.file_name.toLowerCase().endsWith('.pdf')
          ? `${order.file_name.replace(/\.[^/.]+$/, '')}.pdf`
          : order.file_name;

        return new Response(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
          },
        });
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
