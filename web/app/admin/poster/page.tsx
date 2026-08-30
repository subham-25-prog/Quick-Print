'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { shopConfig } from '@/lib/config';
import { Printer, Download, Sparkles, FileText, CheckCircle2 } from '@/components/ui/Icons';

export default function ShopWallPosterPage() {
  const [customUrl, setCustomUrl] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [shopName, setShopName] = useState(shopConfig.name);
  const [shopAddress, setShopAddress] = useState(shopConfig.address);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCustomUrl(window.location.origin);
    } else {
      setCustomUrl(shopConfig.appUrl || 'http://localhost:3000');
    }

    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) {
          if (data.pricing.shop_name) setShopName(data.pricing.shop_name);
          if (data.pricing.shop_address) setShopAddress(data.pricing.shop_address);
        }
      })
      .catch((err) => console.error('Error fetching poster settings:', err));
  }, []);

  const activeUrl = customUrl.trim() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  useEffect(() => {
    if (!activeUrl) return;

    QRCode.toDataURL(activeUrl, {
      width: 600,
      margin: 2,
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
    a.download = `QuickPrint_Store_QR_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-20 print:bg-white print:p-0">
      <div className="print:hidden">
        <AdminHeader />
      </div>

      <main className="max-w-3xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Notice & Control Toolbar (Hidden on print) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📱</span>
                <span>Counter QR Code & Customer Portal</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                High-Resolution QR Code (Level-H Error Correction). Print this on paper and stick it at your shop counter.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Save QR Image</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print QR Code (A4)</span>
              </button>
            </div>
          </div>

          {/* URL Input */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Target Customer Upload URL (Encoded in QR)
              </label>
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://your-shop.vercel.app"
                className="w-full p-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 bg-white"
              />
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="py-2 px-3.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition-all active:scale-95 cursor-pointer"
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>

        </div>

        {/* The Printable A4 Poster Canvas */}
        <div
          id="quickprint-poster-canvas"
          className="bg-white rounded-3xl p-8 sm:p-12 border-4 border-indigo-600 shadow-xl text-center space-y-7 mx-auto max-w-lg print:border-none print:shadow-none print:p-4 print:max-w-full"
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

          {/* Large Centered QR Code Box */}
          <div className="p-5 rounded-3xl border-2 border-indigo-100 bg-indigo-50/40 inline-block mx-auto shadow-2xs">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to Print"
                className="w-56 h-56 sm:w-64 sm:h-64 mx-auto rounded-2xl bg-white p-2.5 shadow-xs border border-slate-100"
              />
            ) : (
              <div className="w-56 h-56 sm:w-64 sm:h-64 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-bold">
                Generating High-Res QR...
              </div>
            )}
            <div className="mt-3.5 space-y-0.5">
              <div className="text-xs font-black text-indigo-700 tracking-wider uppercase">
                📱 SCAN TO UPLOAD & PRINT
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
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

          {/* Footer Notice */}
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
            ⚡ Powered by QuickPrint Self-Service System • Prints ready in 2–5 minutes
          </div>
        </div>
      </main>
    </div>
  );
}
