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
}) => {
  const allowOnline = onlineEnabled !== undefined
    ? onlineEnabled
    : pricing?.form_fields?.allowUpiPayment !== false;
  const allowCash = cashEnabled !== undefined
    ? cashEnabled
    : Boolean(pricing?.form_fields?.allowCashPayment);

  if (!isOpen) return null;

  // Once a payment method is chosen, replace the choice card immediately.
  // Large batches can still be compiling/uploading at this point, but the
  // customer should see an intentional loading page rather than disabled
  // Cash/UPI buttons that look unresponsive.
  if (submitting) {
    const isCash = selectedMethod === 'CASH';
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-950 text-white flex items-center justify-center p-6"
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-sm text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-3 border-indigo-300/30 border-t-indigo-300 animate-spin" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black tracking-tight">Preparing your print order</h3>
            <p className="text-sm text-slate-300 leading-6">
              {isCash
                ? 'Your files are being prepared before we create the cash confirmation.'
                : 'Your files are being prepared before we open secure UPI payment.'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-xs font-semibold text-indigo-100">
            Please keep this page open. You will continue automatically.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto contain-layout">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Secure payment</h3>
            <p className="text-[11px] text-slate-400 font-medium">Your order is created after payment verification.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close payment options"
            className="shrink-0 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total amount</div>
          <div className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(amount)}</div>
        </div>

        {error&&<p role="alert" className="p-3 rounded-xl bg-amber-50 text-amber-900 [overflow-wrap:anywhere]">{error}</p>}
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
            onClick={() => void onConfirmPayment('CASH')}
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
              {submitting && selectedMethod === 'CASH' ? 'Preparing cash confirmation…' : `Pay ${formatCurrency(amount)} by cash`}
            </span>
          </button>
        )}

        {!allowOnline && !allowCash && (
          <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold text-center">
            Payment options are temporarily unavailable. Please contact the shopkeeper.
          </p>
        )}
      </div>
    </div>
  );
});
PaymentModal.displayName = 'PaymentModal';
