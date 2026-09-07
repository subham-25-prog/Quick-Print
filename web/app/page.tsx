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
import { User, Phone, MessageSquare } from '@/components/ui/Icons';

const PaymentModal = dynamic(
  () => import('@/components/customer/PaymentModal').then((module) => module.PaymentModal),
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
  const [advancedConfig] = useState<AdvancedPrintConfig>({
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
  const [resumeUrl,setResumeUrl]=useState('');
  const [tempOrderNumber, setTempOrderNumber] = useState<string>('QP-PREV');

  // Fetch shop pricing on mount & listen for live admin updates
  useEffect(() => {
    setMounted(true);
    try{const saved=localStorage.getItem('quickprint_last_checkout');if(saved?.startsWith('/payment/')||saved?.startsWith('/order/success/'))setResumeUrl(saved);}catch{}

    const applyPricingConfig = (cfg: PricingConfig) => {
      setPricing(cfg);
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

      if (!isPaperEnabled(paperSize)) {
        if (cfg.enabled_papers?.a4 !== false) setPaperSize('A4');
        else if (cfg.enabled_papers?.a3 !== false) setPaperSize('A3');
        else if (cfg.enabled_papers?.legal !== false) setPaperSize('LEGAL');
        else if (cfg.enabled_papers?.photo !== false) setPaperSize('PHOTO');
        else if (cfg.custom_papers?.some((p) => p.enabled)) {
          setPaperSize(cfg.custom_papers.find((p) => p.enabled)!.id);
        }
      }

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

    // Fetch fresh pricing from server (Single Source of Truth)
    const fetchFreshPricing = async () => {
      try {
        const res = await fetch('/api/admin/pricing?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setCheckoutEnabled(data.checkoutEnabled === true);
          if (data.pricing) {
            applyPricingConfig(data.pricing);
            setPricingReady(true);
          }
        } else {setPricingReady(false);setCheckoutEnabled(false);}
      } catch (err) {
        setPricingReady(false);
        setCheckoutEnabled(false);
        console.error('Failed to load fresh shop pricing:', err);
      }
    };

    fetchFreshPricing();

    // Auto-sync pricing every 5s so customer page updates live if shopkeeper changes rates
    const syncInterval = setInterval(fetchFreshPricing, 30000);

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
      clearInterval(syncInterval);
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
      if(!res.ok||!data.paymentId)throw new Error(data.error||'Checkout could not be opened.');
      const statusUrl=`/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
      try{localStorage.setItem('quickprint_last_checkout',statusUrl);}catch{}
      setIsPaymentModalOpen(false);
      if(data.paymentUrl){window.location.assign(data.paymentUrl);return;}
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-28">
      {/* 1. Header */}
      <Header shopName={pricing.shop_name} />

      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4">
        {resumeUrl&&<a href={resumeUrl} className="block p-3 bg-indigo-50 rounded-xl text-indigo-800 text-sm">Resume your last payment / order →</a>}
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

        {/* Card 4: Customer Details */}
        {showCustomerInfoSection && (
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              {hasAnyAddons ? '4. Customer Identification' : '3. Customer Identification'}
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
      <PaymentModal
        error={checkoutError}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        amount={priceBreakdown.totalAmount}
        orderNumberPreview={tempOrderNumber}
        onConfirmPayment={handleConfirmOrder}
        submitting={submitting}
        pricing={pricing}
      />

    </div>
  );
}
