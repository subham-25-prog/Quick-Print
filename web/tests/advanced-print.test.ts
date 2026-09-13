import { expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parsePageRange, computeEffectivePageCount } from '@/lib/page-range';
import { transformPdf } from '@/lib/pdf-transform';

async function createSamplePdf(pageCount: number, isLandscape = false): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const size: [number, number] = isLandscape ? [841.89, 595.28] : [595.28, 841.89];
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage(size);
    page.drawText(`Page ${i}`, { x: 50, y: size[1] - 50, size: 24 });
  }
  return Buffer.from(await doc.save());
}

test('parsePageRange correctly handles all modes and boundary conditions', () => {
  // ALL mode
  expect(parsePageRange(5, 'ALL')).toEqual([0, 1, 2, 3, 4]);
  expect(parsePageRange(5)).toEqual([0, 1, 2, 3, 4]);

  // ODD mode (1st, 3rd, 5th -> indices 0, 2, 4)
  expect(parsePageRange(5, 'ODD')).toEqual([0, 2, 4]);

  // EVEN mode (2nd, 4th -> indices 1, 3)
  expect(parsePageRange(5, 'EVEN')).toEqual([1, 3]);

  // RANGE mode
  expect(parsePageRange(10, 'RANGE', '1-3, 5, 8-9')).toEqual([0, 1, 2, 4, 7, 8]);
  expect(parsePageRange(5, 'RANGE', '4-2')).toEqual([1, 2, 3]); // reversed range
  expect(parsePageRange(5, 'RANGE', '0, 6, 99')).toEqual([0, 1, 2, 3, 4]); // out of bounds falls back to all
  expect(parsePageRange(5, 'RANGE', '2')).toEqual([1]);
  expect(parsePageRange(0, 'ALL')).toEqual([]);
});

test('computeEffectivePageCount calculates printed sheets accurately', () => {
  // Full 10 pages, 1-up
  expect(computeEffectivePageCount(10)).toBe(10);
  expect(computeEffectivePageCount(10, { pagesPerSheet: '1' })).toBe(10);

  // Page range 1-3 (3 pages), 1-up -> 3
  expect(computeEffectivePageCount(10, { pageRangeMode: 'RANGE', customPageRange: '1-3', pagesPerSheet: '1' })).toBe(3);

  // 10 pages, 2-up -> 5 sheets
  expect(computeEffectivePageCount(10, { pagesPerSheet: '2' })).toBe(5);

  // 7 pages, 2-up -> 4 sheets
  expect(computeEffectivePageCount(7, { pagesPerSheet: '2' })).toBe(4);

  // 7 pages, 4-up -> 2 sheets
  expect(computeEffectivePageCount(7, { pagesPerSheet: '4' })).toBe(2);

  // 8 pages, 4-up -> 2 sheets
  expect(computeEffectivePageCount(8, { pagesPerSheet: '4' })).toBe(2);

  // Odd pages of 6 pages (3 pages), 2-up -> 2 sheets
  expect(computeEffectivePageCount(6, { pageRangeMode: 'ODD', pagesPerSheet: '2' })).toBe(2);
});

test('transformPdf slices exact page ranges', async () => {
  const sample = await createSamplePdf(6);
  const transformed = await transformPdf(sample, {
    pageRangeMode: 'RANGE',
    customPageRange: '2-4',
  });

  const outDoc = await PDFDocument.load(transformed);
  expect(outDoc.getPageCount()).toBe(3);
});

test('transformPdf composes 2-up sheets correctly', async () => {
  const sample = await createSamplePdf(4);
  const transformed = await transformPdf(sample, {
    pagesPerSheet: '2',
  });

  const outDoc = await PDFDocument.load(transformed);
  expect(outDoc.getPageCount()).toBe(2); // 4 pages embedded onto 2 landscape sheets
  const firstSheet = outDoc.getPage(0);
  const { width, height } = firstSheet.getSize();
  expect(width).toBeGreaterThan(height); // Landscape A4
});

test('transformPdf composes 4-up sheets correctly', async () => {
  const sample = await createSamplePdf(8);
  const transformed = await transformPdf(sample, {
    pagesPerSheet: '4',
  });

  const outDoc = await PDFDocument.load(transformed);
  expect(outDoc.getPageCount()).toBe(2); // 8 pages embedded onto 2 portrait sheets
  const firstSheet = outDoc.getPage(0);
  const { width, height } = firstSheet.getSize();
  expect(height).toBeGreaterThan(width); // Portrait A4
});

test('transformPdf applies landscape and portrait orientation rotations', async () => {
  // Portrait source rotated to landscape
  const portraitSample = await createSamplePdf(1, false);
  const landscapeResult = await transformPdf(portraitSample, { orientation: 'LANDSCAPE' });
  const outDoc1 = await PDFDocument.load(landscapeResult);
  expect(outDoc1.getPage(0).getRotation().angle).toBe(90);

  // Landscape source rotated to portrait
  const landscapeSample = await createSamplePdf(1, true);
  const portraitResult = await transformPdf(landscapeSample, { orientation: 'PORTRAIT' });
  const outDoc2 = await PDFDocument.load(portraitResult);
  expect(outDoc2.getPage(0).getRotation().angle).toBe(90);
});

test('transformPdf stamps watermark on all pages', async () => {
  const sample = await createSamplePdf(2);
  const watermarked = await transformPdf(sample, { watermark: 'CONFIDENTIAL' });
  expect(watermarked.length).toBeGreaterThan(sample.length);

  const outDoc = await PDFDocument.load(watermarked);
  expect(outDoc.getPageCount()).toBe(2);
});

test('transformPdf returns original buffer when no transformation is requested', async () => {
  const sample = await createSamplePdf(2);
  const result = await transformPdf(sample, {
    pageRangeMode: 'ALL',
    pagesPerSheet: '1',
    orientation: 'AUTO',
    watermark: 'NONE',
  });
  expect(result).toEqual(sample);
});
