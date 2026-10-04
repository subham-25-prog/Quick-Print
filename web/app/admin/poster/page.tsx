'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { shopConfig } from '@/lib/config';
import { useInitialPricing } from '@/lib/initial-pricing';
import { useShopName, cleanShopName } from '@/lib/shop-sync';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { Printer, Download, FileText, RefreshCw } from '@/components/ui/Icons';
import { generateShopPosterPdf, downloadPosterPdf } from '@/lib/poster-pdf';

export default function ShopWallPosterPage() {
  const initialPricing = useInitialPricing();
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [rawShopName, setRawShopName] = useState(initialPricing.shop_name);
  const [shopAddress, setShopAddress] = useState(initialPricing.shop_address || shopConfig.address);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const shopName = useShopName(rawShopName);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setActiveUrl(window.location.origin);
    }

    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) {
          if (data.pricing.shop_name) setRawShopName(cleanShopName(data.pricing.shop_name));
          if (data.pricing.shop_address) setShopAddress(data.pricing.shop_address);
        }
      })
      .catch((err) => console.error('Error fetching poster settings:', err));
  }, []);

  useEffect(() => {
    const urlToEncode = activeUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!urlToEncode) return;

    QRCode.toDataURL(urlToEncode, {
      width: 1000,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, [activeUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const safePrefix = (shopName || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safePrefix}_Store_QR_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadPdf = async () => {
    if (!qrDataUrl || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await generateShopPosterPdf({
        shopName: shopName || 'QuickPrint Express',
        shopAddress: shopAddress || 'Shop Counter • Fast Document & Photo Printing',
        qrDataUrl,
      });
      const safePrefix = (shopName || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadPosterPdf(pdfBytes, `${safePrefix}_Counter_QR_Poster.pdf`);
    } catch (err) {
      console.error('Failed to generate poster PDF:', err);
      alert('Unable to generate PDF poster. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-20 print:bg-white print:p-0 print:pb-0">
      <div className="print:hidden">
        <AdminHeader shopName={shopName} />
      </div>

      <main className="max-w-3xl mx-auto w-full px-4 pt-6 space-y-6 print:p-0 print:max-w-full print:m-0">
        {/* Notice & Control Toolbar (Hidden on print) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📱</span>
                <span>Counter QR Code & Customer Portal</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                High-Resolution QR Code (Level-H Error Correction). Print this on paper or download as a 1-page A4 PDF poster for your shop counter.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={!qrDataUrl || isGeneratingPdf}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50 touch-manipulation"
                title="Download ready-to-print 1-page A4 PDF poster"
              >
                {isGeneratingPdf ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF (A4)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadQr}
                className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer touch-manipulation"
                title="Save PNG image"
              >
                <Download className="w-4 h-4" />
                <span>Save QR Image</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="py-2.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer touch-manipulation"
                title="Print directly to connected printer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Poster</span>
              </button>
            </div>
          </div>
        </div>

        {/* The Printable A4 Poster Canvas */}
        <div
          id="quickprint-poster-canvas"
          className="bg-white rounded-3xl p-6 sm:p-10 border-4 border-indigo-600 shadow-xl text-center space-y-6 mx-auto max-w-lg print:border-none print:shadow-none print:p-2 print:space-y-4 print:max-w-full"
        >
          {/* Top Pill Badge */}
          <div className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-indigo-600 text-white text-xs font-extrabold tracking-wider uppercase shadow-xs">
            <span>⚡</span>
            <span>SELF-SERVICE EXPRESS PRINT</span>
          </div>

          {/* Shop Title & Address */}
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight leading-tight">
              {shopName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold">
              {shopAddress || 'Shop Counter • Fast Document & Photo Xerox'}
            </p>
          </div>

          {/* Large Centered QR Code Box (Enlarged) */}
          <div className="p-5 sm:p-6 rounded-3xl border-2 border-indigo-100 bg-indigo-50/40 inline-block mx-auto shadow-2xs">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to Print"
                className="w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 mx-auto rounded-2xl bg-white p-3 shadow-xs border border-slate-100 object-contain"
              />
            ) : (
              <div className="w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-bold">
                Generating High-Res QR...
              </div>
            )}
            <div className="mt-3.5 space-y-0.5">
              <div className="text-xs sm:text-sm font-black text-indigo-700 tracking-wider uppercase">
                📱 SCAN TO UPLOAD & PRINT
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Works directly in Mobile Browser • No App Needed
              </div>
            </div>
          </div>

          {/* 4 Step-by-Step Instructions */}
          <div className="space-y-2.5 text-left max-w-md mx-auto">
            {/* Step 1 */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                1
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Scan QR Code</div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Open Camera, Google Lens, or Paytm/PhonePe/GPay scanner
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                2
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Upload Your Document</div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Select PDF, Images, Govt ID, Notes, or Photos
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                3
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Select Print Options</div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Choose Color / B&W, copies, paper size & binding add-ons
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                4
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Instant UPI Payment & Collect</div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Pay via UPI for zero-touch auto-print or pay cash at counter
                </div>
              </div>
            </div>
          </div>

          {/* Footer Notice & Developer Attribution */}
          <div className="pt-3 border-t border-slate-200/80 space-y-2">
            <DeveloperBadge />
            <div className="text-[9px] text-slate-400 font-medium">
              ⚡ Powered by {shopName || 'QuickPrint'} Self-Service System • Prints ready in 2–5 minutes
            </div>
          </div>
        </div>

        {/* Screen Developer Card (Hidden on Print) */}
        <div className="print:hidden">
          <DeveloperBadge />
        </div>
      </main>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          html, body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #quickprint-poster-canvas {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            max-width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
