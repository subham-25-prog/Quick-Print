'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { FileUploader, UploadedFileState } from '@/components/customer/FileUploader';
import { PrintOptionsSelector } from '@/components/customer/PrintOptionsSelector';
import { AddOnsSelector } from '@/components/customer/AddOnsSelector';
import { calculateOrderPrice } from '@/lib/pricing';
import { formatCurrency, generateOrderNumber } from '@/lib/utils';
import { defaultPricingConfig } from '@/lib/config';
import {
  PaperSize,
  ColorMode,
  PrintSides,
  AddOnOptions,
  PricingConfig,
  PaymentMethod,
  AdvancedPrintConfig,
} from '@/types';
import { User, Phone, MessageSquare, Sliders, CheckCircle2, XCircle } from '@/components/ui/Icons';

const PaymentModal = dynamic(
  () => import('@/components/customer/PaymentModal').then((module) => module.PaymentModal),
  { ssr: false }
);
const AdobePrintPreviewModal = dynamic(
  () => import('@/components/customer/AdobePrintPreviewModal').then((module) => module.AdobePrintPreviewModal),
  { ssr: false }
);

export default function CustomerHomePage() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  // Shop pricing state
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricingConfig);

  // Customer selections
  const [uploadedFile, setUploadedFile] = useState<UploadedFileState | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [colorMode, setColorMode] = useState<ColorMode>('BW');
  const [printSides, setPrintSides] = useState<PrintSides>('SINGLE');
  const [copies, setCopies] = useState<number>(1);
  const [addOns, setAddOns] = useState<AddOnOptions>({});

  // Adobe Advanced Print Configuration & Preview State
  const [isAdobeModalOpen, setIsAdobeModalOpen] = useState(false);
  const [advancedConfig, setAdvancedConfig] = useState<AdvancedPrintConfig>({
    pageRangeMode: 'ALL',
    pagesPerSheet: '1',
    pageScaling: 'FIT',
    customScalePercent: 100,
    orientation: 'AUTO',
    printQuality: 'STANDARD',
    watermark: 'NONE',
  });

  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Payment modal & order submission
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError,setCheckoutError]=useState('');
  const [pricingReady,setPricingReady]=useState(false);
  const [checkoutEnabled,setCheckoutEnabled]=useState(false);
  const [paymentErrorNotice, setPaymentErrorNotice] = useState<string | null>(null);
  const [tempOrderNumber, setTempOrderNumber] = useState<string>('QP-PREV');

  // Fetch shop pricing on mount & listen for live admin updates
  useEffect(() => {
    setMounted(true);
    try {
      localStorage.removeItem('quickprint_last_checkout');
      if (typeof window !== 'undefined') {
        const err = new URLSearchParams(window.location.search).get('payment_error');
        if (err) {
          setPaymentErrorNotice(err);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch {}

    const applyPricingConfig = (cfg: PricingConfig) => {
      setPricing(cfg);
      if (cfg.shop_name) {
        document.title = `${cfg.shop_name} – Self-Service Document Printing`;
      }
      try {
        localStorage.setItem('quickprint_live_pricing', JSON.stringify(cfg));
      } catch {}

      // Check if current paperSize is enabled, if not pick first enabled paper
      const isPaperEnabled = (size: PaperSize) => {
        if (size === 'A4') return cfg.enabled_papers?.a4 !== false;
        if (size === 'A3') return cfg.enabled_papers?.a3 !== false;
        if (size === 'LEGAL') return cfg.enabled_papers?.legal !== false;
        if (size === 'PHOTO') return cfg.enabled_papers?.photo !== false;
        return (cfg.custom_papers || []).some((p) => p.id === size && p.enabled);
      };

      setPaperSize(current => {
        if (isPaperEnabled(current)) return current;
        return (['A4', 'A3', 'LEGAL', 'PHOTO'] as PaperSize[]).find(isPaperEnabled)
          || cfg.custom_papers?.find(p => p.enabled)?.id || current;
      });

      // Enforce Color Mode restriction if disabled
      if (cfg.form_fields?.allowColorPrinting === false) {
        setColorMode('BW');
      }

      // Enforce Print Sides restriction if disabled
      if (cfg.form_fields?.allowDoubleSided === false) {
        setPrintSides('SINGLE');
      }
    };

    // Load cached pricing first for instant initial render
    try {
      const cached = localStorage.getItem('quickprint_live_pricing');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          applyPricingConfig(parsed);
        }
      }
    } catch {}

    let disposed = false;
    let pricingRequest: AbortController | null = null;
    // Only one bounded request may run, and background tabs do not poll.
    const fetchFreshPricing = async () => {
      if (disposed || document.hidden || pricingRequest) return;
      const controller = new AbortController();
      pricingRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch('/api/admin/pricing', { cache: 'no-store', signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (disposed) return;
          setCheckoutEnabled(data.checkoutEnabled === true);
          if (data.pricing) {
            applyPricingConfig(data.pricing);
            setPricingReady(true);
          }
        } else {setPricingReady(false);setCheckoutEnabled(false);}
      } catch (err) {
        if (disposed) return;
        setPricingReady(false);
        setCheckoutEnabled(false);
        console.error('Failed to load fresh shop pricing:', err);
      } finally {
        window.clearTimeout(timeout);
        pricingRequest = null;
      }
    };

    fetchFreshPricing();

    // Refresh visible tabs every 30 seconds and immediately on return.
    const syncInterval = setInterval(fetchFreshPricing, 30000);
    document.addEventListener('visibilitychange', fetchFreshPricing);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'quickprint_live_pricing' && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          applyPricingConfig(updated);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);

    setTempOrderNumber(generateOrderNumber());

    return () => {
      disposed = true;
      pricingRequest?.abort();
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', fetchFreshPricing);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Calculate live order pricing
  const effectivePages = uploadedFile ? uploadedFile.pageCount : 1;
  const priceBreakdown = calculateOrderPrice(
    effectivePages,
    {
      paperSize,
      colorMode,
      printSides,
      copies,
      addOns,
    },
    pricing
  );

  const handleOpenPayment = () => {
    if (!checkoutEnabled) return;
    if (!uploadedFile) {
      alert('Please upload a document to proceed.');
      return;
    }

    if (pricing.form_fields?.requireCustomerName && !customerName.trim()) {
      alert('Please enter your full name for order identification.');
      return;
    }

    if (pricing.form_fields?.requireCustomerPhone && !customerPhone.trim()) {
      alert('Please enter your WhatsApp / mobile number for order pickup notifications.');
      return;
    }

    setIsPaymentModalOpen(true);
  };

  const handleConfirmOrder = async (method: PaymentMethod) => {
    if (!uploadedFile || submitting) return;
    setSubmitting(true);setCheckoutError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId:uploadedFile.uploadId,uploadToken:uploadedFile.uploadToken,
          idempotencyKey:uploadedFile.checkoutKey,paperSize,colorMode,printSides,copies,addOns,
          customerName,customerPhone,customerNotes,paymentMethod:method,
        }),
      });
      const data=await res.json();
      if (!res.ok || !data.paymentId) throw new Error(data.error || 'Checkout could not be opened.');
      if (data.status === 'SUCCESS' && data.orderId) {
        const successUrl = `/order/success/${data.orderId}?access_token=${encodeURIComponent(data.accessToken || data.orderAccessToken)}`;
        setIsPaymentModalOpen(false);
        router.push(successUrl);
        return;
      }
      const statusUrl = `/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
      setIsPaymentModalOpen(false);
      if (data.paymentUrl) { window.location.assign(data.paymentUrl); return; }
      router.push(statusUrl);
    }catch(e){setCheckoutError(e instanceof Error?e.message:'Unable to start payment. Please retry.');}
    finally{setSubmitting(false);}
  };

  // Determine if finishing section has active options
  const enabledAddons = {
    stapling: true,
    spiralBinding: true,
    lamination: true,
    hardBinding: true,
    softBinding: false,
    ...(pricing?.enabled_addons || {}),
  };
  const customAddons = (pricing?.custom_addons || []).filter((a) => a.enabled);
  const hasAnyAddons =
    enabledAddons.spiralBinding !== false ||
    enabledAddons.hardBinding !== false ||
    enabledAddons.softBinding === true ||
    enabledAddons.stapling !== false ||
    enabledAddons.lamination !== false ||
    customAddons.length > 0;

  const showNameField = pricing.form_fields?.requireCustomerName !== false;
  const showPhoneField = pricing.form_fields?.requireCustomerPhone !== false;
  const showNotesField = pricing.form_fields?.allowCustomerNotes !== false;
  const showCustomerInfoSection = showNameField || showPhoneField || showNotesField;

  const hasActiveAdvanced =
    advancedConfig &&
    (advancedConfig.pageRangeMode !== 'ALL' ||
      advancedConfig.pagesPerSheet !== '1' ||
      advancedConfig.pageScaling !== 'FIT' ||
      advancedConfig.orientation !== 'AUTO' ||
      (advancedConfig.watermark && advancedConfig.watermark !== 'NONE'));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-28">
      {/* 1. Header */}
      <Header shopName={pricing.shop_name} />

      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4">
        {paymentErrorNotice && (
          <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center justify-between text-sm shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span className="font-medium">
                {paymentErrorNotice === 'cancelled'
                  ? 'Payment was cancelled. You can retry or choose another payment method.'
                  : paymentErrorNotice === 'expired'
                  ? 'Payment session expired. Please proceed with checkout again.'
                  : 'Previous payment was not completed. You can re-verify and retry below.'}
              </span>
            </div>
            <button
              onClick={() => setPaymentErrorNotice(null)}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 underline ml-2 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        {!pricingReady&&<p role="status" className="p-3 bg-amber-50 text-amber-900 rounded-xl text-sm">Checking shop availability…</p>}
        {checkoutError&&<p role="alert" className="p-3 bg-rose-50 text-rose-800 rounded-xl text-sm">{checkoutError}</p>}
        {/* Card 1: 1. Upload Document */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              1. Upload Document
            </h2>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider">
              PDF / JPG / PNG
            </span>
          </div>

          <FileUploader
            uploadedFile={uploadedFile}
            onFileUploaded={setUploadedFile}
          />
        </section>

        {/* Card 2: 2. Print Configuration */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">
            2. Print Configuration
          </h2>

          <PrintOptionsSelector
            paperSize={paperSize}
            onPaperSizeChange={setPaperSize}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            printSides={printSides}
            onPrintSidesChange={setPrintSides}
            copies={copies}
            onCopiesChange={setCopies}
            pricing={pricing}
            advancedConfig={advancedConfig}
            onOpenAdobeModal={() => setIsAdobeModalOpen(true)}
          />
        </section>

        {/* Card 3: 3. Finishing & Add-ons (Shown only if enabled by shopkeeper) */}
        {hasAnyAddons && (
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              3. Finishing & Add-ons
            </h2>

            <AddOnsSelector
              addOns={addOns}
              onAddOnsChange={setAddOns}
              pricing={pricing}
            />
          </section>
        )}

        {/* Card: Live Print Preview & Advanced Settings (Positioned after all options chosen) */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {hasAnyAddons ? '4. Live Print Preview & Advanced Settings' : '3. Live Print Preview & Advanced Settings'}
            </h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {uploadedFile ? `${uploadedFile.pageCount} ${uploadedFile.pageCount === 1 ? 'Page' : 'Pages'}` : 'Optional'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAdobeModalOpen(true)}
            className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all cursor-pointer shadow-2xs group text-left ${
              hasActiveAdvanced
                ? 'bg-slate-950 border-slate-800 text-white ring-1 ring-slate-800'
                : 'bg-red-50/70 border-red-200 text-red-950 hover:bg-red-100/80'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-transform group-hover:scale-105 ${
                  hasActiveAdvanced
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                    : 'bg-red-600 text-white shadow-xs'
                }`}
              >
                PDF
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-extrabold flex items-center gap-2">
                  <span>Adobe Acrobat Advanced Settings &amp; Preview</span>
                  {hasActiveAdvanced && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Active</span>
                    </span>
                  )}
                </div>
                <div
                  className={`text-[11px] font-medium mt-0.5 ${
                    hasActiveAdvanced ? 'text-slate-400' : 'text-red-700'
                  }`}
                >
                  {hasActiveAdvanced
                    ? `${advancedConfig?.pageRangeMode} • ${advancedConfig?.pagesPerSheet}-Up Layout • ${advancedConfig?.orientation} • ${advancedConfig?.pageScaling}`
                    : `WYSIWYG preview for ${paperSize} • ${colorMode === 'COLOR' ? 'Full Color' : 'Black & White'} • ${printSides === 'DOUBLE' ? 'Double Sided' : 'Single Sided'}`}
                </div>
              </div>
            </div>

            <div
              className={`ml-3 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all ${
                hasActiveAdvanced
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-xs'
                  : 'bg-red-600 text-white hover:bg-red-700 shadow-xs'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Preview</span>
            </div>
          </button>
        </section>

        {/* Card 4/5: Customer Details */}
        {showCustomerInfoSection && (
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              {hasAnyAddons ? '5. Customer Identification' : '4. Customer Identification'}
            </h2>

            <div className="space-y-3">
              {showNameField && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Your Full Name {pricing.form_fields?.requireCustomerName && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}

              {showPhoneField && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    WhatsApp / Mobile Number {pricing.form_fields?.requireCustomerPhone ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}

              {showNotesField && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Special Instructions / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <textarea
                      rows={2}
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Pickup notes (all uploaded pages will print)"
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                    <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom Order Summary & Proceed Button Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 shadow-xl z-40">
        {pricingReady && !checkoutEnabled && <p role="status" className="max-w-xl mx-auto mb-2 text-sm text-amber-900">Online ordering is not available yet. Please contact the shopkeeper.</p>}
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              TOTAL AMOUNT
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 leading-tight">
              {formatCurrency(priceBreakdown.totalAmount)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenPayment}
            disabled={!pricingReady||!checkoutEnabled||!uploadedFile||submitting}
            className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Pay &amp; Print</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && <PaymentModal
        error={checkoutError}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        amount={priceBreakdown.totalAmount}
        orderNumberPreview={tempOrderNumber}
        onConfirmPayment={handleConfirmOrder}
        submitting={submitting}
        pricing={pricing}
      />}

      {/* Adobe Acrobat Advanced Print Settings & Preview Modal */}
      {isAdobeModalOpen && <AdobePrintPreviewModal
        isOpen={isAdobeModalOpen}
        onClose={() => setIsAdobeModalOpen(false)}
        fileName={uploadedFile?.fileName || 'Document_Preview.pdf'}
        pageCount={uploadedFile?.pageCount || 1}
        fileSignedUrl={uploadedFile?.signedUrl}
        previewUrl={uploadedFile?.previewUrl}
        fileType={uploadedFile?.fileType}
        uploadedFile={uploadedFile}
        paperSize={paperSize}
        colorMode={colorMode}
        printSides={printSides}
        copies={copies}
        pricing={pricing}
        advancedConfig={advancedConfig}
        onSaveAdvancedConfig={setAdvancedConfig}
        onPaperSizeChange={setPaperSize}
        onColorModeChange={setColorMode}
        onPrintSidesChange={setPrintSides}
        onCopiesChange={setCopies}
      />}
    </div>
  );
}
