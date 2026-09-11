import { PDFDocument } from 'pdf-lib';

/**
 * Counts the number of pages in a PDF document from an ArrayBuffer or Uint8Array
 */
export async function getPdfPageCount(data: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(data, {
      throwOnInvalidObject: true,
      parseSpeed: Infinity,
      updateMetadata: false,
    });
    const count = pdfDoc.getPageCount();
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
      throw new Error('Invalid PDF page count');
    }
    return count;
  } catch (error) {
    throw new Error('The PDF is malformed, encrypted, empty, or exceeds 1,000 pages. Export an unlocked PDF and try again.', { cause: error });
  }
}

/**
 * Validates the browser-provided metadata before server-side signature validation.
 */
export function isValidFileType(mimeType: string, fileName: string): boolean {
  const validMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext || '') &&
    (!mimeType || validMimes.includes(mimeType.toLowerCase()));
}
