'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { formatCurrency } from '@/lib/utils';
import { shopConfig } from '@/lib/config';
import { PricingConfig } from '@/types';
import { generateUpiDeepLink } from '@/lib/pricing';
import { X, Banknote, CheckCircle2, Smartphone, QrCode, Copy, Check, Info } from '@/components/ui/Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  orderNumberPreview: string;
  onConfirmPayment: (method: 'UPI' | 'CASH', transactionRef?: string) => void;
  submitting: boolean;
  pricing?: PricingConfig;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  orderNumberPreview,
  onConfirmPayment,
  submitting,
  pricing,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');

  // Determine active UPI ID and Payee Name directly from server config
  const activeUpi = (pricing?.shop_upi_id || shopConfig.upiId || 'shop@upi').trim();
  const activeName = (pricing?.shop_upi_name || pricing?.shop_name || shopConfig.upiPayeeName || shopConfig.name).trim();

  const upiDeepLink = generateUpiDeepLink({
    upiId: activeUpi,
    payeeName: activeName,
    amount,
    orderNumber: orderNumberPreview,
  });

  const allowUpi = pricing?.form_fields?.allowUpiPayment !== false;
  const allowCash = pricing?.form_fields?.allowCashPayment !== false;

  useEffect(() => {
    if (isOpen && amount > 0 && allowUpi && activeUpi) {
      QRCode.toDataURL(upiDeepLink, {
        width: 280,
        margin: 1.5,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isOpen, amount, upiDeepLink, allowUpi, activeUpi]);

  const copyUpiId = () => {
    if (activeUpi) {
      navigator.clipboard.writeText(activeUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePayUpi = () => {
    // Triggers phone OS intent to let customer choose from installed UPI apps
    window.location.href = upiDeepLink;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Select Payment Method</h3>
            <p className="text-[11px] text-slate-400 font-medium">Order #{orderNumberPreview}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Total Amount Box */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-0.5">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Amount to Pay
          </div>
          <div className="text-3xl font-black text-emerald-600 tracking-tight">
            {formatCurrency(amount)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium pt-0.5">
            100% Direct Payment to Shopkeeper
          </div>
        </div>

        {/* ⚡ Option 1: Direct UPI */}
        {allowUpi && (
          <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border-2 border-indigo-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-indigo-600 font-bold text-base">⚡</span>
                <div>
                  <div className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Option 1: Pay via UPI
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    PhonePe • Google Pay • Paytm • BHIM
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                Instant
              </span>
            </div>

            {/* Direct 1-Tap UPI Intent Button to trigger phone's installed app chooser */}
            <a
              href={upiDeepLink}
              onClick={handlePayUpi}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.98] text-white font-black text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Pay {formatCurrency(amount)} via UPI App</span>
            </a>

            {/* Secondary actions: QR code toggle & Copy UPI ID */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={copyUpiId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-mono border border-slate-200 transition-colors cursor-pointer"
                title="Click to copy UPI ID"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>UPI: <strong className="text-indigo-600 font-bold">{activeUpi}</strong></span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-600 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQr ? 'Hide QR' : 'Show QR Code'}</span>
              </button>
            </div>

            {/* Scannable QR Code (Merchant Standee Image or Auto-Generated) */}
            {showQr && (
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col items-center justify-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
                {pricing?.shop_merchant_qr_image && pricing?.shop_qr_mode === 'CUSTOM_IMAGE' ? (
                  <div className="space-y-1.5 text-center">
                    <img
                      src={pricing.shop_merchant_qr_image}
                      alt="Shopkeeper Official Merchant QR"
                      className="w-48 h-48 object-contain mx-auto rounded-xl border border-slate-100 p-1"
                    />
                    <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full inline-block">
                      Official Merchant Standee QR Code
                    </div>
                  </div>
                ) : qrDataUrl ? (
                  <div className="space-y-1 text-center">
                    <img src={qrDataUrl} alt="UPI QR Code" className="w-40 h-40 mx-auto" />
                    <p className="text-[10px] text-slate-500 font-medium">Scan with PhonePe, GPay, Paytm, BHIM</p>
                  </div>
                ) : null}
                <div className="text-[11px] font-bold text-slate-900 font-mono">
                  Amount to Pay: {formatCurrency(amount)}
                </div>
              </div>
            )}

            {/* Optional UTR / Reference No. Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500">
                UPI Reference / UTR No. (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 423456789012 (12-digit UTR)"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-mono placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Place Order & Send to Counter */}
            <button
              type="button"
              onClick={() => onConfirmPayment('UPI', transactionRef)}
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Sending Order to Counter...</span>
                </div>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Place Order ({formatCurrency(amount)})</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-slate-500 font-medium">
              🔒 <strong>Counter Verification Required:</strong> Show your UPI payment confirmation to the shopkeeper. Printing starts after verification.
            </p>
          </div>
        )}

        {/* 💵 Option 2: Cash at Counter */}
        {allowCash && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    {allowUpi ? 'Option 2: Pay Cash at Counter' : 'Pay Cash at Counter'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Prints after shopkeeper receives cash & approves
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onConfirmPayment('CASH')}
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-300 text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span>Submitting Order...</span>
              ) : (
                <>
                  <span>💵</span>
                  <span>Pay Cash {formatCurrency(amount)} at Counter</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Fallback if both are disabled */}
        {!allowUpi && !allowCash && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-center text-xs font-semibold space-y-2">
            <div>Please pay {formatCurrency(amount)} directly at the counter.</div>
            <button
              type="button"
              onClick={() => onConfirmPayment('CASH')}
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Submitting Order...' : 'Submit Order & Pay at Counter'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

