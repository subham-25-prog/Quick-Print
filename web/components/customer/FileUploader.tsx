'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Image as ImageIcon, AlertCircle, RefreshCw, X, Plus, Minus } from '@/components/ui/Icons';
import { BatchFileItem } from '@/types';
import { detectFilePageCount, calculateBatchTotalPages } from '@/lib/batch-compiler';
import { uploadDocumentFile, UploadedFileState, formatFileSize } from '@/lib/uploader';

export type { UploadedFileState };

interface FileUploaderProps {
  onFileUploaded: (fileData: UploadedFileState | null) => void;
  uploadedFile: UploadedFileState | null;
  allowMultiple?: boolean;
  batchFiles?: BatchFileItem[];
  onBatchFilesChange?: (files: BatchFileItem[]) => void;
  isProcessingBatch?: boolean;
}

const DocumentPreviewBox = React.memo<{
  file?: File | Blob | null;
  name: string;
  pageCount?: number;
  fallbackUrl?: string;
  className?: string;
}>(({ file, name, pageCount = 1, fallbackUrl, className = '' }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const isPdf =
    Boolean(file?.type === 'application/pdf') ||
    name.toLowerCase().endsWith('.pdf');
  const isImg = !isPdf;

  // Generate object URL for image preview
  useEffect(() => {
    if (!isImg) return;
    if (file instanceof Blob) {
      const url = URL.createObjectURL(file);
      setImgUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else if (fallbackUrl) {
      setImgUrl(fallbackUrl);
    }
  }, [file, isImg, fallbackUrl]);

  return (
    <div
      className={`w-12 h-14 sm:w-13 sm:h-15 rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden shrink-0 flex flex-col justify-between relative select-none contain-paint ${className}`}
      title={name}
    >
      {isImg ? (
        imgUrl ? (
          <img
            src={imgUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-indigo-400 p-1">
            <ImageIcon className="w-5 h-5" />
          </div>
        )
      ) : (
        /* Real Document Sheet Preview for PDF */
        <div className="w-full h-full p-1.5 flex flex-col justify-between bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center justify-between border-b border-rose-100 pb-1">
            <div className="w-2.5 h-2.5 rounded-xs bg-rose-500 flex items-center justify-center">
              <span className="text-[6px] font-black text-white leading-none">P</span>
            </div>
            <span className="text-[7px] font-bold text-slate-400 leading-none">
              {pageCount}p
            </span>
          </div>

          {/* Miniature Document Content Lines */}
          <div className="space-y-1 my-auto px-0.5">
            <div className="h-1 bg-slate-400/80 rounded-full w-4/5" />
            <div className="h-0.5 bg-slate-200 rounded-full w-full" />
            <div className="h-0.5 bg-slate-200 rounded-full w-5/6" />
            <div className="h-0.5 bg-slate-200 rounded-full w-3/4" />
          </div>

          {/* PDF Format Tag */}
          <div className="text-[7px] font-extrabold text-rose-600 tracking-wider text-center uppercase">
            PDF
          </div>
        </div>
      )}

      {/* Bottom format pill for image */}
      {isImg && (
        <span className="absolute bottom-0 inset-x-0 text-[7px] font-black text-center py-0.2 tracking-wider uppercase bg-indigo-600/90 text-white">
          IMG
        </span>
      )}
    </div>
  );
});
DocumentPreviewBox.displayName = 'DocumentPreviewBox';

interface BatchFileRowProps {
  item: BatchFileItem;
  idx: number;
  onUpdateCopies: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}

const BatchFileRow = React.memo<BatchFileRowProps>(({ item, idx, onUpdateCopies, onRemove }) => {
  return (
    <div
      className="animate-fade-in-scale p-3 rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 shadow-2xs flex flex-wrap items-center justify-between gap-3 transition-all duration-150 contain-layout"
    >
      {/* Left: Small preview box */}
      <div className="flex items-center gap-3 min-w-0 flex-1 select-none">
        <DocumentPreviewBox file={item.file} name={item.name} pageCount={item.pageCount} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800 truncate" title={item.name}>
            <span className="text-slate-400 font-normal mr-1">#{idx + 1}</span>
            <span className="truncate">{item.name}</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-indigo-600 font-semibold">
              {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
            </span>
            <span className="text-slate-300">·</span>
            <span>{formatFileSize(item.size)}</span>
          </div>
        </div>
      </div>

      {/* Right: Per-File Copies Stepper & Remove */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50/80 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => onUpdateCopies(item.id, -1)}
            disabled={item.copies <= 1}
            className="stepper-btn w-7 h-7 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer active:scale-95 touch-manipulation"
            title="Decrease copies"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="px-2.5 text-xs font-bold text-slate-800 min-w-[54px] text-center select-none">
            {item.copies} {item.copies === 1 ? 'copy' : 'copies'}
          </span>
          <button
            type="button"
            onClick={() => onUpdateCopies(item.id, 1)}
            className="stepper-btn w-7 h-7 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer active:scale-95 touch-manipulation"
            title="Increase copies"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all cursor-pointer touch-manipulation"
          title="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
BatchFileRow.displayName = 'BatchFileRow';

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

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUploaded,
  uploadedFile,
  allowMultiple = false,
  batchFiles = [],
  onBatchFilesChange,
  isProcessingBatch = false,
}) => {
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

  const isValidFileType = (file: File) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage =
      ['image/jpeg', 'image/png'].includes(file.type) ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg') ||
      file.name.toLowerCase().endsWith('.png');
    return isPdf || isImage;
  };

  // Process files when multiple file mode is active
  const processMultipleFiles = async (selectedFiles: FileList | File[]) => {
    setError(null);
    const filesArray = Array.from(selectedFiles);
    if (!filesArray.length) return;

    const validFiles: File[] = [];
    for (const file of filesArray) {
      if (!isValidFileType(file)) {
        setError(`"${file.name}" is not supported. Please choose PDF or JPG/PNG files.`);
        return;
      }
      if (file.size === 0) {
        setError(`"${file.name}" is empty. Please choose a valid document.`);
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError(`"${file.name}" exceeds 100 MB limit.`);
        return;
      }
      validFiles.push(file);
    }

    const newBatchItems: BatchFileItem[] = [];
    for (const file of validFiles) {
      const pageCount = await detectFilePageCount(file);
      newBatchItems.push({
        id: generateUUID(),
        file,
        name: file.name,
        size: file.size,
        pageCount,
        copies: 1,
      });
    }

    const updatedBatch = [...batchFiles, ...newBatchItems];
    onBatchFilesChange?.(updatedBatch);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle single file upload (standard legacy mode)
  const processSingleFile = async (file: File) => {
    if (uploading || activeXhr.current) return;
    setError(null);

    if (!isValidFileType(file)) {
      setError('Please upload a PDF or image file (JPG, PNG)');
      return;
    }

    if (file.size === 0) {
      setError('This file is empty. Choose a document with content.');
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
      const uploadedData = await uploadDocumentFile(file, {
        onProgress: (percent, stage) => {
          setUploadProgress(percent);
          setUploadStage(stage);
        },
        onXhrCreated: (xhr) => {
          activeXhr.current = xhr;
        },
      });

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

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (allowMultiple) {
      processMultipleFiles(files);
    } else {
      processSingleFile(files[0]);
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  };

  const handleRemoveSingle = () => {
    onFileUploaded(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateItemCopies = useCallback((id: string, delta: number) => {
    if (!onBatchFilesChange) return;
    const updated = batchFiles.map((item) => {
      if (item.id === id) {
        const nextCopies = Math.min(99, Math.max(1, item.copies + delta));
        return { ...item, copies: nextCopies };
      }
      return item;
    });
    onBatchFilesChange(updated);
  }, [batchFiles, onBatchFilesChange]);

  const removeBatchItem = useCallback((id: string) => {
    if (!onBatchFilesChange) return;
    const updated = batchFiles.filter((item) => item.id !== id);
    onBatchFilesChange(updated);
  }, [batchFiles, onBatchFilesChange]);

  // --- MULTIPLE FILES MODE RENDER ---
  if (allowMultiple) {
    const totalPages = calculateBatchTotalPages(batchFiles);

    return (
      <div className="w-full space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="hidden"
          id="quickprint-file-input"
          onChange={handleFileChange}
          multiple
        />

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4 text-rose-500" />
            </button>
          </div>
        )}

        {batchFiles.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 card-hover-lift ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01] shadow-lg shadow-indigo-500/10'
                : 'border-slate-300/80 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-300'
            }`}
          >
            <div className="flex flex-col items-center">
              <div className="w-10 h-12 border-2 border-dashed border-slate-400 rounded-md flex items-center justify-center text-slate-400 mb-2.5 transition-transform group-hover:scale-105">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-0.5">
                Tap or Drop Files Here
              </h4>
              <p className="text-[11px] text-slate-400">
                Upload multiple documents/images & customize copies per file
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Batch items list */}
            <div className="space-y-2">
              {batchFiles.map((item, idx) => (
                <BatchFileRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  onUpdateCopies={updateItemCopies}
                  onRemove={removeBatchItem}
                />
              ))}
            </div>

            {/* Add More Files Button & Batch Summary */}
            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3.5 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] hover:shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add More Files</span>
              </button>

              <div className="px-3.5 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-700 text-xs font-medium flex items-center justify-between sm:justify-end gap-2">
                <span className="text-slate-500">Batch Total:</span>
                <span className="font-bold text-slate-900">
                  {batchFiles.length} {batchFiles.length === 1 ? 'file' : 'files'} ·{' '}
                  <span className="text-indigo-600">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
                </span>
              </div>
            </div>

            {isProcessingBatch && (
              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Preparing and compiling print batch document...</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- SINGLE FILE MODE RENDER ---
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
          className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 card-hover-lift ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/70 scale-[1.01] shadow-lg shadow-indigo-500/10'
              : 'border-slate-300/80 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-300'
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

              {/* Real-time Gradient Progress Bar */}
              <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden mb-2 shadow-inner">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 h-full rounded-full transition-all duration-200 ease-out shadow-xs"
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
              <div className="w-10 h-12 border-2 border-dashed border-slate-400 rounded-md flex items-center justify-center text-slate-400 mb-2.5 transition-transform group-hover:scale-105">
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
        <div className="animate-fade-in-scale p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50/40 flex items-center justify-between gap-3 shadow-xs">
          {/* Left: Small preview box where user can see uploaded image or PDF content */}
          <div className="flex items-center gap-3 min-w-0 flex-1 select-none">
            <DocumentPreviewBox
              file={uploadedFile.file}
              name={uploadedFile.fileName}
              pageCount={uploadedFile.pageCount}
              fallbackUrl={uploadedFile.signedUrl || uploadedFile.previewUrl}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate" title={uploadedFile.fileName}>
                {uploadedFile.fileName}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-2 flex-wrap">
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
            onClick={handleRemoveSingle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all shrink-0 cursor-pointer"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
