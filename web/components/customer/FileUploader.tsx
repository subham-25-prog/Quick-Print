'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText, AlertCircle, RefreshCw, X } from '@/components/ui/Icons';

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

interface FileUploaderProps {
  onFileUploaded: (fileData: UploadedFileState | null) => void;
  uploadedFile: UploadedFileState | null;
}

function formatFileSize(bytes: number): string {
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

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileUploaded, uploadedFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'uploading' | 'processing'>('uploading');
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeXhr = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    return () => {
      if (activeXhr.current) {
        activeXhr.current.abort();
      }
    };
  }, []);

  const processFile = async (file: File) => {
    if (uploading || activeXhr.current) return;
    setError(null);

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage =
      file.type.startsWith('image/') ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg') ||
      file.name.toLowerCase().endsWith('.png');

    if (!isPdf && !isImage) {
      setError('Please upload a PDF or image file (JPG, PNG)');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('File size must be less than 100 MB');
      return;
    }

    setUploading(true);
    setUploadProgress(5);
    setUploadStage('uploading');
    setCurrentFileName(file.name);
    setCurrentFileSize(file.size);

    try {
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

      // Files > 3 MB are sliced into 3 MB chunks to stay safely under Vercel's 4.5 MB request body limit.
      // All chunks are sent to same-origin /api/upload (zero CORS, zero client-side Supabase keys).
      const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

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
            setUploadStage('processing');
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
            activeXhr.current = xhr;

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const chunkBase = (chunkIndex / totalChunks) * 88;
                const chunkFraction = (event.loaded / event.total) * (88 / totalChunks);
                const percent = Math.min(Math.round(chunkBase + chunkFraction), 88);
                setUploadProgress(percent);
                if (percent >= 85) {
                  setUploadStage('processing');
                }
              }
            };

            xhr.onload = () => {
              activeXhr.current = null;
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const res = JSON.parse(xhr.responseText);
                  resolve(res);
                } catch {
                  reject(new Error('Invalid response received from server.'));
                }
              } else {
                try {
                  const res = JSON.parse(xhr.responseText);
                  reject(new Error(res.error || `Upload failed with status ${xhr.status}`));
                } catch {
                  reject(new Error(`Upload failed with status ${xhr.status}`));
                }
              }
            };

            xhr.onerror = () => {
              activeXhr.current = null;
              reject(new Error('Network connection failed during upload.'));
            };

            xhr.ontimeout = () => {
              activeXhr.current = null;
              reject(new Error('Upload timed out. Please try again.'));
            };

            xhr.onabort = () => {
              activeXhr.current = null;
              reject(new Error('Upload cancelled.'));
            };

            xhr.timeout = 180000; // 3 minutes per 3 MB chunk
            xhr.open('POST', '/api/upload');
            xhr.send(chunkFormData);
          });

          if (chunkIndex === totalChunks - 1) {
            if (!chunkResult.fileInfo) {
              throw new Error('Upload finalized but file information was not returned.');
            }
            setUploadProgress(100);
            resultFileInfo = chunkResult.fileInfo;
          }
        }
      } else {
        // Standard path for <= 3 MB files: single-request multipart upload
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
          activeXhr.current = xhr;

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.min(Math.round((event.loaded / event.total) * 92), 92);
              setUploadProgress(percent);
              if (percent >= 90) {
                setUploadStage('processing');
              }
            }
          };

          xhr.onload = () => {
            activeXhr.current = null;
            setUploadProgress(100);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                resolve(res);
              } catch {
                reject(new Error('Invalid response received from server.'));
              }
            } else {
              try {
                const res = JSON.parse(xhr.responseText);
                reject(new Error(res.error || `Upload failed with status ${xhr.status}`));
              } catch {
                reject(new Error('Failed to upload document. Please try again.'));
              }
            }
          };

          xhr.onerror = () => {
            activeXhr.current = null;
            reject(new Error('Network connection failed during upload.'));
          };

          xhr.ontimeout = () => {
            activeXhr.current = null;
            reject(new Error('Upload timed out. Please try again.'));
          };

          xhr.onabort = () => {
            activeXhr.current = null;
            reject(new Error('Upload cancelled.'));
          };

          xhr.timeout = 180000;
          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });

        resultFileInfo = result.fileInfo;
      }

      if (!resultFileInfo) {
        throw new Error('Upload failed to produce file information.');
      }

      const uploadedData: UploadedFileState = {
        uploadId: resultFileInfo.uploadId,
        uploadToken: resultFileInfo.uploadToken,
        checkoutKey: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileType: resultFileInfo.fileType || file.type,
        fileSizeBytes: resultFileInfo.fileSizeBytes || file.size,
        pageCount: resultFileInfo.pageCount || 1,
        storagePath: resultFileInfo.storagePath || `orders/${file.name}`,
        signedUrl: resultFileInfo.signedUrl,
        previewUrl: resultFileInfo.signedUrl,
      };

      onFileUploaded(uploadedData);
    } catch (err) {
      if ((err as Error)?.message !== 'Upload cancelled.') {
        console.error('File upload error:', err);
        setError(err instanceof Error ? err.message : 'Error uploading file');
      }
      onFileUploaded(null);
    } finally {
      activeXhr.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploading(false);
      setUploadProgress(0);
      setCurrentFileName('');
    }
  };

  const cancelUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeXhr.current) {
      activeXhr.current.abort();
      activeXhr.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    onFileUploaded(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        id="quickprint-file-input"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      )}

      {!uploadedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/60'
              : 'border-slate-300/80 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'
          }`}
        >
          {uploading ? (
            <div className="py-2 px-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto">
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {currentFileName || 'Uploading file...'}
                  </span>
                  {currentFileSize > 0 && (
                    <span className="text-[10px] text-slate-400 shrink-0">
                      ({formatFileSize(currentFileSize)})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0 ml-2"
                  title="Cancel upload"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Real-time Progress Bar */}
              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden mb-2">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-150 ease-out"
                  style={{ width: `${Math.max(uploadProgress, 6)}%` }}
                />
              </div>

              <div className="flex items-center justify-between w-full text-[11px] text-slate-500">
                <span>
                  {uploadStage === 'processing'
                    ? 'Detecting pages & finalizing...'
                    : 'Uploading document...'}
                </span>
                <span className="font-semibold text-indigo-600">
                  {uploadProgress}%
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Document Outline Icon */}
              <div className="w-10 h-12 border-2 border-dashed border-slate-400 rounded-md flex items-center justify-center text-slate-400 mb-2.5">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-0.5">
                Tap or Drop Document Here
              </h4>
              <p className="text-[11px] text-slate-400">
                Auto-detects page count instantly · Large files supported
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-9 rounded-lg border border-emerald-400 bg-white flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                {uploadedFile.fileName}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center gap-2">
                <span>
                  Detected: {uploadedFile.pageCount} {uploadedFile.pageCount === 1 ? 'page' : 'pages'}
                </span>
                {uploadedFile.fileSizeBytes > 0 && (
                  <span className="text-slate-400">
                    · {formatFileSize(uploadedFile.fileSizeBytes)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleRemove}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
