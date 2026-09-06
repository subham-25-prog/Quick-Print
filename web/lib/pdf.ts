import { PDFDocument } from 'pdf-lib';

/**
 * Counts the number of pages in a PDF document from an ArrayBuffer or Uint8Array
 */
export async function getPdfPageCount(data: ArrayBuffer | Uint8Array): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error('Error counting PDF pages:', error);
    // If parsing fails (e.g. encrypted or malformed), default to 1 as fallback
    return 1;
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
  
  if (validMimes.includes(mimeType.toLowerCase())) return true;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext || '');
}
