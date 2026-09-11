import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import { getPdfPageCount, isValidFileType } from '@/lib/pdf';
import { apiError, HttpError, requireSameOrigin } from '@/lib/http';
import { createOrderAccessToken } from '@/lib/order-access';
import { rateLimit, hash } from '@/lib/security';

// In-memory cache for bucket verification so we don't repeat the remote GET bucket call on every upload
let lastBucketVerifiedAt = 0;
const BUCKET_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_CONTENT_LENGTH_BYTES = 105 * 1024 * 1024; // 105 MB multipart overhead

export const maxDuration = 60;

async function ensurePrivateBucket(db: ReturnType<typeof database>) {
  const now = Date.now();
  if (now - lastBucketVerifiedAt < BUCKET_CACHE_TTL_MS) {
    return;
  }
  const { data: bucket, error: bucketError } = await db.storage.getBucket('shop-documents');
  if (bucketError || !bucket || bucket.public) {
    throw new HttpError(503, 'Private document storage is unavailable.');
  }

  // Ensure remote bucket allows large file uploads up to 100 MB
  if (!bucket.file_size_limit || bucket.file_size_limit < MAX_FILE_SIZE_BYTES) {
    try {
      await db.storage.updateBucket('shop-documents', {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
      });
    } catch (e) {
      console.warn('Could not auto-update bucket fileSizeLimit:', e);
    }
  }

  lastBucketVerifiedAt = now;
}

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);

    const contentType = req.headers.get('content-type') || '';

    // Handle Direct-to-Storage JSON actions (prepare / finalize) for large file uploads
    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body?.action === 'prepare') {
        return await handlePrepareUpload(req, body);
      }
      if (body?.action === 'finalize') {
        return await handleFinalizeUpload(req, body);
      }
      throw new HttpError(400, 'Invalid upload action.');
    }

    const contentLength = Number(req.headers.get('content-length'));
    if (contentLength > MAX_CONTENT_LENGTH_BYTES) {
      throw new HttpError(413, 'Upload must be at most 100 MB.');
    }

    if (!contentType.startsWith('multipart/form-data')) {
      throw new HttpError(415, 'A multipart or direct upload is required.');
    }

    // Overlap rate limit database RPC with multipart body parsing to eliminate sequential delay
    const [, form] = await Promise.all([
      rateLimit(req, 'upload', 10),
      (async () => {
        try {
          return await req.formData();
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(400, 'Invalid upload.');
        }
      })(),
    ]);

    const file = form.get('file');
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > MAX_FILE_SIZE_BYTES ||
      file.name.length > 200 ||
      !isValidFileType(file.type, file.name)
    ) {
      throw new HttpError(400, 'Upload a PDF, JPG, or PNG up to 100 MB.');
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    let workingBuffer = rawBuffer;

    const isPdf = rawBuffer.subarray(0, 1024).includes('%PDF-');
    const isPng =
      rawBuffer.length >= 8 &&
      rawBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpg =
      rawBuffer.length >= 3 &&
      rawBuffer[0] === 255 &&
      rawBuffer[1] === 216 &&
      rawBuffer[2] === 255;

    if (!isPdf && !isPng && !isJpg) {
      throw new HttpError(400, 'Invalid file format. Please upload a valid PDF, JPG, or PNG document.');
    }

    if (
      isPng &&
      (rawBuffer.length < 24 ||
        rawBuffer.readUInt32BE(16) * rawBuffer.readUInt32BE(20) > 40000000)
    ) {
      throw new HttpError(422, 'Image dimensions are too large.');
    }

    let pageCount: number;

    // Convert JPG/PNG to a standardized A4 PDF
    if (!isPdf) {
      try {
        const doc = await PDFDocument.create({ updateMetadata: false });
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

        workingBuffer = Buffer.from(await doc.save({ useObjectStreams: false }));
        pageCount = 1; // Images converted to 1-page PDF; skip redundant PDF reload
      } catch {
        throw new HttpError(422, 'This image could not be processed. Try a smaller image.');
      }
    } else {
      try {
        pageCount = await getPdfPageCount(workingBuffer);
      } catch (e) {
        throw new HttpError(422, (e as Error).message);
      }
    }

    if (workingBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new HttpError(413, 'The converted document exceeds 100 MB.');
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

    await ensurePrivateBucket(db);

    const { error: uploadError } = await db.storage
      .from('shop-documents')
      .upload(storagePath, workingBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new HttpError(500, uploadError.message || 'Storage upload failed.');
    }

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
      console.error('Database insert error:', insertError);
      if (
        insertError.message?.includes('file_size_bytes') ||
        insertError.message?.includes('check constraint') ||
        insertError.message?.includes('uploaded_files_file_size_bytes_check')
      ) {
        throw new HttpError(
          400,
          'Database check constraint needs relaxation. Run the SQL script in Supabase: ALTER TABLE public.uploaded_files DROP CONSTRAINT IF EXISTS uploaded_files_file_size_bytes_check;'
        );
      }
      throw new HttpError(500, insertError.message || 'Could not save document record.');
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

async function handlePrepareUpload(req: NextRequest, body: any) {
  const { fileName, fileSizeBytes, fileType } = body;
  if (
    typeof fileName !== 'string' ||
    fileName.length > 200 ||
    typeof fileSizeBytes !== 'number' ||
    fileSizeBytes < 1 ||
    fileSizeBytes > MAX_FILE_SIZE_BYTES ||
    !isValidFileType(fileType, fileName)
  ) {
    throw new HttpError(400, 'Upload a PDF, JPG, or PNG up to 100 MB.');
  }

  await rateLimit(req, 'upload', 10);
  const db = database();
  await ensurePrivateBucket(db);

  const shopId = getCurrentShopId();
  const uploadId = randomUUID();
  const uploadToken = randomBytes(32).toString('hex');
  const storagePath = `${shopId}/orders/${uploadId}.pdf`;

  const { data: signData, error: signError } = await db.storage
    .from('shop-documents')
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signError || !signData) {
    console.error('createSignedUploadUrl error:', signError);
    throw new HttpError(500, 'Failed to prepare upload destination.');
  }

  return NextResponse.json({
    success: true,
    uploadId,
    uploadToken,
    storagePath,
    signedUrl: signData.signedUrl,
    token: signData.token,
  });
}

async function handleFinalizeUpload(_req: NextRequest, body: any) {
  const { uploadId, uploadToken, storagePath, fileName } = body;
  if (!uploadId || !uploadToken || !storagePath || !fileName) {
    throw new HttpError(400, 'Missing upload parameters.');
  }

  const shopId = getCurrentShopId();
  if (!storagePath.startsWith(`${shopId}/orders/${uploadId}`)) {
    throw new HttpError(400, 'Invalid storage path.');
  }

  const db = database();
  await ensurePrivateBucket(db);

  // Download uploaded file directly from Supabase Storage (outgoing server-side fetch)
  const { data: fileBlob, error: downloadError } = await db.storage
    .from('shop-documents')
    .download(storagePath);

  if (downloadError || !fileBlob) {
    console.error('Storage download error:', downloadError);
    throw new HttpError(404, 'Uploaded file not found in storage.');
  }

  const rawBuffer = Buffer.from(await fileBlob.arrayBuffer());
  let workingBuffer = rawBuffer;

  const isPdf = rawBuffer.subarray(0, 5).toString() === '%PDF-';
  const isPng = rawBuffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpg = rawBuffer[0] === 255 && rawBuffer[1] === 216 && rawBuffer[2] === 255;

  let pageCount: number;

  if (!isPdf) {
    if (!isPng && !isJpg) {
      await db.storage.from('shop-documents').remove([storagePath]);
      throw new HttpError(400, 'Uploaded file is not a valid PDF or image.');
    }
    // Convert image to standardized A4 PDF
    try {
      const doc = await PDFDocument.create({ updateMetadata: false });
      const page = doc.addPage([595.28, 841.89]);
      const img = isPng ? await doc.embedPng(rawBuffer) : await doc.embedJpg(rawBuffer);
      const size = img.scaleToFit(555.28, 801.89);
      page.drawImage(img, {
        x: (595.28 - size.width) / 2,
        y: (841.89 - size.height) / 2,
        ...size,
      });
      workingBuffer = Buffer.from(await doc.save({ useObjectStreams: false }));
      pageCount = 1;
      await db.storage.from('shop-documents').upload(storagePath, workingBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    } catch {
      await db.storage.from('shop-documents').remove([storagePath]);
      throw new HttpError(422, 'This image could not be processed.');
    }
  } else {
    try {
      pageCount = await getPdfPageCount(workingBuffer);
    } catch (e) {
      await db.storage.from('shop-documents').remove([storagePath]);
      throw new HttpError(422, (e as Error).message);
    }
  }

  if (workingBuffer.length > MAX_FILE_SIZE_BYTES) {
    await db.storage.from('shop-documents').remove([storagePath]);
    throw new HttpError(413, 'The converted document exceeds 100 MB.');
  }

  const previewToken = createOrderAccessToken(uploadId, 900);
  if (!previewToken) {
    throw new HttpError(503, 'Upload access security is not configured.');
  }

  const fileHash = createHash('sha256').update(workingBuffer).digest('hex');
  const { error: insertError } = await db.from('uploaded_files').insert({
    id: uploadId,
    shop_id: shopId,
    owner_hash: hash(uploadToken),
    storage_path: storagePath,
    file_name: fileName,
    file_size_bytes: workingBuffer.length,
    page_count: pageCount,
    sha256: fileHash,
  });

  if (insertError) {
    await db.storage.from('shop-documents').remove([storagePath]);
    if (
      insertError.message?.includes('file_size_bytes') ||
      insertError.message?.includes('check constraint') ||
      insertError.message?.includes('uploaded_files_file_size_bytes_check')
    ) {
      throw new HttpError(
        400,
        'Database constraint requires updating: please run the SQL migration in Supabase SQL Editor: ALTER TABLE public.uploaded_files DROP CONSTRAINT IF EXISTS uploaded_files_file_size_bytes_check;'
      );
    }
    throw new HttpError(500, insertError.message || 'Could not save document record.');
  }

  return NextResponse.json({
    success: true,
    fileInfo: {
      uploadId,
      uploadToken,
      fileName,
      fileType: 'application/pdf',
      fileSizeBytes: workingBuffer.length,
      pageCount,
      storagePath,
      signedUrl: `/api/uploads/${uploadId}?access_token=${encodeURIComponent(previewToken)}`,
    },
  });
}
