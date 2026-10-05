import { PDFDocument } from 'pdf-lib';

type BatchItem = {
  file: File;
  name: string;
  copies: number;
};

type WorkerRequest = {
  items: BatchItem[];
};

const workerScope = self as unknown as Worker;
// 2400 px on A4's long edge is roughly 200 DPI: sharp for normal documents,
// while avoiding a 40-photo batch becoming a hundreds-of-megabytes PDF.
const MAX_PRINT_IMAGE_DIMENSION = 2400;
const MAX_PRINT_IMAGE_BYTES = 1.5 * 1024 * 1024;

function isPdf(item: BatchItem): boolean {
  return item.file.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
}

function isPng(item: BatchItem): boolean {
  return item.file.type === 'image/png' || item.name.toLowerCase().endsWith('.png');
}

function batchFileName(items: BatchItem[], _totalPages: number): string {
  return items.length === 1
    ? items[0].name
    : (items[0]?.name ? `${items[0].name.replace(/\.[^/.]+$/, '')}.pdf` : 'Print_Document.pdf');
}

async function imageBytesForPrint(item: BatchItem): Promise<{ bytes: ArrayBuffer; isPng: boolean }> {
  const originalBytes = await item.file.arrayBuffer();
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return { bytes: originalBytes, isPng: isPng(item) };
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(item.file);
    const largestEdge = Math.max(bitmap.width, bitmap.height);
    if (largestEdge <= MAX_PRINT_IMAGE_DIMENSION && item.file.size <= MAX_PRINT_IMAGE_BYTES) {
      return { bytes: originalBytes, isPng: isPng(item) };
    }

    const scale = Math.min(1, MAX_PRINT_IMAGE_DIMENSION / largestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return { bytes: originalBytes, isPng: isPng(item) };
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    // Large PNG camera/screenshot files are converted to JPEG as well. Keeping
    // them lossless can turn only a few images into a very slow upload.
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return { bytes: await blob.arrayBuffer(), isPng: false };
  } catch {
    // Preserve the original image if a browser cannot decode or resize it in a
    // worker. pdf-lib will still validate it and surface an upload error.
    return { bytes: originalBytes, isPng: isPng(item) };
  } finally {
    bitmap?.close();
  }
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  try {
    const { items } = event.data;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No files provided in batch.');
    }

    const mergedPdf = await PDFDocument.create();
    for (const item of items) {
      const copies = Math.max(1, item.copies || 1);
      if (isPdf(item)) {
        const source = await PDFDocument.load(await item.file.arrayBuffer(), { ignoreEncryption: true });
        const indices = source.getPageIndices();
        for (let copy = 0; copy < copies; copy++) {
          for (const page of await mergedPdf.copyPages(source, indices)) mergedPdf.addPage(page);
        }
        continue;
      }

      const preparedImage = await imageBytesForPrint(item);
      const image = preparedImage.isPng
        ? await mergedPdf.embedPng(preparedImage.bytes)
        : await mergedPdf.embedJpg(preparedImage.bytes);
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 20;
      const { width, height } = image.scaleToFit(pageWidth - margin * 2, pageHeight - margin * 2);
      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;
      for (let copy = 0; copy < copies; copy++) {
        const page = mergedPdf.addPage([pageWidth, pageHeight]);
        page.drawImage(image, { x, y, width, height });
      }
    }

    const totalPages = mergedPdf.getPageCount();
    const bytes = await mergedPdf.save();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    workerScope.postMessage({
      type: 'success',
      bytes: buffer,
      fileName: batchFileName(items, totalPages),
      totalPages,
    }, [buffer]);
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to prepare this batch for printing.',
    });
  }
});
