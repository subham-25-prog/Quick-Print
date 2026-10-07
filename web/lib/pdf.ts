import { PDFDocument } from 'pdf-lib';

export const MAX_PRINT_IMAGE_PIXELS = 40_000_000;

export type ImageDimensions = { width: number; height: number };

function assertSafeImageDimensions(width: number, height: number): ImageDimensions {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_PRINT_IMAGE_PIXELS
  ) {
    throw new Error('Image dimensions are too large.');
  }
  return { width, height };
}

/**
 * Read PNG dimensions from its mandatory IHDR chunk before asking an image
 * decoder to allocate pixels. This rejects malformed input and pixel bombs
 * without relying on a browser or PDF library to fail safely first.
 */
export function getPngDimensions(data: Uint8Array): ImageDimensions {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    data.length < 24 ||
    !signature.every((value, index) => data[index] === value) ||
    data[8] !== 0 || data[9] !== 0 || data[10] !== 0 || data[11] !== 13 ||
    data[12] !== 73 || data[13] !== 72 || data[14] !== 68 || data[15] !== 82
  ) {
    throw new Error('Invalid PNG image.');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return assertSafeImageDimensions(view.getUint32(16), view.getUint32(20));
}

/**
 * Read JPEG dimensions from a Start Of Frame marker. JPEGs can contain very
 * large declared dimensions, so this runs before pdf-lib decodes the image.
 */
export function getJpegDimensions(data: Uint8Array): ImageDimensions {
  if (data.length < 9 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('Invalid JPEG image.');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) throw new Error('Invalid JPEG image.');
    while (offset < data.length && data[offset] === 0xff) offset++;
    if (offset >= data.length) break;

    const marker = data[offset++];
    // Standalone SOI, EOI, restart and TEM markers have no segment length.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > data.length) break;
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      throw new Error('Invalid JPEG image.');
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (segmentLength < 8) throw new Error('Invalid JPEG image.');
      return assertSafeImageDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }

    // A Start of Scan before a Start of Frame is not a decodable JPEG.
    if (marker === 0xda) break;
    offset += segmentLength;
  }

  throw new Error('Invalid JPEG image.');
}

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
