import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { generateShopPosterPdf } from '@/lib/poster-pdf';

describe('Shop Poster PDF Generation', () => {
  it('generates a valid, single-page A4 PDF poster with QR code', async () => {
    const qrDataUrl = await QRCode.toDataURL('https://quickprint.example.com', {
      width: 600,
      margin: 1,
    });

    const pdfBytes = await generateShopPosterPdf({
      shopName: 'Super Prints & Xerox',
      shopAddress: 'College Main Gate, Opposite Central Library',
      qrDataUrl,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    const loadedDoc = await PDFDocument.load(pdfBytes);
    expect(loadedDoc.getPageCount()).toBe(1);

    const page = loadedDoc.getPage(0);
    const { width, height } = page.getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});
