'use client';

import React, { useState, useRef } from 'react';
import { FileText, CheckCircle2, AlertCircle, RefreshCw, X } from '@/components/ui/Icons';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setError('Please upload a PDF document or an image (JPG, PNG).');
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
        previewUrl: result.fileInfo?.signedUrl || (isImage ? URL.createObjectURL(file) : undefined),
      };

      onFileUploaded(uploadedData);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
        className="hidden"
        id="quickprint-file-input"
        onChange={handleFileChange}
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
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/60'
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
              {/* Document Outline Icon */}
              <div className="w-10 h-12 border-2 border-dashed border-slate-400 rounded-md flex items-center justify-center text-slate-400 mb-2.5">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-0.5">
                Tap or Drop Document Here
              </h4>
              <p className="text-[11px] text-slate-400">
                Auto-detects page count instantly
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
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Detected: {uploadedFile.pageCount} {uploadedFile.pageCount === 1 ? 'page' : 'pages'}
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
