import { BatchFileItem } from '@/types';
import { compileBatchPdf } from '@/lib/batch-compiler';
import { uploadDocumentFile, UploadedFileState } from '@/lib/uploader';

// One cache per customer page. Preview and checkout share the same work;
// replacing a batch cannot let an older request overwrite its preparation.
export function createCheckoutPreparation() {
  let current: {
    key: string;
    document?: Promise<File>;
    upload?: Promise<UploadedFileState>;
  } | undefined;

  function entry(files: BatchFileItem[]) {
    if (!files.length) throw new Error('Please upload a document to proceed.');
    const key = JSON.stringify(files.map((file) => [
      file.id, file.name, file.size, file.pageCount,
      files.length > 1 ? file.copies : 1,
    ]));
    if (current?.key !== key) current = { key };
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

  function prepareUpload(files: BatchFileItem[]) {
    const cached = entry(files);
    if (!cached.upload) {
      cached.upload = prepareDocument(files).then(uploadDocumentFile).catch((error) => {
        cached.upload = undefined;
        throw error;
      });
    }
    return cached.upload;
  }

  return { prepareDocument, prepareUpload };
}
