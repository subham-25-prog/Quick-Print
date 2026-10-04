import { BatchFileItem } from '@/types';
import { compileBatchPdf } from '@/lib/batch-compiler';
import { uploadDocumentFile, UploadedFileState } from '@/lib/uploader';

export type CheckoutUploadProgressCallback = (
  percent: number,
  stage: 'uploading' | 'processing' | 'ready'
) => void;

// One cache per customer page. Preview and checkout share the same work;
// replacing a batch cannot let an older request overwrite its preparation.
export function createCheckoutPreparation() {
  let current: {
    key: string;
    document?: Promise<File>;
    upload?: Promise<UploadedFileState>;
    progress?: { percent: number; stage: 'uploading' | 'processing' | 'ready' };
    listeners?: Set<CheckoutUploadProgressCallback>;
  } | undefined;

  function entry(files: BatchFileItem[]) {
    if (!files.length) throw new Error('Please upload a document to proceed.');
    const key = JSON.stringify(files.map((file) => [
      file.id, file.name, file.size, file.pageCount,
      files.length > 1 ? file.copies : 1,
    ]));
    if (current?.key !== key) {
      current = { key, listeners: new Set() };
    }
    return current;
  }

  function prepareDocument(files: BatchFileItem[]) {
    const cached = entry(files);
    if (!cached.document) {
      cached.document = (files.length === 1
        ? Promise.resolve(files[0].file)
        : compileBatchPdf(files).then((result) => result.file)
      ).catch((error) => {
        cached.document = undefined;
        throw error;
      });
    }
    return cached.document;
  }

  function prepareUpload(
    files: BatchFileItem[],
    onProgress?: CheckoutUploadProgressCallback
  ) {
    const cached = entry(files);
    if (onProgress) {
      if (cached.progress) {
        onProgress(cached.progress.percent, cached.progress.stage);
      }
      cached.listeners?.add(onProgress);
    }
    if (!cached.upload) {
      cached.upload = prepareDocument(files)
        .then((file) =>
          uploadDocumentFile(file, {
            onProgress: (percent, stage) => {
              cached.progress = { percent, stage };
              cached.listeners?.forEach((cb) => {
                try {
                  cb(percent, stage);
                } catch {}
              });
            },
          })
        )
        .then((result) => {
          cached.progress = { percent: 100, stage: 'ready' };
          cached.listeners?.forEach((cb) => {
            try {
              cb(100, 'ready');
            } catch {}
          });
          return result;
        })
        .catch((error) => {
          cached.upload = undefined;
          cached.progress = undefined;
          throw error;
        });
    }
    return cached.upload;
  }

  function getProgress(files: BatchFileItem[]) {
    if (!files.length) return undefined;
    const key = JSON.stringify(files.map((file) => [
      file.id, file.name, file.size, file.pageCount,
      files.length > 1 ? file.copies : 1,
    ]));
    if (current?.key === key) {
      return current.progress;
    }
    return undefined;
  }

  return { prepareDocument, prepareUpload, getProgress };
}
