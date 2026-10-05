import { PDFDocument } from 'pdf-lib';
import { BatchFileItem } from '@/types';

const MAX_COMPILED_BATCH_SIZE_BYTES = 100 * 1024 * 1024;

type BatchWorkerResult = {
  type: 'success';
  bytes: ArrayBuffer;
  fileName: string;
  totalPages: number;
} | {
  type: 'error';
  message: string;
};

function batchFileName(items: BatchFileItem[], totalPages: number): string {
  return items.length === 1
    ? items[0].name
    : `Batch_${items.length}_Documents_${totalPages}_Pages.pdf`;
}

function assertBatchSize(size: number) {
  if (size > MAX_COMPILED_BATCH_SIZE_BYTES) {
    throw new Error('The combined batch is larger than 100 MB. Remove some images or use smaller files before payment.');
  }
}

async function compileBatchPdfInWorker(items: BatchFileItem[]): Promise<{ file: File; totalPages: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./batch-compiler.worker.ts', import.meta.url));
    let settled = false;

    const stop = () => worker.terminate();
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error);
    };

    worker.onerror = () => fail(new Error('Unable to prepare this batch for printing. Please try again.'));
    worker.onmessage = (event: MessageEvent<BatchWorkerResult>) => {
      if (settled) return;
      const result = event.data;
      if (result.type === 'error') {
        fail(new Error(result.message));
        return;
      }

      settled = true;
      stop();
      assertBatchSize(result.bytes.byteLength);
      resolve({
        file: new File([result.bytes], result.fileName, { type: 'application/pdf' }),
        totalPages: result.totalPages,
      });
    };

    worker.postMessage({
      items: items.map(({ file, name, copies }) => ({ file, name, copies })),
    });
  });
}

async function fastDetectPdfPageCount(file: File): Promise<number | null> {
  try {
    const headSize = Math.min(file.size, 131072);
    const headBlob = file.slice(0, headSize);
    const headText = await headBlob.text();

    const pagesRegex = /\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g;
    let match: RegExpExecArray | null;
    let maxCount = 0;

    while ((match = pagesRegex.exec(headText)) !== null) {
      const c = parseInt(match[1], 10);
      if (c > maxCount) maxCount = c;
    }

    const pagesReversedRegex = /\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g;
    while ((match = pagesReversedRegex.exec(headText)) !== null) {
      const c = parseInt(match[1], 10);
      if (c > maxCount) maxCount = c;
    }

    if (file.size > headSize) {
      const tailOffset = Math.max(0, file.size - 131072);
      const tailBlob = file.slice(tailOffset);
      const tailText = await tailBlob.text();

      while ((match = pagesRegex.exec(tailText)) !== null) {
        const c = parseInt(match[1], 10);
        if (c > maxCount) maxCount = c;
      }
      while ((match = pagesReversedRegex.exec(tailText)) !== null) {
        const c = parseInt(match[1], 10);
        if (c > maxCount) maxCount = c;
      }
    }

    if (maxCount > 0 && maxCount < 100000) {
      return maxCount;
    }
  } catch {
    // Fall back to full parser
  }
  return null;
}

/**
 * Rapidly detect the page count of a PDF file using memory-safe partial stream inspection,
 * falling back to pdf-lib only if needed. Images (JPG, PNG) are treated as 1 page.
 */
export async function detectFilePageCount(file: File): Promise<number> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      const fastCount = await fastDetectPdfPageCount(file);
      if (fastCount !== null) {
        return Math.max(1, fastCount);
      }

      const buffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      return Math.max(1, pdf.getPageCount());
    } catch {
      return 1;
    }
  }

  return 1; // Images are 1 page
}

/**
 * Calculate the total billable pages for a batch of files considering their per-file copies.
 */
export function calculateBatchTotalPages(items: BatchFileItem[]): number {
  return items.reduce((sum, item) => sum + (item.pageCount * Math.max(1, item.copies)), 0);
}

/**
 * Compiles multiple files (PDFs and/or images) into a single unified print PDF.
 * Each document's pages are duplicated according to its configured `copies`.
 */
export async function compileBatchPdf(
  items: BatchFileItem[]
): Promise<{ file: File; totalPages: number }> {
  if (!items.length) {
    throw new Error('No files provided in batch');
  }

  // If there's only 1 PDF with 1 copy, we can preserve the original file directly
  if (
    items.length === 1 &&
    items[0].copies === 1 &&
    (items[0].file.type === 'application/pdf' || items[0].name.toLowerCase().endsWith('.pdf'))
  ) {
    return {
      file: items[0].file,
      totalPages: items[0].pageCount,
    };
  }

  // Merging many camera images is CPU-heavy. Keep it off the main thread so
  // the preview controls and payment buttons remain responsive on phones.
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return compileBatchPdfInWorker(items);
  }

  const mergedPdf = await PDFDocument.create();

  for (const item of items) {
    // Let the browser paint progress and handle input between expensive source
    // documents. This preserves the print output while avoiding a frozen UI.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const isPdf =
      item.file.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
    const isPng =
      item.file.type === 'image/png' || item.name.toLowerCase().endsWith('.png');
    const isJpg =
      item.file.type === 'image/jpeg' ||
      item.file.type === 'image/jpg' ||
      item.name.toLowerCase().endsWith('.jpg') ||
      item.name.toLowerCase().endsWith('.jpeg');

    const copies = Math.max(1, item.copies || 1);

    if (isPdf) {
      const buffer = await item.file.arrayBuffer();
      const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const indices = srcPdf.getPageIndices();

      for (let c = 0; c < copies; c++) {
        const copiedPages = await mergedPdf.copyPages(srcPdf, indices);
        for (const page of copiedPages) {
          mergedPdf.addPage(page);
        }
      }
    } else if (isPng || isJpg) {
      const imageBytes = await item.file.arrayBuffer();
      let embeddedImage;

      if (isPng) {
        embeddedImage = await mergedPdf.embedPng(imageBytes);
      } else {
        embeddedImage = await mergedPdf.embedJpg(imageBytes);
      }

      // Standard A4 dimensions in points: 595.28 x 841.89
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 20;

      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const { width, height } = embeddedImage.scaleToFit(maxWidth, maxHeight);

      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;

      for (let c = 0; c < copies; c++) {
        const page = mergedPdf.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, {
          x,
          y,
          width,
          height,
        });
      }
    }
  }

  const totalPages = mergedPdf.getPageCount();
  const mergedBytes = await mergedPdf.save();
  assertBatchSize(mergedBytes.byteLength);

  const compiledFile = new File([mergedBytes.buffer as ArrayBuffer], batchFileName(items, totalPages), {
    type: 'application/pdf',
  });

  return {
    file: compiledFile,
    totalPages,
  };
}
