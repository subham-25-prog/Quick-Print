import { beforeEach, expect, test, vi } from 'vitest';
import { createCheckoutPreparation } from '@/lib/checkout-preparation';
import { compileBatchPdf } from '@/lib/batch-compiler';
import { uploadDocumentFile, UploadedFileState } from '@/lib/uploader';
import { BatchFileItem } from '@/types';

vi.mock('@/lib/batch-compiler', () => ({ compileBatchPdf: vi.fn() }));
vi.mock('@/lib/uploader', () => ({ uploadDocumentFile: vi.fn() }));

const file = new File(['pdf'], 'document.pdf', { type: 'application/pdf' });
const item: BatchFileItem = {
  id: 'first', file, name: file.name, size: file.size, pageCount: 1, copies: 1,
};
const uploaded = { uploadId: 'ready' } as UploadedFileState;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(uploadDocumentFile).mockResolvedValue(uploaded);
  vi.mocked(compileBatchPdf).mockResolvedValue({ file, totalPages: 2 });
});

test('payment joins the background upload and reuses the completed result', async () => {
  const preparation = createCheckoutPreparation();
  let finish!: (value: UploadedFileState) => void;
  vi.mocked(uploadDocumentFile).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const background = preparation.prepareUpload([item]);
  expect(preparation.prepareUpload([item])).toBe(background);
  await Promise.resolve();
  finish(uploaded);
  expect(await background).toBe(uploaded);
  expect(await preparation.prepareUpload([item])).toBe(uploaded);
  expect(uploadDocumentFile).toHaveBeenCalledTimes(1);
});

test('preview and checkout compile the batch only once', async () => {
  const preparation = createCheckoutPreparation();
  const batch = [item, { ...item, id: 'second' }];
  await preparation.prepareDocument(batch);
  await preparation.prepareUpload(batch);
  expect(compileBatchPdf).toHaveBeenCalledTimes(1);
  expect(uploadDocumentFile).toHaveBeenCalledTimes(1);
});

test('single-file copy changes reuse upload, but batch copy changes rebuild it', async () => {
  const preparation = createCheckoutPreparation();
  await preparation.prepareUpload([item]);
  await preparation.prepareUpload([{ ...item, copies: 3 }]);
  expect(uploadDocumentFile).toHaveBeenCalledTimes(1);
  const second = { ...item, id: 'second' };
  await preparation.prepareUpload([item, second]);
  await preparation.prepareUpload([{ ...item, copies: 3 }, second]);
  expect(compileBatchPdf).toHaveBeenCalledTimes(2);
  expect(uploadDocumentFile).toHaveBeenCalledTimes(3);
});

test('a failed background upload can be retried at checkout', async () => {
  const preparation = createCheckoutPreparation();
  vi.mocked(uploadDocumentFile).mockRejectedValueOnce(new Error('offline'));
  await expect(preparation.prepareUpload([item])).rejects.toThrow('offline');
  expect(await preparation.prepareUpload([item])).toBe(uploaded);
  expect(uploadDocumentFile).toHaveBeenCalledTimes(2);
});

test('an old request finishing cannot replace the new batch', async () => {
  const preparation = createCheckoutPreparation();
  let finish!: (value: UploadedFileState) => void;
  vi.mocked(uploadDocumentFile).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const old = preparation.prepareUpload([item]);
  await Promise.resolve();
  const replacement = [{ ...item, id: 'replacement' }];
  const latest = preparation.prepareUpload(replacement);
  await latest;
  finish({ uploadId: 'old' } as UploadedFileState);
  await old;
  expect(preparation.prepareUpload(replacement)).toBe(latest);
  expect(await latest).toBe(uploaded);
});
