import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { getPdfPageCount, isValidFileType } from '@/lib/pdf';
import { apiError, HttpError, requireSameOrigin, readBytes } from '@/lib/http';
import { createOrderAccessToken } from '@/lib/order-access';
import { rateLimit, hash } from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    await rateLimit(req, 'upload', 60);

    const contentLength = Number(req.headers.get('content-length'));
    if (contentLength > 4300000) {
      throw new HttpError(413, 'Upload must be at most 4 MB.');
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      throw new HttpError(415, 'A multipart upload is required.');
    }

    let form: FormData;
    try {
      const rawBytes = await readBytes(req, 4300000);
      form = await new Response(new Uint8Array(rawBytes), {
        headers: { 'Content-Type': contentType },
      }).formData();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'Invalid upload.');
    }

    const file = form.get('file');
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 4194304 ||
      file.name.length > 200 ||
      !isValidFileType(file.type, file.name)
    ) {
      throw new HttpError(400, 'Upload a PDF, JPG, or PNG up to 4 MB.');
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    let workingBuffer = rawBuffer;
    const extension = file.name.split('.').pop()?.toLowerCase();

    const isPdf = rawBuffer.subarray(0, 5).toString() === '%PDF-';
    const isPng = rawBuffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpg = rawBuffer[0] === 255 && rawBuffer[1] === 216 && rawBuffer[2] === 255;

    const mimeMatches =
      (isPdf && file.type === 'application/pdf') ||
      (isPng && file.type === 'image/png') ||
      (isJpg && ['image/jpeg', 'image/jpg'].includes(file.type));

    if (file.type && !mimeMatches) {
      throw new HttpError(400, 'File MIME type does not match its contents.');
    }

    if (
      isPng &&
      (rawBuffer.length < 24 ||
        rawBuffer.readUInt32BE(16) * rawBuffer.readUInt32BE(20) > 40000000)
    ) {
      throw new HttpError(422, 'Image dimensions are too large.');
    }

    const extensionMatches =
      (isPdf && extension === 'pdf') ||
      (isPng && extension === 'png') ||
      (isJpg && ['jpg', 'jpeg'].includes(extension || ''));

    if (!extensionMatches) {
      throw new HttpError(400, 'File contents do not match the extension.');
    }

    // Convert JPG/PNG to a standardized A4 PDF
    if (!isPdf) {
      try {
        const doc = await PDFDocument.create();
        const page = doc.addPage([595.28, 841.89]);
        const img = isPng
          ? await doc.embedPng(rawBuffer)
          : await doc.embedJpg(rawBuffer);

        if (img.width * img.height > 40000000) {
          throw new Error('Image too large');
        }

        const size = img.scaleToFit(555.28, 801.89);
        page.drawImage(img, {
          x: (595.28 - size.width) / 2,
          y: (841.89 - size.height) / 2,
          ...size,
        });

        workingBuffer = Buffer.from(await doc.save());
      } catch {
        throw new HttpError(422, 'This image could not be processed. Try a smaller image.');
      }
    }

    let pageCount: number;
    try {
      pageCount = await getPdfPageCount(workingBuffer);
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }

    if (workingBuffer.length > 4194304) {
      throw new HttpError(413, 'The converted document exceeds 4 MB.');
    }

    const db = database();
    const shopId = getCurrentShopId();
    const uploadId = randomUUID();
    const uploadToken = randomBytes(32).toString('hex');
    const storagePath = `${shopId}/orders/${uploadId}.pdf`;

    const previewToken = createOrderAccessToken(uploadId, 900);
    if (!previewToken) {
      throw new HttpError(503, 'Upload access security is not configured.');
    }

    const { data: bucket, error: bucketError } = await db.storage.getBucket('shop-documents');
    if (bucketError || !bucket || bucket.public) {
      throw new HttpError(503, 'Private document storage is unavailable.');
    }

    const { error: uploadError } = await db.storage
      .from('shop-documents')
      .upload(storagePath, workingBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const fileHash = createHash('sha256').update(workingBuffer).digest('hex');
    const { error: insertError } = await db.from('uploaded_files').insert({
      id: uploadId,
      shop_id: shopId,
      owner_hash: hash(uploadToken),
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: workingBuffer.length,
      page_count: pageCount,
      sha256: fileHash,
    });

    if (insertError) {
      await db.storage.from('shop-documents').remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      fileInfo: {
        uploadId,
        uploadToken,
        fileName: file.name,
        fileType: 'application/pdf',
        fileSizeBytes: workingBuffer.length,
        pageCount,
        storagePath,
        signedUrl: `/api/uploads/${uploadId}?access_token=${encodeURIComponent(previewToken)}`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
