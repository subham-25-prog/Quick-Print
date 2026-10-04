'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { PricingConfig } from '@/types';
import { X, Banknote, Smartphone } from '@/components/ui/Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  onConfirmPayment: (method: 'UPI' | 'CASH') => Promise<void>;
  submitting: boolean;
  pricing?: PricingConfig;
  onlineEnabled?: boolean;
  cashEnabled?: boolean;
  error?: string;
  selectedMethod?: 'UPI' | 'CASH' | null;
  uploadProgress?: number;
  uploadStage?: 'idle' | 'uploading' | 'processing' | 'ready';
}

export const PaymentModal: React.FC<PaymentModalProps> = React.memo(({
  isOpen,
  onClose,
  amount,
  onConfirmPayment,
  submitting,
  pricing,
  onlineEnabled,
  cashEnabled,
  error,
  selectedMethod,
  uploadProgress = 0,
  uploadStage = 'idle',
}) => {
  const allowOnline = onlineEnabled !== undefined
    ? onlineEnabled
    : pricing?.form_fields?.allowUpiPayment !== false;
  const allowCash = cashEnabled !== undefined
    ? cashEnabled
    : Boolean(pricing?.form_fields?.allowCashPayment);

  const isCashLoading = submitting && selectedMethod === 'CASH';
  const isDocumentUploading = uploadStage === 'uploading' && uploadProgress < 100;
  const isDocumentProcessing = uploadStage === 'processing';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto contain-layout">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isCashLoading
                ? isDocumentUploading
                  ? 'Uploading Document'
                  : 'Cash Payment'
                : 'Secure payment'}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              {isCashLoading
                ? isDocumentUploading
                  ? `Transferring document to shop (${uploadProgress}%)…`
                  : isDocumentProcessing
                  ? 'Finalizing document structure…'
                  : 'Connecting to shop counter…'
                : 'Your order is created after payment verification.'}
            </p>
          </div>
          {!isCashLoading && (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close payment options"
              className="shrink-0 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Dedicated Loading Animation ONLY for Cash confirmation step */}
        {isCashLoading ? (
          <div className="py-6 px-2 flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Animated Cash Graphic Stage */}
            <div className="relative flex items-center justify-center my-2">
              {/* Outer pulsing emerald halo */}
              <div className="absolute w-24 h-24 rounded-full bg-emerald-400/25 animate-ping opacity-60" />
              <div className="absolute w-28 h-28 rounded-full bg-emerald-500/10 animate-pulse" />

              {/* Spinning gradient border accent */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-300 p-0.5 animate-spin [animation-duration:2.5s]">
                <div className="w-full h-full bg-white rounded-[14px]" />
              </div>

              {/* Center Cash Icon badge with floating pulse */}
              <div className="absolute w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                <Banknote className="w-7 h-7 text-emerald-600 animate-pulse" />
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-1 max-w-xs">
              <h4 className="text-lg font-black text-slate-900 tracking-tight">
                {isDocumentUploading
                  ? `Uploading Document (${uploadProgress}%)`
                  : isDocumentProcessing
                  ? 'Processing Document…'
                  : 'Confirming Cash Order…'}
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {isDocumentUploading
                  ? 'Transferring your file to the shop printer before counter confirmation'
                  : isDocumentProcessing
                  ? 'Verifying pages and preparing print record'
                  : 'Generating counter slip & connecting to shop terminal'}
              </p>
            </div>

            {/* Prominent Amount Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Pay {formatCurrency(amount)} at Counter</span>
            </div>

            {/* Real Progress Bar when uploading, Smooth animated wave when finalizing order */}
            <div className="w-full max-w-xs bg-slate-100 rounded-full h-2.5 overflow-hidden relative border border-slate-200/60 shadow-inner">
              {isDocumentUploading && uploadProgress > 0 ? (
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${Math.max(uploadProgress, 5)}%` }}
                />
              ) : (
                <div className="absolute inset-y-0 h-full w-1/2 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 rounded-full animate-cash-progress" />
              )}
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              {isDocumentUploading
                ? 'Please keep this tab open while your document uploads.'
                : 'Please keep cash ready for the operator.'}
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total amount</div>
              <div className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(amount)}</div>
            </div>

            {error && <p role="alert" className="p-3 rounded-xl bg-amber-50 text-amber-900 [overflow-wrap:anywhere]">{error}</p>}
            {submitting && (
              <p role="status" className="p-3 rounded-xl bg-indigo-50 text-indigo-900 text-sm font-medium text-center">
                {isDocumentUploading
                  ? `Uploading document (${uploadProgress}%)…`
                  : isDocumentProcessing
                  ? 'Finalizing document structure…'
                  : 'Opening secure payment…'}
              </p>
            )}
            {allowOnline && (
              <button
                type="button"
                onClick={() => void onConfirmPayment('UPI')}
                disabled={submitting}
                className="w-full text-left p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border-2 border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Pay Online</span>
                    <span className="block text-[11px] text-slate-500 font-medium mt-0.5">UPI • Google Pay • PhonePe • Paytm</span>
                  </span>
                </span>
                <span className="mt-3 block w-full py-3 rounded-xl bg-indigo-600 text-center text-white font-bold text-xs">
                  {submitting && selectedMethod === 'UPI' ? 'Opening payment app…' : `Pay ${formatCurrency(amount)} online`}
                </span>
              </button>
            )}

            {allowCash && (
              <button
                type="button"
                onPointerDown={(e) => {
                  if (e.button === 0 && !submitting) {
                    void onConfirmPayment('CASH');
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  if (!submitting) {
                    void onConfirmPayment('CASH');
                  }
                }}
                disabled={submitting}
                className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Pay by Cash</span>
                    <span className="block text-[11px] text-slate-500 font-medium mt-0.5">Pay at the counter; the shopkeeper verifies before printing.</span>
                  </span>
                </span>
                <span className="mt-3 block w-full py-3 rounded-xl bg-white border border-slate-300 text-center text-slate-800 font-bold text-xs">
                  Pay {formatCurrency(amount)} by cash
                </span>
              </button>
            )}

            {!allowOnline && !allowCash && (
              <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold text-center">
                Payment options are temporarily unavailable. Please contact the shopkeeper.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
});
PaymentModal.displayName = 'PaymentModal';
