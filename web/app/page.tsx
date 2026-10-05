'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { FileUploader, UploadedFileState } from '@/components/customer/FileUploader';
import { uploadDocumentFile } from '@/lib/uploader';
import { PrintOptionsSelector } from '@/components/customer/PrintOptionsSelector';
import { AddOnsSelector } from '@/components/customer/AddOnsSelector';
import { calculateOrderPrice } from '@/lib/pricing';
import { computeEffectivePageCount } from '@/lib/page-range';
import { formatCurrency } from '@/lib/utils';
import { defaultPricingConfig } from '@/lib/config';
import { useInitialPricing } from '@/lib/initial-pricing';
import {
  PaperSize,
  ColorMode,
  PrintSides,
  AddOnOptions,
  PricingConfig,
  PaymentMethod,
  AdvancedPrintConfig,
  BatchFileItem,
} from '@/types';
import { calculateBatchTotalPages } from '@/lib/batch-compiler';
import { createCheckoutPreparation } from '@/lib/checkout-preparation';
import { XCircle } from '@/components/ui/Icons';
import { CustomerIdentificationCard } from '@/components/customer/CustomerIdentificationCard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const AdobePrintPreviewModal = dynamic(
  () => import('@/components/customer/AdobePrintPreviewModal').then((module) => module.AdobePrintPreviewModal),
  { ssr: false }
);

const PaymentModal = dynamic(
  () => import('@/components/customer/PaymentModal').then((module) => module.PaymentModal),
  { ssr: false }
);

const EAGER_BATCH_PREPARATION_LIMIT_BYTES = 24 * 1024 * 1024;

export default function CustomerHomePage() {
  const router = useRouter();

  // Shop pricing state
  const [pricing, setPricing] = useState<PricingConfig>(useInitialPricing());

  // Customer selections
  const [uploadedFile, setUploadedFile] = useState<UploadedFileState | null>(null);
  const [batchFiles, setBatchFiles] = useState<BatchFileItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const lastCompiledBatchSig = useRef<string>('');
  const [checkoutPreparation] = useState(createCheckoutPreparation);
  const [batchPreviewFile, setBatchPreviewFile] = useState<File | null>(null);
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

  // Eager batch merge removed - customers can preview and customize directly in Canva Studio

  // The payment selector is small, but it is code-split. Fetch it after a
  // document is selected so Confirm & Pay opens immediately without loading
  // the heavyweight PDF preview renderer unnecessarily.
  useEffect(() => {
    if (!uploadedFile && batchFiles.length === 0) return;

    void import('@/components/customer/PaymentModal').catch(() => {});
    router.prefetch('/status/pending');
  }, [uploadedFile, batchFiles.length, router]);

  // Payment modal & order submission
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const checkoutRequest = useRef(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [pricingReady, setPricingReady] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState<boolean | undefined>(undefined);
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState<boolean | undefined>(undefined);
  const [paymentErrorNotice, setPaymentErrorNotice] = useState<string | null>(null);

  // Prefetch status route and eagerly prepare batch upload as soon as modal opens
  useEffect(() => {
    if (isPaymentModalOpen) {
      router.prefetch('/status/pending');
      if (batchFiles.length > 0) {
        void checkoutPreparation.prepareUpload(batchFiles).catch(() => {});
      }
    }
  }, [isPaymentModalOpen, router, batchFiles, checkoutPreparation]);

  // Cleanly restore checkout state when user returns or presses back
  useEffect(() => {
    // Prevent the browser from automatically scrolling down on refresh
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    const handlePageShow = () => {
      setIsPaymentModalOpen(false);
      setSubmitting(false);
      setSelectedPaymentMethod(null);
      checkoutRequest.current = false;
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Restore only non-personal print preferences from localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('quickprint_customer_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Clear identifiers that an earlier version may have stored.
          delete parsed.customerName;
          delete parsed.customerPhone;
          localStorage.setItem('quickprint_customer_draft', JSON.stringify(parsed));

          if (parsed.customerNotes && typeof parsed.customerNotes === 'string') setCustomerNotes(parsed.customerNotes);
          if (parsed.copies && typeof parsed.copies === 'number') setCopies(parsed.copies);
          if (parsed.paperSize && typeof parsed.paperSize === 'string') setPaperSize(parsed.paperSize);
          if (parsed.colorMode && typeof parsed.colorMode === 'string') setColorMode(parsed.colorMode);
          if (parsed.printSides && typeof parsed.printSides === 'string') setPrintSides(parsed.printSides);
          if (parsed.addOns && typeof parsed.addOns === 'object') setAddOns(parsed.addOns);
        }
      }
    } catch {}
  }, []);

  // Persist only non-personal print preferences.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          'quickprint_customer_draft',
          JSON.stringify({
            customerNotes,
            paperSize,
            colorMode,
            printSides,
            copies,
            addOns,
          })
        );
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [customerNotes, paperSize, colorMode, printSides, copies, addOns]);

  // Fetch shop pricing on mount & listen for live admin updates
  useEffect(() => {
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

    const applyPricingConfig = (incoming: PricingConfig) => {
      const cfg = { ...incoming };
      if (!cfg.shop_name || /quickprint/i.test(cfg.shop_name)) {
        cfg.shop_name = defaultPricingConfig.shop_name;
      }
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

      setPaperSize((current) => {
        if (isPaperEnabled(current)) return current;
        return (
          (['A4', 'A3', 'LEGAL', 'PHOTO'] as PaperSize[]).find(isPaperEnabled) ||
          cfg.custom_papers?.find((p) => p.enabled)?.id ||
          current
        );
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
          setOnlinePaymentEnabled(typeof data.onlineEnabled === 'boolean' ? data.onlineEnabled : undefined);
          setCashPaymentEnabled(typeof data.cashEnabled === 'boolean' ? data.cashEnabled : undefined);
          if (data.pricing && typeof data.pricing === 'object' && !Array.isArray(data.pricing)) {
            applyPricingConfig(data.pricing);
            setPricingReady(true);
          } else {
            setPricingReady(false);
            setCheckoutEnabled(false);
          }
        } else {
          setPricingReady(false);
          setCheckoutEnabled(false);
        }
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
      if (e.key === 'quickprint_live_pricing') void fetchFreshPricing();
    };
    window.addEventListener('storage', handleStorageChange);

    const handleCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail && typeof detail === 'string') {
        const clean = !detail.trim() || /quickprint/i.test(detail) ? defaultPricingConfig.shop_name : detail.trim();
        setPricing((prev) => ({ ...prev, shop_name: clean }));
        document.title = `${clean} – Self-Service Document Printing`;
      }
    };
    window.addEventListener('quickprint_shop_name_updated', handleCustomUpdate);

    let channel: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('quickprint_shop_broadcast_channel');
        channel.onmessage = (event) => {
          if (event.data?.type === 'SHOP_NAME_UPDATED' && event.data?.shopName) {
            const raw = String(event.data.shopName).trim();
            const clean = !raw || /quickprint/i.test(raw) ? defaultPricingConfig.shop_name : raw;
            setPricing((prev) => ({ ...prev, shop_name: clean }));
            document.title = `${clean} – Self-Service Document Printing`;
          }
        };
      }
    } catch {}

    return () => {
      disposed = true;
      pricingRequest?.abort();
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', fetchFreshPricing);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('quickprint_shop_name_updated', handleCustomUpdate);
      if (channel) channel.close();
    };
  }, []);

  // Multiple files upload setting
  const allowMultiple = pricing.form_fields?.allowMultipleFiles !== false;
  const hasBatch = allowMultiple && batchFiles.length > 0;
  const isMultiFileBatch = hasBatch && batchFiles.length > 1;

  // Calculate live order pricing
  const totalDocPages = isMultiFileBatch
    ? calculateBatchTotalPages(batchFiles)
    : hasBatch && batchFiles.length === 1
    ? batchFiles[0].pageCount
    : uploadedFile?.pageCount || 1;

  const effectivePages = computeEffectivePageCount(totalDocPages, advancedConfig);

  const effectiveCopies = isMultiFileBatch
    ? 1
    : Math.max(1, hasBatch && batchFiles.length === 1 ? batchFiles[0].copies || copies : copies);

  const priceBreakdown = useMemo(() => {
    try {
      return calculateOrderPrice(
        effectivePages,
        {
          paperSize,
          colorMode,
          printSides,
          copies: effectiveCopies,
          addOns,
          advancedConfig,
        },
        pricing
      );
    } catch {
      return null;
    }
  }, [effectivePages, paperSize, colorMode, printSides, effectiveCopies, addOns, advancedConfig, pricing]);

  const getBatchSignature = (files: BatchFileItem[]) =>
    files.map((f) => `${f.id}-${f.name}-${f.size}-${f.pageCount}-${f.copies}`).join('|');

  useEffect(() => {
    if (!hasBatch) return;
    const batchSourceBytes = batchFiles.reduce((total, item) => total + item.size, 0);
    if (batchSourceBytes > EAGER_BATCH_PREPARATION_LIMIT_BYTES) return;
    const timer = window.setTimeout(() => {
      void checkoutPreparation.prepareUpload(batchFiles).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [batchFiles, hasBatch, checkoutPreparation]);

  // Customer form field configuration
  const showNameField = pricing.form_fields?.showCustomerName !== false;
  const isNameRequired = showNameField && Boolean(pricing.form_fields?.requireCustomerName);
  const showPhoneField = Boolean(pricing.form_fields?.showCustomerPhone);
  const isPhoneRequired = showPhoneField && Boolean(pricing.form_fields?.requireCustomerPhone);
  const showNotesField = pricing.form_fields?.allowCustomerNotes !== false;
  const showCustomerInfoSection = showNameField || showPhoneField || showNotesField;

  const handleOpenPayment = useCallback(() => {
    if (!checkoutEnabled || !pricingReady || !priceBreakdown) return;

    if (hasBatch ? batchFiles.length === 0 : !uploadedFile) {
      alert('Please upload a document to proceed.');
      return;
    }

    if (isNameRequired && !customerName.trim()) {
      alert('Please enter your full name for order identification.');
      return;
    }

    if (isPhoneRequired && !customerPhone.trim()) {
      alert('Please enter your WhatsApp / mobile number for order pickup notifications.');
      return;
    }

    setIsPaymentModalOpen(true);
  }, [
    checkoutEnabled,
    pricingReady,
    priceBreakdown,
    hasBatch,
    batchFiles.length,
    uploadedFile,
    isNameRequired,
    customerName,
    isPhoneRequired,
    customerPhone,
  ]);

  const handleConfirmOrder = useCallback(
    async (method: PaymentMethod) => {
      if (checkoutRequest.current || submitting || !pricingReady || !checkoutEnabled || !priceBreakdown) return;
      if (!hasBatch && !uploadedFile) return;
      checkoutRequest.current = true;
      setSelectedPaymentMethod(method);
      setSubmitting(true);
      setCheckoutError('');
      try {
        const targetFile = hasBatch ? await checkoutPreparation.prepareUpload(batchFiles) : uploadedFile;
        if (!targetFile) return;
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            uploadId: targetFile.uploadId,
            uploadToken: targetFile.uploadToken,
            idempotencyKey: targetFile.checkoutKey,
            paperSize,
            colorMode,
            printSides,
            copies: isMultiFileBatch ? 1 : effectiveCopies,
            addOns,
            advancedConfig,
            customerName,
            customerPhone,
            customerNotes,
            paymentMethod: method,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.paymentId) throw new Error(data.error || 'Checkout could not be opened.');
        if (data.status === 'SUCCESS' && data.orderId) {
          const successUrl = `/order/success/${data.orderId}?access_token=${encodeURIComponent(
            data.accessToken || data.orderAccessToken
          )}`;
          setIsPaymentModalOpen(false);
          router.push(successUrl);
          return;
        }
        if (method === 'CASH' || data.paymentMethod === 'CASH') {
          const statusUrl = `/status/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
          if (typeof window !== 'undefined' && data.paymentId) {
            try {
              const orderSnapshot = {
                order: {
                  id: data.paymentId,
                  order_number: `QP-${data.paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
                  created_at: new Date().toISOString(),
                  file_name: targetFile.fileName || 'document.pdf',
                  page_count: targetFile.pageCount || 1,
                  paper_size: paperSize,
                  color_mode: colorMode,
                  print_sides: printSides,
                  copies: isMultiFileBatch ? 1 : effectiveCopies,
                  total_amount: priceBreakdown.totalAmount,
                  currency: 'INR',
                  payment_method: 'CASH',
                  payment_status: 'AWAITING_VERIFICATION',
                  order_status: 'PAYMENT_VERIFICATION_PENDING',
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  customer_notes: customerNotes,
                },
                job: { status: 'PENDING' },
                agentOnline: true,
              };
              localStorage.setItem(`quickprint_cached_status_${data.paymentId}`, JSON.stringify(orderSnapshot));
            } catch {}
          }
          router.replace(statusUrl);
          setTimeout(() => {
            setIsPaymentModalOpen(false);
            setSubmitting(false);
            setSelectedPaymentMethod(null);
            checkoutRequest.current = false;
          }, 3000);
          return;
        }
        const statusUrl = `/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
        setIsPaymentModalOpen(false);
        if (data.paymentUrl) {
          window.location.assign(data.paymentUrl);
          return;
        }
        router.push(statusUrl);
      } catch (e) {
        setCheckoutError(e instanceof Error ? e.message : 'Unable to start payment. Please retry.');
        checkoutRequest.current = false;
        setSubmitting(false);
        setSelectedPaymentMethod(null);
      } finally {
        if (method !== 'CASH') {
          checkoutRequest.current = false;
          setSubmitting(false);
          setSelectedPaymentMethod(null);
        }
      }
    },
    [
      submitting,
      pricingReady,
      checkoutEnabled,
      priceBreakdown,
      hasBatch,
      uploadedFile,
      checkoutPreparation,
      batchFiles,
      paperSize,
      colorMode,
      printSides,
      isMultiFileBatch,
      effectiveCopies,
      addOns,
      advancedConfig,
      customerName,
      customerPhone,
      customerNotes,
      router,
    ]
  );

  const handleBatchFilesChange = useCallback((files: BatchFileItem[]) => {
    setBatchFiles(files);
    setBatchPreviewFile(null);
    setUploadedFile(null);
    lastCompiledBatchSig.current = '';
    if (files.length === 1 && files[0].copies) {
      setCopies(files[0].copies);
    }
  }, []);

  const handleCopiesChange = useCallback((newCopies: number) => {
    setCopies(newCopies);
    setBatchFiles((currentBatch) => {
      if (currentBatch.length === 1) {
        return [{ ...currentBatch[0], copies: newCopies }];
      }
      return currentBatch;
    });
  }, []);

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

  return (
    <ErrorBoundary fallbackTitle="QuickPrint encountered a temporary issue">
      <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 1. Header */}
      <Header shopName={pricing.shop_name} />

      <main className="max-w-xl mx-auto w-full px-4 pt-4 pb-4 space-y-4">
        {!priceBreakdown && (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
            Pricing is unavailable for this selection. Choose another print option or contact the shopkeeper.
          </p>
        )}
        {paymentErrorNotice && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center justify-between text-sm shadow-xs animate-fadeIn"
          >
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
              className="text-xs font-bold text-rose-600 hover:text-rose-800 underline ml-2 shrink-0 cursor-pointer active-press"
            >
              Dismiss
            </button>
          </div>
        )}
        {!pricingReady && (
          <p role="status" className="p-3 bg-amber-50 text-amber-900 rounded-xl text-sm">
            Checking shop availability…
          </p>
        )}
        {checkoutError && (
          <p role="alert" className="p-3 bg-rose-50 text-rose-800 rounded-xl text-sm">
            {checkoutError}
          </p>
        )}

        {/* Card 1: 1. Upload Document */}
        <section className="animate-fade-in-up card-hover-lift bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-3 hover:border-slate-300 contain-layout">
          <div className="flex items-center justify-between select-none">
            <h2 className="text-sm font-bold text-slate-900">
              1. Upload Document{allowMultiple ? 's' : ''}
            </h2>
            <span className="text-[10px] font-extrabold text-slate-500 tracking-widest uppercase">
              PDF / JPG / PNG
            </span>
          </div>

          <FileUploader
            uploadedFile={uploadedFile}
            onFileUploaded={setUploadedFile}
            allowMultiple={allowMultiple}
            batchFiles={batchFiles}
            onBatchFilesChange={handleBatchFilesChange}
            isProcessingBatch={isProcessingBatch}
          />
        </section>

        {/* Card 2: 2. Print Configuration */}
        <section className="animate-fade-in-up card-hover-lift bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 [animation-delay:60ms] contain-layout">
          <h2 className="text-sm font-bold text-slate-900 select-none">
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
            onCopiesChange={handleCopiesChange}
            pricing={pricing}
            hasMultipleFiles={hasBatch && batchFiles.length > 1}
          />
        </section>

        {/* Card 3: 3. Finishing & Add-ons */}
        {hasAnyAddons && (
          <section className="animate-fade-in-up card-hover-lift bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4 hover:border-slate-300 [animation-delay:120ms] contain-layout">
            <h2 className="text-sm font-bold text-slate-900 select-none">
              3. Finishing & Add-ons
            </h2>

            <AddOnsSelector
              addOns={addOns}
              onAddOnsChange={setAddOns}
              pricing={pricing}
            />
          </section>
        )}

        {/* Customer Details */}
        {showCustomerInfoSection && (
          <CustomerIdentificationCard
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            customerPhone={customerPhone}
            onCustomerPhoneChange={setCustomerPhone}
            customerNotes={customerNotes}
            onCustomerNotesChange={setCustomerNotes}
            showNameField={showNameField}
            isNameRequired={isNameRequired}
            showPhoneField={showPhoneField}
            isPhoneRequired={isPhoneRequired}
            showNotesField={showNotesField}
            sectionIndexText={hasAnyAddons ? '4. Customer Identification' : '3. Customer Identification'}
          />
        )}

        {/* Developer Attribution Card */}
        <DeveloperBadge className="mt-4" />
      </main>

      {/* Sticky Bottom Order Summary & Proceed Button Bar */}
      <div className="sticky bottom-0 mt-auto bg-white/90 backdrop-blur-xl border-t border-slate-200/80 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] z-40 gpu-layer">
        {pricingReady && !checkoutEnabled && (
          <p role="status" className="max-w-xl mx-auto mb-2 text-sm text-amber-900">
            Online ordering is not available yet. Please contact the shopkeeper.
          </p>
        )}
        <div className="max-w-xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
              TOTAL AMOUNT
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 leading-tight [overflow-wrap:anywhere] transition-all duration-200">
              {priceBreakdown ? formatCurrency(priceBreakdown.totalAmount) : 'Unavailable'}
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (hasBatch) {
                if (batchFiles.length === 0) return;
                if (batchFiles.length === 1) {
                  setBatchPreviewFile(batchFiles[0].file);
                  setIsAdobeModalOpen(true);
                  return;
                }
                const currentSig = getBatchSignature(batchFiles);
                if (batchPreviewFile && lastCompiledBatchSig.current === currentSig) {
                  setIsAdobeModalOpen(true);
                  return;
                }
                setIsProcessingBatch(true);
                try {
                  const compiledFile = await checkoutPreparation.prepareDocument(batchFiles);
                  setBatchPreviewFile(compiledFile);
                  lastCompiledBatchSig.current = currentSig;
                  setIsAdobeModalOpen(true);
                } catch (err) {
                  console.error('Batch preview error:', err);
                  alert('Unable to prepare preview.');
                } finally {
                  setIsProcessingBatch(false);
                }
              } else {
                if (!uploadedFile) {
                  alert('Please upload a document to preview.');
                  return;
                }
                setIsAdobeModalOpen(true);
              }
            }}
            onMouseEnter={() => {
              import('@/components/customer/AdobePrintPreviewModal')
                .then((mod) => {
                  if (typeof mod.getPdfJs === 'function') mod.getPdfJs().catch(() => {});
                })
                .catch(() => {});
            }}
            onTouchStart={() => {
              import('@/components/customer/AdobePrintPreviewModal')
                .then((mod) => {
                  if (typeof mod.getPdfJs === 'function') mod.getPdfJs().catch(() => {});
                })
                .catch(() => {});
            }}
            disabled={
              !pricingReady ||
              (hasBatch ? batchFiles.length === 0 : !uploadedFile) ||
              isProcessingBatch ||
              submitting ||
              !priceBreakdown
            }
            className="btn-shimmer active-press py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98] text-white font-bold text-sm shadow-md hover:shadow-lg hover:shadow-emerald-600/20 transition-all duration-150 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none select-none"
          >
            <span>{isProcessingBatch ? 'Preparing...' : 'Preview'}</span>
            <span className="preview-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {/* Payment Modal (Dynamically Imported) */}
      {isPaymentModalOpen && (
        <PaymentModal
          error={checkoutError}
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          amount={priceBreakdown?.totalAmount ?? 0}
          onConfirmPayment={handleConfirmOrder}
          submitting={submitting || !pricingReady || !checkoutEnabled || !priceBreakdown}
          pricing={pricing}
          onlineEnabled={onlinePaymentEnabled}
          cashEnabled={cashPaymentEnabled}
          selectedMethod={selectedPaymentMethod}
        />
      )}

      {/* Adobe Acrobat Advanced Print Settings & Preview Modal */}
      {isAdobeModalOpen &&
        (() => {
          let activeModalUploadedFile: UploadedFileState | null = null;
          let activeFileName = 'Document_Preview.pdf';
          let activeFileType = 'application/pdf';
          let activePageCount = 1;
          let activePreviewUrl: string | undefined = undefined;

          if (hasBatch) {
            if (batchFiles.length === 1) {
              const first = batchFiles[0];
              const isFirstPdf = first.name.toLowerCase().endsWith('.pdf') || first.file.type === 'application/pdf';
              activeFileName = first.name;
              activeFileType = first.file.type || (isFirstPdf ? 'application/pdf' : 'image/jpeg');
              activePageCount = first.pageCount;
              activeModalUploadedFile = {
                uploadId: `batch-single-${first.id}-${first.name}-${first.size}`,
                uploadToken: '',
                checkoutKey: '',
                file: first.file,
                fileName: first.name,
                fileType: activeFileType,
                fileSizeBytes: first.size,
                pageCount: first.pageCount,
                storagePath: '',
              };
            } else {
              const currentSig = lastCompiledBatchSig.current || getBatchSignature(batchFiles);
              activeFileName = `Batch_Order (${batchFiles.length} files).pdf`;
              activeFileType = 'application/pdf';
              activePageCount = isMultiFileBatch ? totalDocPages : batchFiles[0].pageCount;
              if (batchPreviewFile) {
                activeModalUploadedFile = {
                  uploadId: `batch-multi-${currentSig}`,
                  uploadToken: '',
                  checkoutKey: '',
                  file: batchPreviewFile,
                  fileName: activeFileName,
                  fileType: 'application/pdf',
                  fileSizeBytes: batchPreviewFile.size,
                  pageCount: isMultiFileBatch ? totalDocPages : batchFiles[0].pageCount,
                  storagePath: '',
                };
              }
            }
          } else if (uploadedFile) {
            activeModalUploadedFile = uploadedFile;
            activeFileName = uploadedFile.fileName;
            activeFileType = uploadedFile.fileType;
            activePageCount = uploadedFile.pageCount;
            activePreviewUrl = uploadedFile.previewUrl || uploadedFile.signedUrl;
          }

          return (
            <AdobePrintPreviewModal
              isOpen={isAdobeModalOpen}
              onClose={() => setIsAdobeModalOpen(false)}
              fileName={activeFileName}
              pageCount={activePageCount}
              fileSignedUrl={activePreviewUrl}
              previewUrl={activePreviewUrl}
              fileType={activeFileType}
              uploadedFile={activeModalUploadedFile}
              paperSize={paperSize}
              colorMode={colorMode}
              printSides={printSides}
              copies={isMultiFileBatch ? 1 : effectiveCopies}
              pricing={pricing}
              advancedConfig={advancedConfig}
              onSaveAdvancedConfig={setAdvancedConfig}
              onPaperSizeChange={setPaperSize}
              onColorModeChange={setColorMode}
              onPrintSidesChange={setPrintSides}
              onCopiesChange={handleCopiesChange}
              batchFiles={batchFiles}
              onApplyCanvasLayout={async (newFile: File) => {
                try {
                  const uploadRes = await uploadDocumentFile(newFile);
                  setUploadedFile(uploadRes);
                  setBatchFiles([]);
                  setBatchPreviewFile(null);
                } catch (e) {
                  console.error('Failed to upload customized layout:', e);
                }
              }}
              onProceedToOrder={() => {
                setIsAdobeModalOpen(false);
                handleOpenPayment();
              }}
            />
          );
        })()}
    </div>
    </ErrorBoundary>
  );
}
