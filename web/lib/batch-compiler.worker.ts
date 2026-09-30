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

function isPdf(item: BatchItem): boolean {
  return item.file.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
}

function isPng(item: BatchItem): boolean {
  return item.file.type === 'image/png' || item.name.toLowerCase().endsWith('.png');
}

function batchFileName(items: BatchItem[], totalPages: number): string {
  return items.length === 1
    ? items[0].name
    : `Batch_${items.length}_Documents_${totalPages}_Pages.pdf`;
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

      const imageBytes = await item.file.arrayBuffer();
      const image = isPng(item)
        ? await mergedPdf.embedPng(imageBytes)
        : await mergedPdf.embedJpg(imageBytes);
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
