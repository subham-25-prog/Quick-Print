'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { PricingConfig } from '@/types';
import { X, Banknote, Smartphone } from '@/components/ui/Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  orderNumberPreview: string;
  onConfirmPayment: (method: 'UPI' | 'CASH') => Promise<void>;
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
  const allowOnline = pricing?.form_fields?.allowUpiPayment !== false;
  const allowCash = pricing?.form_fields?.allowCashPayment !== false;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Choose how to pay</h3>
            <p className="text-[11px] text-slate-400 font-medium">Order #{orderNumberPreview}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment options"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total amount</div>
          <div className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(amount)}</div>
        </div>

        {allowOnline && (
          <button
            type="button"
            onClick={() => void onConfirmPayment('UPI')}
            disabled={submitting}
            className="w-full text-left p-4 sm:p-5 rounded-2xl bg-indigo-50/50 border-2 border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
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
              {submitting ? 'Opening payment app…' : `Pay ${formatCurrency(amount)} online`}
            </span>
          </button>
        )}

        {allowCash && (
          <button
            type="button"
            onClick={() => void onConfirmPayment('CASH')}
            disabled={submitting}
            className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
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
      </div>
    </div>
  );
};
