export interface UploadedFileState {
  uploadId: string;
  uploadToken: string;
  checkoutKey: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  pageCount: number;
  storagePath: string;
  signedUrl?: string;
  previewUrl?: string;
}

export interface UploadOptions {
  onProgress?: (percent: number, stage: 'uploading' | 'processing') => void;
  onXhrCreated?: (xhr: XMLHttpRequest) => void;
}

const CHUNK_SIZE = 3 * 1024 * 1024;
const CHUNK_UPLOAD_TIMEOUT_MS = 180000;
// The server allows five minutes for the final chunk to assemble, validate and
// store a large document. Keep the browser alive a little longer so it receives
// the server's useful response instead of reporting a generic connection error.
const FINALIZATION_TIMEOUT_MS = 330000;

function uploadFailureMessage(xhr: XMLHttpRequest, fallback: string): string {
  if (xhr.status === 504) {
    return 'This document took too long to process. Please retry; if it keeps failing, compress the PDF or split it into smaller files.';
  }

  try {
    const response = JSON.parse(xhr.responseText) as { error?: unknown };
    if (typeof response.error === 'string' && response.error.trim()) return response.error;
  } catch {
    // A proxy error page is not JSON. Use the actionable fallback below.
  }

  return fallback;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    return Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += Math.floor(Math.random() * 16).toString(16);
  }
  return result;
}

/**
 * Uploads a document (PDF or image) using single multipart or chunked upload (> 3MB)
 * to /api/upload. Works cleanly in browser environment.
 */
export async function uploadDocumentFile(
  file: File,
  options?: UploadOptions
): Promise<UploadedFileState> {
  const { onProgress, onXhrCreated } = options || {};

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  let resultFileInfo: {
    uploadId: string;
    uploadToken: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
    pageCount: number;
    storagePath: string;
    signedUrl: string;
  } | null = null;

  if (totalChunks > 1) {
    const uploadId = generateUUID();
    const uploadToken = generateToken();

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end, file.type || 'application/pdf');

      const chunkFormData = new FormData();
      chunkFormData.append('file', chunkBlob, file.name);
      chunkFormData.append('chunkIndex', String(chunkIndex));
      chunkFormData.append('totalChunks', String(totalChunks));
      chunkFormData.append('uploadId', uploadId);
      chunkFormData.append('uploadToken', uploadToken);
      chunkFormData.append('fileName', file.name);
      chunkFormData.append('fileSizeBytes', String(file.size));

      if (chunkIndex === totalChunks - 1) {
        onProgress?.(88, 'processing');
      }

      const chunkResult = await new Promise<{
        success: boolean;
        chunkReceived?: number;
        fileInfo?: {
          uploadId: string;
          uploadToken: string;
          fileName: string;
          fileType: string;
          fileSizeBytes: number;
          pageCount: number;
          storagePath: string;
          signedUrl: string;
        };
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        onXhrCreated?.(xhr);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const chunkBase = (chunkIndex / totalChunks) * 88;
            const chunkFraction = (event.loaded / event.total) * (88 / totalChunks);
            const percent = Math.min(Math.round(chunkBase + chunkFraction), 88);
            onProgress?.(percent, percent >= 85 ? 'processing' : 'uploading');
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(res);
            } catch {
              reject(new Error('Invalid response received from server.'));
            }
          } else {
            reject(new Error(uploadFailureMessage(xhr, `Upload failed with status ${xhr.status}. Please try again.`)));
          }
        };

        xhr.onerror = () => reject(new Error('The upload connection was interrupted. Check your internet connection and retry the document.'));
        xhr.ontimeout = () => reject(new Error('This document is taking longer than expected to process. Please retry; if it keeps failing, compress the PDF or split it into smaller files.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));

        xhr.timeout = chunkIndex === totalChunks - 1 ? FINALIZATION_TIMEOUT_MS : CHUNK_UPLOAD_TIMEOUT_MS;
        xhr.open('POST', '/api/upload');
        xhr.send(chunkFormData);
      });

      if (chunkIndex === totalChunks - 1) {
        if (!chunkResult.fileInfo) {
          throw new Error('Upload finalized but file information was not returned.');
        }
        onProgress?.(100, 'processing');
        resultFileInfo = chunkResult.fileInfo;
      }
    }
  } else {
    // Single request upload for <= 3 MB
    const formData = new FormData();
    formData.append('file', file);

    const result = await new Promise<{
      success: boolean;
      fileInfo: {
        uploadId: string;
        uploadToken: string;
        fileName: string;
        fileType: string;
        fileSizeBytes: number;
        pageCount: number;
        storagePath: string;
        signedUrl: string;
      };
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      onXhrCreated?.(xhr);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(Math.round((event.loaded / event.total) * 92), 92);
          onProgress?.(percent, percent >= 90 ? 'processing' : 'uploading');
        }
      };

      xhr.onload = () => {
        onProgress?.(100, 'processing');
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res);
          } catch {
            reject(new Error('Invalid response received from server.'));
          }
        } else {
          reject(new Error(uploadFailureMessage(xhr, 'Failed to upload document. Please try again.')));
        }
      };

      xhr.onerror = () => reject(new Error('The upload connection was interrupted. Check your internet connection and retry the document.'));
      xhr.ontimeout = () => reject(new Error('This document is taking longer than expected to process. Please retry; if it keeps failing, compress the PDF or split it into smaller files.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));

      xhr.timeout = FINALIZATION_TIMEOUT_MS;
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });

    resultFileInfo = result.fileInfo;
  }

  if (!resultFileInfo) {
    throw new Error('Upload failed to produce file information.');
  }

  return {
    uploadId: resultFileInfo.uploadId,
    uploadToken: resultFileInfo.uploadToken,
    checkoutKey: generateUUID(),
    file,
    fileName: file.name,
    fileType: resultFileInfo.fileType || file.type,
    fileSizeBytes: resultFileInfo.fileSizeBytes || file.size,
    pageCount: resultFileInfo.pageCount || 1,
    storagePath: resultFileInfo.storagePath || `orders/${file.name}`,
    signedUrl: resultFileInfo.signedUrl,
    previewUrl: resultFileInfo.signedUrl,
  };
}
