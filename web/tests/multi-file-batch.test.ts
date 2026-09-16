import { expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  detectFilePageCount,
  calculateBatchTotalPages,
  compileBatchPdf,
} from '@/lib/batch-compiler';
import { BatchFileItem } from '@/types';

async function createDummyPdf(pageCount = 1): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200, 200]);
  }
  const bytes = await doc.save();
  return new File([bytes], `test_${pageCount}p.pdf`, { type: 'application/pdf' });
}

test('detectFilePageCount correctly counts PDF pages', async () => {
  const pdf3 = await createDummyPdf(3);
  const count = await detectFilePageCount(pdf3);
  expect(count).toBe(3);

  const img = new File(['fake image'], 'photo.jpg', { type: 'image/jpeg' });
  const imgCount = await detectFilePageCount(img);
  expect(imgCount).toBe(1);
});

test('calculateBatchTotalPages calculates sum of pageCount * copies', () => {
  const batch: BatchFileItem[] = [
    { id: '1', file: {} as File, name: 'A.pdf', size: 100, pageCount: 5, copies: 2 },
    { id: '2', file: {} as File, name: 'B.pdf', size: 200, pageCount: 3, copies: 1 },
    { id: '3', file: {} as File, name: 'C.jpg', size: 300, pageCount: 1, copies: 4 },
  ];

  // 5*2 + 3*1 + 1*4 = 10 + 3 + 4 = 17
  const total = calculateBatchTotalPages(batch);
  expect(total).toBe(17);
});

test('compileBatchPdf compiles multiple PDFs with per-file copies', async () => {
  const pdf1 = await createDummyPdf(2);
  const pdf2 = await createDummyPdf(3);

  const batch: BatchFileItem[] = [
    { id: '1', file: pdf1, name: 'First.pdf', size: pdf1.size, pageCount: 2, copies: 2 },
    { id: '2', file: pdf2, name: 'Second.pdf', size: pdf2.size, pageCount: 3, copies: 1 },
  ];

  // (2 pages * 2 copies) + (3 pages * 1 copy) = 7 pages total
  const result = await compileBatchPdf(batch);
  expect(result.totalPages).toBe(7);

  const parsed = await PDFDocument.load(await result.file.arrayBuffer());
  expect(parsed.getPageCount()).toBe(7);
});
