'use client';

import { useState,useEffect,useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { FileUploader, UploadedFileState } from '@/components/customer/FileUploader';
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
} from '@/types';
import { User, Phone, MessageSquare, XCircle } from '@/components/ui/Icons';

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


  // Shop pricing state
  const [pricing, setPricing] = useState<PricingConfig>(useInitialPricing());

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
  const checkoutRequest = useRef(false);
  const [checkoutError,setCheckoutError]=useState('');
  const [pricingReady,setPricingReady]=useState(false);
  const [pricingFailed,setPricingFailed]=useState(false);
  const [checkoutEnabled,setCheckoutEnabled]=useState(false);
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState<boolean | undefined>(undefined);
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState<boolean | undefined>(undefined);
  const [paymentErrorNotice, setPaymentErrorNotice] = useState<string | null>(null);

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

    // Server pricing is newer than browser storage, which may contain an old name.

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
            setPricingReady(true);setPricingFailed(false);
          } else { setPricingFailed(true);setPricingReady(false); setCheckoutEnabled(false); }
        } else {setPricingFailed(true);setPricingReady(false);setCheckoutEnabled(false);}
      } catch (err) {
        if (disposed) return;
        setPricingFailed(true);setPricingReady(false);
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
      // Storage is only a refresh signal; prices and checkout availability come from the server.
      if (e.key === 'quickprint_live_pricing') void fetchFreshPricing();
    };
    window.addEventListener('storage', handleStorageChange);

    const handleCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail && typeof detail === 'string') {
        const clean = (!detail.trim() || /quickprint/i.test(detail)) ? defaultPricingConfig.shop_name : detail.trim();
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
            const clean = (!raw || /quickprint/i.test(raw)) ? defaultPricingConfig.shop_name : raw;
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

  // Calculate live order pricing
  const effectivePages = uploadedFile
    ? computeEffectivePageCount(uploadedFile.pageCount, advancedConfig)
    : 1;
  const priceBreakdown = (() => {
    try { return calculateOrderPrice(
    effectivePages,
    {
      paperSize,
      colorMode,
      printSides,
      copies,
      addOns,
      advancedConfig,
    },
    pricing
  ); } catch { return null; }
  })();

  // Customer form field configuration
  const showNameField = pricing.form_fields?.showCustomerName !== false;
  const isNameRequired = showNameField && Boolean(pricing.form_fields?.requireCustomerName);
  const showPhoneField = Boolean(pricing.form_fields?.showCustomerPhone);
  const isPhoneRequired = showPhoneField && Boolean(pricing.form_fields?.requireCustomerPhone);
  const showNotesField = pricing.form_fields?.allowCustomerNotes !== false;
  const showCustomerInfoSection = showNameField || showPhoneField || showNotesField;

  const handleOpenPayment = () => {
    if (!checkoutEnabled || !pricingReady || !priceBreakdown) return;
    if (!uploadedFile) {
      setCheckoutError('Please upload a document to proceed.');
      return;
    }

    if (isNameRequired && !customerName.trim()) {
      setCheckoutError('Please enter your full name for order identification.');
      return;
    }

    if ((isPhoneRequired || customerPhone.trim()) && !/^\+?[0-9 ]{10,15}$/.test(customerPhone.trim())) {
      setCheckoutError('Enter a valid mobile number (10–15 digits, with an optional +).');
      return;
    }

    setCheckoutError('');
    setIsPaymentModalOpen(true);
  };

  const handleConfirmOrder = async (method: PaymentMethod) => {
    if (!uploadedFile || checkoutRequest.current || submitting || !pricingReady || !checkoutEnabled || !priceBreakdown) return;
    checkoutRequest.current = true;
    setSubmitting(true);setCheckoutError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          uploadId:uploadedFile.uploadId,uploadToken:uploadedFile.uploadToken,
          idempotencyKey:uploadedFile.checkoutKey,paperSize,colorMode,printSides,copies,addOns,
          advancedConfig,
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
      if (method === 'CASH' || data.paymentMethod === 'CASH') {
        const statusUrl = `/status/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
        setIsPaymentModalOpen(false);
        router.push(statusUrl);
        return;
      }
      const statusUrl = `/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
      setIsPaymentModalOpen(false);
      if (data.paymentUrl) { window.location.assign(data.paymentUrl); return; }
      router.push(statusUrl);
    }catch(e){setCheckoutError(e instanceof Error?e.message:'Unable to start payment. Please retry.');}
    finally{checkoutRequest.current = false;setSubmitting(false);}
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* 1. Header */}
      <Header shopName={pricing.shop_name} />

      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-8 pb-8 space-y-5">
        <div className="pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Print at your local shop</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">Your documents. Ready to print.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Upload a file, choose your print options, then review and pay.</p>
          <ol aria-label="Order steps" className="mt-5 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
            <li className="rounded-full bg-indigo-50 px-3 py-2 text-indigo-700">1 · Upload</li>
            <li className="rounded-full bg-white px-3 py-2">2 · Configure</li>
            <li className="rounded-full bg-white px-3 py-2">3 · Review & pay</li>
          </ol>
        </div>
        {!priceBreakdown && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">Pricing is unavailable for this selection. Choose another print option or contact the shopkeeper.</p>}
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
        {!pricingReady&&<p role="status" className="p-3 bg-amber-50 text-amber-900 rounded-xl text-sm">{pricingFailed ? 'Unable to check shop availability. Check your connection; we will retry automatically.' : 'Checking shop availability…'}</p>}
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
            onFileUploaded={(file) => {
              setUploadedFile(file);
              setCheckoutError('');
              setAdvancedConfig(previous => ({ ...previous, pageRangeMode: 'ALL', customPageRange: '' }));
            }}
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

        {/* Customer Details */}
        {showCustomerInfoSection && (
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              {hasAnyAddons ? '4. Customer Identification' : '3. Customer Identification'}
            </h2>

            <div className="space-y-3">
              {showNameField && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Your Full Name {isNameRequired ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="text" autoComplete="name" aria-label="Your Full Name" maxLength={100} required={isNameRequired}
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
                    WhatsApp / Mobile Number {isPhoneRequired ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type="tel" autoComplete="tel" aria-label="WhatsApp / Mobile Number" maxLength={20} required={isPhoneRequired}
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
                      rows={2} aria-label="Special Instructions / Notes" maxLength={1000}
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Any collection or finishing instructions"
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                    <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {uploadedFile && priceBreakdown && (
          <section aria-label="Order summary" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-sm font-bold">Order summary</h2>
            <p className="mt-2 break-all text-sm text-slate-600">{uploadedFile.fileName}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-600">{effectivePages} pages × {copies} {copies === 1 ? 'copy' : 'copies'}</dt><dd>{formatCurrency(priceBreakdown.printSubtotal)}</dd></div>
              {priceBreakdown.addOnsBreakdown.map((addon, index) => <div key={index} className="flex justify-between gap-4"><dt className="text-slate-600">{addon.name}</dt><dd>{formatCurrency(addon.total)}</dd></div>)}
              <div className="flex justify-between border-t border-slate-100 pt-3 font-bold"><dt>Total</dt><dd>{formatCurrency(priceBreakdown.totalAmount)}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-500">Review the layout before paying. The final price is confirmed at checkout.</p>
          </section>
        )}
      </main>

      {/* Sticky Bottom Order Summary & Proceed Button Bar */}
      <div className="sticky bottom-0 mt-auto bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 shadow-xl z-40">
        {pricingReady && !checkoutEnabled && <p role="status" className="max-w-xl mx-auto mb-2 text-sm text-amber-900">Online ordering is not available yet. Please contact the shopkeeper.</p>}
        <div className="max-w-xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              TOTAL AMOUNT
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 leading-tight [overflow-wrap:anywhere]">
              {!uploadedFile ? '—' : priceBreakdown ? formatCurrency(priceBreakdown.totalAmount) : 'Unavailable'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!uploadedFile) {
                setCheckoutError('Please upload a document to preview.');
                return;
              }
              setIsAdobeModalOpen(true);
            }}
            disabled={!pricingReady||!uploadedFile||submitting||!priceBreakdown}
            className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Preview</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && <PaymentModal
        error={checkoutError}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        amount={priceBreakdown?.totalAmount ?? 0}
        onConfirmPayment={handleConfirmOrder}
        submitting={submitting || !pricingReady || !checkoutEnabled || !priceBreakdown}
        pricing={pricing}
        onlineEnabled={onlinePaymentEnabled}
        cashEnabled={cashPaymentEnabled}
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
        onProceedToOrder={() => {
          setIsAdobeModalOpen(false);
          handleOpenPayment();
        }}
      />}
    </div>
  );
}
