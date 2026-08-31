'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FileText, Image as ImageIcon, AlertCircle, RefreshCw, X, Eye, ExternalLink, CheckCircle2 } from '@/components/ui/Icons';
import { formatBytes } from '@/lib/utils';
import { getPdfPageCount } from '@/lib/pdf';

export interface UploadedFileState {
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

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileUploaded, uploadedFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [isFullScreenPreview, setIsFullScreenPreview] = useState(false);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage local Blob URL for immediate high-performance browser preview
  useEffect(() => {
    if (uploadedFile?.file) {
      const url = URL.createObjectURL(uploadedFile.file);
      setLocalBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setLocalBlobUrl(null);
    }
  }, [uploadedFile?.file]);

  const processFile = async (file: File) => {
    setError(null);

    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError('Document exceeds 50 MB limit. Please choose a smaller file.');
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      setError('Please upload a PDF document or an image (JPG, PNG, WEBP).');
      return;
    }

    setUploading(true);

    try {
      let detectedPages = 1;
      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        detectedPages = await getPdfPageCount(arrayBuffer);
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload document');
      }

      const uploadedData: UploadedFileState = {
        file,
        fileName: file.name,
        fileType: result.fileInfo?.fileType || file.type,
        fileSizeBytes: file.size,
        pageCount: result.fileInfo?.pageCount || detectedPages,
        storagePath: result.fileInfo?.storagePath || `shop-documents/orders/${file.name}`,
        signedUrl: result.fileInfo?.signedUrl,
        previewUrl: result.fileInfo?.signedUrl,
      };

      onFileUploaded(uploadedData);
      setShowPreview(true);
    } catch (err) {
      console.error('File upload error:', err);
      setError(err instanceof Error ? err.message : 'Error uploading file');
      onFileUploaded(null);
    } finally {
      setUploading(false);
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
    setShowPreview(true);
    setIsFullScreenPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isImageFile = uploadedFile
    ? uploadedFile.fileType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(uploadedFile.fileName)
    : false;

  const previewSource = localBlobUrl || uploadedFile?.signedUrl || uploadedFile?.previewUrl;

  return (
    <div className="w-full space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        className="hidden"
        id="quickprint-file-input"
        onChange={handleFileChange}
      />

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="cursor-pointer">
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
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/60 shadow-inner'
              : 'border-slate-300/80 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'
          }`}
        >
          {uploading ? (
            <div className="py-4 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-700">Uploading & detecting pages...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-10 h-12 border-2 border-dashed border-slate-400 rounded-md flex items-center justify-center text-slate-400 mb-2.5">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-0.5">
                Tap or Drop Document Here
              </h4>
              <p className="text-[11px] text-slate-400">
                Supports PDF, JPG, PNG, WEBP (Auto page detection)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Main Upload Summary Card */}
          <div className="p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50/30 shadow-2xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-10 rounded-xl border border-emerald-400 bg-white flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                {isImageFile ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  {uploadedFile.fileName}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-medium mt-0.5">
                  <span className="bg-emerald-100/80 px-2 py-0.5 rounded-md font-bold">
                    {uploadedFile.pageCount} {uploadedFile.pageCount === 1 ? 'Page' : 'Pages'}
                  </span>
                  <span>•</span>
                  <span>{formatBytes(uploadedFile.fileSizeBytes)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  showPreview
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
                title={showPreview ? 'Hide Preview' : 'Show Preview'}
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">{showPreview ? 'Hide Preview' : 'Preview'}</span>
              </button>

              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Remove document"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline Document Preview Box */}
          {showPreview && previewSource && (
            <div className="rounded-2xl border border-slate-200 bg-slate-900 overflow-hidden shadow-inner space-y-0">
              {/* Preview Header Bar */}
              <div className="bg-slate-800/90 px-3.5 py-2 flex items-center justify-between border-b border-slate-700/60">
                <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Document Live Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFullScreenPreview(true)}
                    className="text-[11px] font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Expand</span>
                  </button>
                </div>
              </div>

              {/* Preview Frame Container */}
              <div className="relative w-full h-64 sm:h-80 bg-slate-950 flex items-center justify-center overflow-hidden">
                {isImageFile ? (
                  <img
                    src={previewSource}
                    alt={uploadedFile.fileName}
                    className="max-h-full max-w-full object-contain p-2"
                  />
                ) : (
                  <object
                    data={`${previewSource}#toolbar=0&navpanes=0`}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <iframe
                      src={`${previewSource}#toolbar=0&navpanes=0`}
                      title="PDF Preview"
                      className="w-full h-full border-0"
                    />
                  </object>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Overlay for Full Screen Preview */}
      {isFullScreenPreview && previewSource && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white text-sm font-bold truncate">
                {isImageFile ? <ImageIcon className="w-4 h-4 text-indigo-400" /> : <FileText className="w-4 h-4 text-indigo-400" />}
                <span className="truncate">{uploadedFile?.fileName}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFullScreenPreview(false)}
                className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-slate-950 p-2 flex items-center justify-center overflow-auto">
              {isImageFile ? (
                <img
                  src={previewSource}
                  alt={uploadedFile?.fileName}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : (
                <iframe
                  src={previewSource}
                  title="Full PDF Preview"
                  className="w-full h-full rounded-lg border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

