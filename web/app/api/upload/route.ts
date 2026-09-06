import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getPdfPageCount, isValidFileType } from '@/lib/pdf';
import { generateOrderNumber } from '@/lib/utils';
import { getCurrentShopId } from '@/lib/shop';
import { PDFDocument } from 'pdf-lib';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function detectFileType(buffer: Buffer): 'pdf' | 'png' | 'jpg' | null {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  return null;
}

/**
 * Convert JPG/PNG image buffer to printable A4 PDF
 */
async function convertImageToA4Pdf(imageBuffer: Uint8Array | Buffer, isPng: boolean): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  const image = isPng
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);

  const margin = 20;
  const maxWidth = 595.28 - margin * 2;
  const maxHeight = 841.89 - margin * 2;
  const imgDims = image.scaleToFit(maxWidth, maxHeight);

  const x = margin + (maxWidth - imgDims.width) / 2;
  const y = margin + (maxHeight - imgDims.height) / 2;

  page.drawImage(image, {
    x,
    y,
    width: imgDims.width,
    height: imgDims.height,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes) as any;
}

export async function POST(req: NextRequest) {
  try {
    const shopId = getCurrentShopId();
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Document storage is not configured. Please contact the shopkeeper.' },
        { status: 503 }
      );
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 1. Validate file type
    if (!isValidFileType(file.type, file.name)) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please upload a PDF, JPG, or PNG document.' },
        { status: 400 }
      );
    }

    // Vercel serverless requests have a practical body-size ceiling. Keep this below it
    // so customers receive a useful validation message instead of a platform 413 error.
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File size must be between 1 byte and 4 MB.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const detectedType = detectFileType(rawBuffer);
    if (!detectedType) {
      return NextResponse.json({ error: 'The uploaded file is not a valid PDF, JPG, or PNG document.' }, { status: 400 });
    }

    const isPdf = detectedType === 'pdf';
    const isPng = detectedType === 'png';
    const isJpg = detectedType === 'jpg';

    let pageCount = 1;
    let finalBuffer: Buffer<ArrayBufferLike> = rawBuffer;
    let finalFileType = isPdf ? 'application/pdf' : (isPng ? 'image/png' : 'image/jpeg');

    if (isPdf) {
      pageCount = await getPdfPageCount(rawBuffer);
      finalFileType = 'application/pdf';
    } else if (isPng || isJpg) {
      try {
        finalBuffer = await convertImageToA4Pdf(rawBuffer, isPng);
        finalFileType = 'application/pdf';
        pageCount = 1;
      } catch (convErr) {
        console.warn('Image-to-PDF conversion notice:', convErr);
        return NextResponse.json({ error: 'Unable to convert this image into a printable PDF.' }, { status: 422 });
      }
    }

    // 4. Create storage path
    const fileExt = 'pdf';
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `${shopId}/orders/${tempId}.${fileExt}`;

    let signedUrl = '';
    const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
    if (bucketError || !buckets?.some((bucket) => bucket.name === 'shop-documents' && !bucket.public)) {
      return NextResponse.json(
        { error: 'Secure document storage is unavailable. Run the production Supabase migration before accepting uploads.' },
        { status: 503 }
      );
    }

    const { error: uploadError } = await admin.storage
      .from('shop-documents')
      .upload(storagePath, finalBuffer, {
        contentType: finalFileType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase storage upload failed:', uploadError.message || uploadError);
      return NextResponse.json({ error: 'Unable to store document securely. Please try again.' }, { status: 502 });
    }

    const { data: signedData } = await admin.storage
      .from('shop-documents')
      .createSignedUrl(storagePath, 600);
    signedUrl = signedData?.signedUrl || '';

    const previewOrderNumber = generateOrderNumber();

    return NextResponse.json({
      success: true,
      fileInfo: {
        fileName: file.name,
        fileType: finalFileType,
        fileSizeBytes: finalBuffer.length,
        pageCount,
        storagePath: `shop-documents/${storagePath}`,
        signedUrl,
        previewOrderNumber,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'File upload failed' },
      { status: 500 }
    );
  }
}
