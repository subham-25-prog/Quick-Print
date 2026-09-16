import { PDFDocument } from 'pdf-lib';
import { BatchFileItem } from '@/types';

/**
 * Rapidly detect the page count of a PDF file using pdf-lib client-side.
 * Images (JPG, PNG) are treated as 1 page.
 */
export async function detectFilePageCount(file: File): Promise<number> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
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

  const mergedPdf = await PDFDocument.create();

  for (const item of items) {
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

  const fileName =
    items.length === 1
      ? items[0].name
      : `Batch_${items.length}_Documents_${totalPages}_Pages.pdf`;

  const compiledFile = new File([mergedBytes.buffer as ArrayBuffer], fileName, {
    type: 'application/pdf',
  });

  return {
    file: compiledFile,
    totalPages,
  };
}
