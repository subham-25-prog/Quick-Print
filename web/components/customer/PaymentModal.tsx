'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { PricingConfig } from '@/types';
import { X, Banknote, Smartphone, Sparkles } from '@/components/ui/Icons';

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

  const isCashLoading = submitting && selectedMethod === 'CASH';

  if (!isOpen) return null;

  // Match the Canvas Studio Apply experience while the cash order is being
  // created: a focused full-screen progress overlay with no competing UI.
  if (isCashLoading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in pointer-events-auto select-none p-4">
        <div className="bg-[#1e2022]/95 border border-slate-700/80 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full text-center backdrop-blur-xl animate-scale-up">
          <div className="relative flex items-center justify-center w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-white tracking-wide">Confirming Cash Payment...</h4>
            <p className="text-xs text-slate-400">Creating your counter slip and connecting to the shop</p>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-full w-full animate-pulse rounded-full" />
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
            <h3 className="text-base font-bold text-slate-900">
              Secure payment
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Your order is created after payment verification.
            </p>
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

        <>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total amount</div>
              <div className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(amount)}</div>
            </div>

            {error && <p role="alert" className="p-3 rounded-xl bg-amber-50 text-amber-900 [overflow-wrap:anywhere]">{error}</p>}
            {submitting && (
              <p role="status" className="p-3 rounded-xl bg-indigo-50 text-indigo-900 text-sm font-medium text-center">
                Opening secure payment…
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
      </div>
    </div>
  );
});
PaymentModal.displayName = 'PaymentModal';
