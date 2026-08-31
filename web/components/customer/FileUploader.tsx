'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  AlertCircle,
  RefreshCw,
  X,
  Eye,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from '@/components/ui/Icons';
import { formatBytes } from '@/lib/utils';
import { getPdfPageCount } from '@/lib/pdf';
import { PaperSize, ColorMode, PrintSides, AddOnOptions } from '@/types';

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
  paperSize?: PaperSize;
  colorMode?: ColorMode;
  printSides?: PrintSides;
  addOns?: AddOnOptions;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUploaded,
  uploadedFile,
  paperSize = 'A4',
  colorMode = 'BW',
  printSides = 'SINGLE',
  addOns = {},
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [isFullScreenPreview, setIsFullScreenPreview] = useState(false);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  // Adobe Reader Preview State
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(100);
  const [viewSide, setViewSide] = useState<'FRONT' | 'BACK'>('FRONT');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manage local Blob URL for immediate high-performance browser preview
  useEffect(() => {
    if (uploadedFile?.file) {
      const url = URL.createObjectURL(uploadedFile.file);
      setLocalBlobUrl(url);
      setCurrentPage(1);
      setViewSide('FRONT');
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setLocalBlobUrl(null);
    }
  }, [uploadedFile?.file]);

  const totalPages = uploadedFile?.pageCount || 1;

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

  // Determine Adobe-style Paper Dimensions Specs (Inches & MM)
  const getPaperSpecs = () => {
    if (paperSize === 'A4') return { name: 'A4', mm: '210 × 297 mm', in: '8.27 × 11.69 in', aspect: 'aspect-[210/297]' };
    if (paperSize === 'A3') return { name: 'A3 Poster', mm: '297 × 420 mm', in: '11.69 × 16.54 in', aspect: 'aspect-[297/420]' };
    if (paperSize === 'LEGAL') return { name: 'Legal Paper', mm: '216 × 356 mm', in: '8.50 × 14.00 in', aspect: 'aspect-[216/356]' };
    if (paperSize === 'PHOTO') return { name: 'Photo Glossy', mm: '102 × 152 mm', in: '4.00 × 6.00 in', aspect: 'aspect-[4/6]' };
    return { name: `${paperSize}`, mm: 'Custom', in: 'Custom Size', aspect: 'aspect-[210/297]' };
  };

  const paperSpecs = getPaperSpecs();
  const isBw = colorMode === 'BW';

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

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

          {/* Adobe Acrobat Print Dialog Style Canvas */}
          {showPreview && previewSource && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden shadow-2xl space-y-0 text-slate-200">
              {/* 1. Adobe Reader Control Toolbar */}
              <div className="bg-slate-800/95 px-3 py-2 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
                {/* Page Navigation Controls */}
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-200 min-w-[70px] text-center">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                    className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Duplex Flip Toggle (If Double Sided) */}
                {printSides === 'DOUBLE' && (
                  <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setViewSide('FRONT')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        viewSide === 'FRONT'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Front (Page 1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewSide('BACK')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        viewSide === 'BACK'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Back (Page 2)
                    </button>
                  </div>
                )}

                {/* Zoom & Expansion Controls */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-900/90 px-1.5 py-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setZoomScale((z) => Math.max(70, z - 15))}
                      className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-semibold text-slate-300 min-w-[36px] text-center">
                      {zoomScale}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomScale((z) => Math.min(150, z + 15))}
                      className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullScreenPreview(true)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer"
                    title="Full Screen Preview"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 2. Physical Paper Dimensions Banner */}
              <div className="bg-slate-950 px-3.5 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] font-medium text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-400 font-bold">📄 Paper Sheet:</span>
                  <span className="text-slate-200 font-semibold">{paperSpecs.name}</span>
                  <span>({paperSpecs.mm} • {paperSpecs.in})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md font-bold ${
                    isBw ? 'bg-slate-800 text-slate-200' : 'bg-emerald-950 text-emerald-300'
                  }`}>
                    {isBw ? '⚫ Monochrome Spool' : '🎨 Laser Color'}
                  </span>
                </div>
              </div>

              {/* 3. Realistic Adobe Paper Sheet Canvas Area */}
              <div className="relative w-full py-6 px-3 bg-slate-950 flex items-center justify-center overflow-auto min-h-[320px]">
                {/* Realistic White Paper Sheet with Dynamic Ratio & Finishing Overlays */}
                <div
                  style={{ transform: `scale(${zoomScale / 100})`, transformOrigin: 'center center' }}
                  className={`relative max-h-[340px] w-full max-w-[270px] sm:max-w-[320px] ${paperSpecs.aspect} bg-white rounded-xs shadow-2xl border border-slate-300 overflow-hidden transition-all duration-300 ${
                    isBw ? 'grayscale contrast-[1.15]' : ''
                  }`}
                >
                  {/* --- Finishing Visual Overlays --- */}

                  {/* Corner Staple Graphic */}
                  {addOns?.stapling && (
                    <div className="absolute top-2 left-2 z-20 w-6 h-1.5 bg-slate-400 border border-slate-600 rounded-xs shadow-md transform -rotate-45" title="Staple Pin" />
                  )}

                  {/* Spiral Binding Punch Coil Graphic */}
                  {addOns?.spiralBinding && (
                    <div className="absolute left-0 top-0 bottom-0 z-20 w-4 bg-slate-900/10 border-r border-slate-300 flex flex-col justify-around items-center py-2">
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <div key={idx} className="w-2.5 h-1.5 rounded-full bg-slate-800 border border-slate-900 shadow-xs" />
                      ))}
                    </div>
                  )}

                  {/* Hard / Soft Book Binding Spine */}
                  {(addOns?.hardBinding || addOns?.softBinding) && (
                    <div className="absolute left-0 top-0 bottom-0 z-20 w-5 bg-gradient-to-r from-slate-900 via-slate-700 to-transparent opacity-80 border-r border-slate-400" />
                  )}

                  {/* Soft Lamination Gloss Sheen Overlay */}
                  {addOns?.lamination && (
                    <div className="absolute inset-0 z-20 bg-gradient-to-tr from-transparent via-white/20 to-white/40 pointer-events-none" />
                  )}

                  {/* Back Side Indicator Watermark */}
                  {viewSide === 'BACK' && (
                    <div className="absolute top-2 right-2 z-20 bg-slate-900/80 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                      BACK SIDE (PAGE {currentPage + 1})
                    </div>
                  )}

                  {/* Main Document Content */}
                  {isImageFile ? (
                    <img
                      src={previewSource}
                      alt={uploadedFile.fileName}
                      className="w-full h-full object-contain p-1.5"
                    />
                  ) : (
                    <object
                      data={`${previewSource}#page=${currentPage}&toolbar=0&navpanes=0`}
                      type="application/pdf"
                      className="w-full h-full"
                    >
                      <iframe
                        src={`${previewSource}#page=${currentPage}&toolbar=0&navpanes=0`}
                        title="Adobe PDF Page Preview"
                        className="w-full h-full border-0"
                      />
                    </object>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Overlay for Full Screen Adobe Acrobat Preview */}
      {isFullScreenPreview && previewSource && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-5">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white text-sm font-bold truncate">
                {isImageFile ? <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" /> : <FileText className="w-4 h-4 text-indigo-400 shrink-0" />}
                <span className="truncate">{uploadedFile?.fileName}</span>
                <span className="text-slate-400 text-xs font-normal">({paperSpecs.name} • {paperSpecs.in})</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-indigo-950 text-indigo-200 text-xs px-2.5 py-1 rounded-lg font-bold border border-indigo-700/50">
                  Page {currentPage} of {totalPages} • {isBw ? 'B&W' : 'Color'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFullScreenPreview(false)}
                  className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-slate-950 p-6 flex items-center justify-center overflow-auto">
              <div className={`relative max-h-full max-w-full ${paperSpecs.aspect} bg-white rounded-xs shadow-2xl overflow-hidden transition-all duration-300 ${
                isBw ? 'grayscale contrast-[1.15]' : ''
              }`}>
                {/* Corner Staple Graphic */}
                {addOns?.stapling && (
                  <div className="absolute top-3 left-3 z-20 w-8 h-2 bg-slate-400 border border-slate-600 rounded-xs shadow-md transform -rotate-45" />
                )}

                {/* Spiral Binding Punch Coil Graphic */}
                {addOns?.spiralBinding && (
                  <div className="absolute left-0 top-0 bottom-0 z-20 w-5 bg-slate-900/10 border-r border-slate-300 flex flex-col justify-around items-center py-3">
                    {Array.from({ length: 16 }).map((_, idx) => (
                      <div key={idx} className="w-3 h-2 rounded-full bg-slate-800 border border-slate-900 shadow-xs" />
                    ))}
                  </div>
                )}

                {isImageFile ? (
                  <img
                    src={previewSource}
                    alt={uploadedFile?.fileName}
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <iframe
                    src={`${previewSource}#page=${currentPage}`}
                    title="Full Adobe PDF Page Preview"
                    className="w-full h-full border-0 bg-white"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

