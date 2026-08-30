import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getPdfPageCount, isValidFileType } from '@/lib/pdf';
import { generateOrderNumber } from '@/lib/utils';
import { saveFileBuffer } from '@/lib/db';
import { PDFDocument } from 'pdf-lib';

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

    // 2. Validate max size (50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 50 MB.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer: any = Buffer.from(arrayBuffer);

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');

    let pageCount = 1;
    let finalBuffer: any = rawBuffer;
    let finalFileType = file.type;

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
      }
    }

    // 4. Create storage path
    const fileExt = isPdf || isPng || isJpg ? 'pdf' : (file.name.split('.').pop() || 'pdf');
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `orders/${tempId}.${fileExt}`;

    // Persist printable file buffer to local storage & disk
    saveFileBuffer(storagePath, finalBuffer);

    if (finalBuffer !== rawBuffer) {
      const originalPath = `orders/${tempId}_raw.${file.name.split('.').pop() || 'jpg'}`;
      saveFileBuffer(originalPath, rawBuffer);
    }

    const admin = getAdminClient();
    let signedUrl = '';
    if (admin) {
      // Automatically ensure bucket exists
      try {
        const { data: buckets } = await admin.storage.listBuckets();
        const hasBucket = buckets?.some((b) => b.name === 'shop-documents');
        if (!hasBucket) {
          await admin.storage.createBucket('shop-documents', { public: true });
        }
      } catch (bucketErr) {
        console.warn('Supabase bucket check notice:', bucketErr);
      }

      const { error: uploadError } = await admin.storage
        .from('shop-documents')
        .upload(storagePath, finalBuffer, {
          contentType: finalFileType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Supabase storage upload notice:', uploadError.message || uploadError);
      } else {
        const { data: signedData } = await admin.storage
          .from('shop-documents')
          .createSignedUrl(storagePath, 86400); // 24 hours valid
        signedUrl = signedData?.signedUrl || '';
      }
    }

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
