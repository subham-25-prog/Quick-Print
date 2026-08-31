'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { FileUploader, UploadedFileState } from '@/components/customer/FileUploader';
import { PrintOptionsSelector } from '@/components/customer/PrintOptionsSelector';
import { AddOnsSelector } from '@/components/customer/AddOnsSelector';
import { PaymentModal } from '@/components/customer/PaymentModal';
import { calculateOrderPrice } from '@/lib/pricing';
import { formatCurrency, generateOrderNumber } from '@/lib/utils';
import { defaultPricingConfig } from '@/lib/config';
import { PaperSize, ColorMode, PrintSides, AddOnOptions, PricingConfig, PaymentMethod } from '@/types';
import { User, Phone, MessageSquare } from '@/components/ui/Icons';

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

  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Payment modal & order submission
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tempOrderNumber, setTempOrderNumber] = useState<string>('QP-PREV');

  // Fetch shop pricing on mount & listen for live admin updates
  useEffect(() => {
    setMounted(true);

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

    // Load from local storage first for fast response
    try {
      const cached = localStorage.getItem('quickprint_live_pricing');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          applyPricingConfig(parsed);
        }
      }
    } catch {}

    fetch('/api/admin/pricing?t=' + Date.now(), { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) {
          const cached = localStorage.getItem('quickprint_live_pricing');
          let chosenPricing = data.pricing as PricingConfig;
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              const localTime = parsed.updated_at ? new Date(parsed.updated_at).getTime() : 0;
              const serverTime = data.pricing.updated_at ? new Date(data.pricing.updated_at).getTime() : 0;
              if (localTime > serverTime) {
                chosenPricing = parsed;
              }
            } catch {}
          }
          applyPricingConfig(chosenPricing);
        }
      })
      .catch((err) => console.error('Failed to load shop pricing:', err));

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

  const handleConfirmOrder = async (method: PaymentMethod, transactionRef?: string) => {
    if (!uploadedFile) return;

    setSubmitting(true);

    try {
      const orderPayload = {
        fileName: uploadedFile.fileName,
        storagePath: uploadedFile.storagePath,
        signedUrl: uploadedFile.signedUrl,
        fileType: uploadedFile.fileType,
        fileSizeBytes: uploadedFile.fileSizeBytes,
        pageCount: uploadedFile.pageCount,
        paperSize,
        colorMode,
        printSides,
        copies,
        addOns,
        paymentMethod: method,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerNotes: customerNotes.trim(),
        transactionRef: transactionRef ? transactionRef.trim() : undefined,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok || !data.order) {
        throw new Error(data.error || 'Failed to submit order');
      }

      setIsPaymentModalOpen(false);
      router.push(`/status/${data.order.id}`);
    } catch (err) {
      console.error('Order submission error:', err);
      alert(err instanceof Error ? err.message : 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
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

  const showNameField = pricing.form_fields?.showCustomerName !== false;
  const showPhoneField = pricing.form_fields?.showCustomerPhone !== false;
  const showNotesField = pricing.form_fields?.enableNotes !== false;
  const showCustomerInfoSection = showNameField || showPhoneField || showNotesField;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-28">
      {/* 1. Header */}
      <Header shopName={pricing.shop_name} />

      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4">
        {/* Top Notice Banner */}
        {pricing.form_fields?.announcementText && (
          <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-900 text-center text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs">
            <span>⚡</span>
            <span>{pricing.form_fields.announcementText}</span>
          </div>
        )}

        {/* Card 1: 1. Upload Document */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              1. Upload Document
            </h2>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider">
              PDF / JPG / PNG / DOCX
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
                    Special Instructions <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="e.g. Print only pages 1 to 5, or leave extra margin on left"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                    <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Sticky Bottom Checkout Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-4 z-30 shadow-lg">
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
            className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Proceed to Pay</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
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
