'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Image as ImageIcon, AlertCircle, RefreshCw, X, Plus, Minus, Eye } from '@/components/ui/Icons';
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

const FileThumbnail: React.FC<{ file: File; name: string; isImg: boolean; className?: string }> = ({
  file,
  name,
  isImg,
  className = '',
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImg || !(file instanceof Blob)) return;
    let active = true;
    let url = '';
    try {
      url = URL.createObjectURL(file);
      if (active) setThumbUrl(url);
    } catch {}
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, isImg]);

  if (isImg && thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={name}
        className={`w-full h-full object-cover group-hover/preview:scale-105 transition-transform duration-200 ${className}`}
      />
    );
  }

  return isImg ? (
    <ImageIcon className="w-4 h-4 text-indigo-600" />
  ) : (
    <FileText className="w-4 h-4 text-indigo-600" />
  );
};

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
  const [isMounted, setIsMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'uploading' | 'processing'>('uploading');
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    name: string;
    isImage: boolean;
    isGeneratedBlob: boolean;
  } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleOpenPreview = (file?: File | Blob | null, name?: string, fallbackUrl?: string) => {
    try {
      const fileName = name || (file as File)?.name || 'Preview';
      const isImage =
        Boolean(file?.type && file.type.startsWith('image/')) ||
        /\.(jpe?g|png|webp|gif|bmp|svg|jfif|heic)$/i.test(fileName) ||
        (!file?.type?.includes('pdf') && !fileName.toLowerCase().endsWith('.pdf'));

      let url = fallbackUrl || '';
      let isGenerated = false;

      if (file instanceof Blob) {
        url = URL.createObjectURL(file);
        isGenerated = true;
      }

      if (!url) {
        console.warn('No preview URL or File available for preview');
        return;
      }

      setPreviewItem({ url, name: fileName, isImage, isGeneratedBlob: isGenerated });
    } catch (err) {
      console.error('Error opening preview:', err);
    }
  };

  const handleClosePreview = () => {
    if (previewItem?.isGeneratedBlob && previewItem?.url) {
      try {
        URL.revokeObjectURL(previewItem.url);
      } catch {}
    }
    setPreviewItem(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewItem) {
        handleClosePreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewItem]);
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

  const updateItemCopies = (id: string, delta: number) => {
    if (!onBatchFilesChange) return;
    const updated = batchFiles.map((item) => {
      if (item.id === id) {
        const nextCopies = Math.min(99, Math.max(1, item.copies + delta));
        return { ...item, copies: nextCopies };
      }
      return item;
    });
    onBatchFilesChange(updated);
  };

  const removeBatchItem = (id: string) => {
    if (!onBatchFilesChange) return;
    const updated = batchFiles.filter((item) => item.id !== id);
    onBatchFilesChange(updated);
  };

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
              {batchFiles.map((item, idx) => {
                const isImg =
                  item.file.type.startsWith('image/') ||
                  item.name.toLowerCase().endsWith('.jpg') ||
                  item.name.toLowerCase().endsWith('.jpeg') ||
                  item.name.toLowerCase().endsWith('.png');

                return (
                  <div
                    key={item.id}
                    className="animate-fade-in-scale p-3 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 transition-all duration-200 card-hover-lift"
                  >
                    {/* Left: Thumbnail, Name, Details (Clickable button to preview image) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPreview(item.file, item.name);
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group/preview select-none bg-transparent border-0 p-0 focus:outline-hidden"
                      title="Tap to preview image"
                    >
                      <div className="w-10 h-11 rounded-xl border border-indigo-200 bg-indigo-50/50 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs overflow-hidden relative group-hover/preview:border-indigo-400 group-hover/preview:ring-2 group-hover/preview:ring-indigo-300/40 transition-all">
                        <FileThumbnail file={item.file} name={item.name} isImg={isImg} />
                        <div className="absolute inset-0 bg-indigo-950/20 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-4 h-4 text-white drop-shadow-sm" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-800 truncate group-hover/preview:text-indigo-600 transition-colors flex items-center gap-1.5" title={item.name}>
                          <span className="text-slate-400 font-normal">#{idx + 1}</span>
                          <span className="truncate">{item.name}</span>
                          <Eye className="w-3 h-3 text-indigo-500 opacity-60 group-hover/preview:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="text-indigo-600 font-semibold">
                            {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>{formatFileSize(item.size)}</span>
                          <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 inline-flex items-center gap-1">
                            <Eye className="w-2.5 h-2.5" /> Tap to view
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Right: Per-File Copies Stepper & Remove */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50/80 p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateItemCopies(item.id, -1)}
                          disabled={item.copies <= 1}
                          className="stepper-btn w-7 h-7 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                          title="Decrease copies"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2.5 text-xs font-bold text-slate-800 min-w-[54px] text-center">
                          {item.copies} {item.copies === 1 ? 'copy' : 'copies'}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateItemCopies(item.id, 1)}
                          className="stepper-btn w-7 h-7 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                          title="Increase copies"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeBatchItem(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all cursor-pointer"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
        <div className="animate-fade-in-scale p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/40 flex items-center justify-between gap-3 shadow-xs card-hover-lift">
          {(() => {
            const isSingleImg =
              (uploadedFile.file?.type && uploadedFile.file.type.startsWith('image/')) ||
              /\.(jpe?g|png|webp|gif|bmp|svg|jfif|heic)$/i.test(uploadedFile.fileName) ||
              (!uploadedFile.fileType?.includes('pdf') && !uploadedFile.fileName.toLowerCase().endsWith('.pdf'));

            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPreview(uploadedFile.file, uploadedFile.fileName, uploadedFile.signedUrl || uploadedFile.previewUrl);
                }}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group/preview select-none bg-transparent border-0 p-0 focus:outline-hidden"
                title="Tap to preview document"
              >
                <div className="w-10 h-11 rounded-xl border border-emerald-300 bg-white flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs overflow-hidden relative group-hover/preview:border-emerald-500 group-hover/preview:ring-2 group-hover/preview:ring-emerald-300/40 transition-all">
                  <FileThumbnail file={uploadedFile.file} name={uploadedFile.fileName} isImg={isSingleImg} />
                  <div className="absolute inset-0 bg-emerald-950/20 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white drop-shadow-sm" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate group-hover/preview:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <span className="truncate">{uploadedFile.fileName}</span>
                    <Eye className="w-3.5 h-3.5 text-emerald-600 opacity-60 group-hover/preview:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <div className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>
                      Detected: {uploadedFile.pageCount} {uploadedFile.pageCount === 1 ? 'page' : 'pages'}
                    </span>
                    {uploadedFile.fileSizeBytes > 0 && (
                      <span className="text-slate-400">
                        · {formatFileSize(uploadedFile.fileSizeBytes)}
                      </span>
                    )}
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded-md border border-emerald-200 inline-flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5" /> Tap to view
                    </span>
                  </div>
                </div>
              </button>
            );
          })()}

          <button
            onClick={handleRemoveSingle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all shrink-0 cursor-pointer"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image / Document Preview Lightbox Modal rendered via Portal onto document.body */}
      {isMounted && previewItem && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 animate-fade-in-scale select-none"
          onClick={handleClosePreview}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl mb-3 flex items-center justify-between text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 pr-4">
              <h3 className="text-sm sm:text-base font-bold truncate text-white">{previewItem.name}</h3>
              <span className="text-xs text-slate-400">
                {previewItem.isImage ? 'Image Preview' : 'Document Preview'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={previewItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 transition-colors shadow-xs"
              >
                Open in tab ↗
              </a>
              <button
                type="button"
                onClick={handleClosePreview}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div
            className="max-w-3xl max-h-[82vh] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/60 border border-white/15 shadow-2xl p-2 sm:p-3 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {previewItem.isImage ? (
              <img
                src={previewItem.url}
                alt={previewItem.name}
                className="max-h-[76vh] max-w-full object-contain rounded-xl select-none mx-auto shadow-lg"
              />
            ) : (
              <iframe
                src={previewItem.url}
                title={previewItem.name}
                className="w-full h-[76vh] rounded-xl bg-white border-0"
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
