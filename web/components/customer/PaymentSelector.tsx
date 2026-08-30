'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { PaymentMethod, PricingConfig } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { shopConfig } from '@/lib/config';
import { generateUpiDeepLink } from '@/lib/pricing';
import { Smartphone, Banknote, ArrowRight, Info, QrCode, Copy, Check } from '@/components/ui/Icons';

interface PaymentSelectorProps {
  amount: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (val: PaymentMethod) => void;
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  customerNotes: string;
  onCustomerNotesChange: (val: string) => void;
  orderNumberPreview?: string;
  onSubmitOrder: () => void;
  submitting: boolean;
  pricing?: PricingConfig;
}

export const PaymentSelector: React.FC<PaymentSelectorProps> = ({
  amount,
  paymentMethod,
  onPaymentMethodChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  customerNotes,
  onCustomerNotesChange,
  orderNumberPreview = 'QP-TEMP',
  onSubmitOrder,
  submitting,
  pricing,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Determine active UPI info
  const activeUpi = (pricing?.shop_upi_id || shopConfig.upiId || 'shop@upi').trim();
  const activeName = (pricing?.shop_upi_name || pricing?.shop_name || shopConfig.upiPayeeName || shopConfig.name).trim();

  const upiDeepLink = generateUpiDeepLink({
    upiId: activeUpi,
    payeeName: activeName,
    amount,
    orderNumber: orderNumberPreview,
  });

  useEffect(() => {
    if (amount > 0 && activeUpi) {
      QRCode.toDataURL(upiDeepLink, {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation error:', err));
    }
  }, [amount, upiDeepLink, activeUpi]);

  const copyUpiId = () => {
    if (activeUpi) {
      navigator.clipboard.writeText(activeUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Payment Method Toggles */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Select Payment Method
        </label>
        <div className="grid grid-cols-2 gap-3">
          {/* UPI */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange('UPI')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              paymentMethod === 'UPI'
                ? 'border-indigo-500 bg-indigo-500/15 text-white ring-1 ring-indigo-500 shadow-md shadow-indigo-500/10'
                : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <div className="font-bold text-sm">UPI Payment</div>
            </div>
            <div className="text-[11px] text-slate-400">PhonePe, GPay, Paytm, BHIM</div>
          </button>

          {/* Cash */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange('CASH')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              paymentMethod === 'CASH'
                ? 'border-indigo-500 bg-indigo-500/15 text-white ring-1 ring-indigo-500 shadow-md shadow-indigo-500/10'
                : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-emerald-400" />
              <div className="font-bold text-sm">Cash at Shop</div>
            </div>
            <div className="text-[11px] text-slate-400">Pay cash at the counter</div>
          </button>
        </div>
      </div>

      {/* 2. UPI Payment Details / QR Preview */}
      {paymentMethod === 'UPI' ? (
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Shop UPI VPA</div>
              <div className="text-sm font-semibold text-slate-100 font-mono">{activeUpi}</div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">Amount to Pay</div>
              <div className="text-base font-bold text-emerald-400">{formatCurrency(amount)}</div>
            </div>
          </div>

          {/* Mobile UPI Deep Link button & Desktop QR button */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <a
              href={upiDeepLink}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all"
            >
              <Smartphone className="w-4 h-4" />
              <span>Open UPI App to Pay</span>
            </a>

            {qrDataUrl && (
              <button
                type="button"
                onClick={() => setShowQrModal(!showQrModal)}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              >
                <QrCode className="w-4 h-4 text-indigo-400" />
                <span>{showQrModal ? 'Hide QR' : 'Show QR Code'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={copyUpiId}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              title="Copy UPI ID"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy UPI'}</span>
            </button>
          </div>

          {showQrModal && (
            <div className="p-3 bg-white rounded-xl flex flex-col items-center justify-center my-3 animate-in fade-in zoom-in-95 duration-200">
              {pricing?.shop_merchant_qr_image && pricing?.shop_qr_mode === 'CUSTOM_IMAGE' ? (
                <div className="space-y-1 text-center">
                  <img src={pricing.shop_merchant_qr_image} alt="Official Merchant QR Code" className="w-48 h-48 object-contain mx-auto rounded-lg" />
                  <p className="text-[10px] text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded-full inline-block">Official Merchant Standee QR</p>
                </div>
              ) : qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt="UPI Payment QR Code" className="w-44 h-44" />
                  <p className="text-[11px] text-slate-600 font-medium mt-1">Scan with any UPI App to Pay</p>
                </>
              ) : null}
            </div>
          )}

          {/* Explicit No-Fake-Confirmation Warning */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span>After payment, submit this order. The shopkeeper will verify the payment before approving the print job.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex items-start gap-2.5">
          <Banknote className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300">Cash Payment at Counter</p>
            <p className="text-slate-300 mt-0.5">
              Submit your order to enter the queue. Hand over {formatCurrency(amount)} in cash at the counter to start printing.
            </p>
          </div>
        </div>
      )}

      {/* 3. Customer Info (Optional) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Your Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Rahul Sharma"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Mobile Number (Optional)
          </label>
          <input
            type="tel"
            placeholder="e.g. 9876543210"
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 4. Submit Order Button */}
      <button
        type="button"
        onClick={onSubmitOrder}
        disabled={submitting || amount <= 0}
        className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:opacity-95 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
      >
        {submitting ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Submitting Order...</span>
          </div>
        ) : (
          <>
            <span>Submit Order ({formatCurrency(amount)})</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
};
