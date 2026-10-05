'use client';

import { memo } from 'react';
import { User, Phone, MessageSquare } from '@/components/ui/Icons';

interface CustomerIdentificationCardProps {
  customerName: string;
  onCustomerNameChange: (val: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  customerNotes: string;
  onCustomerNotesChange: (val: string) => void;
  showNameField: boolean;
  isNameRequired: boolean;
  showPhoneField: boolean;
  isPhoneRequired: boolean;
  showNotesField: boolean;
  sectionIndexText: string;
}

export const CustomerIdentificationCard = memo<CustomerIdentificationCardProps>(({
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  customerNotes,
  onCustomerNotesChange,
  showNameField,
  isNameRequired,
  showPhoneField,
  isPhoneRequired,
  showNotesField,
  sectionIndexText,
}) => {
  return (
    <section className="animate-fade-in-up spidey-card rounded-3xl p-5 sm:p-6 space-y-3.5 [animation-delay:180ms] contain-layout text-white">
      <h2 className="text-sm font-black text-white select-none flex items-center gap-2">
        <span className="text-red-400">🦸</span>
        <span>{sectionIndexText} (Secret Identity)</span>
      </h2>

      <div className="space-y-3">
        {showNameField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1 select-none">
              Your Full Name{' '}
              {isNameRequired ? (
                <span className="text-rose-400">*</span>
              ) : (
                <span className="text-slate-500 font-normal">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                placeholder="Enter your name"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-white bg-slate-950/80 placeholder-slate-500 focus:bg-slate-900 focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-500/20 touch-manipulation transition-all"
              />
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>
        )}

        {showPhoneField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1 select-none">
              WhatsApp / Mobile Number{' '}
              {isPhoneRequired ? (
                <span className="text-rose-400">*</span>
              ) : (
                <span className="text-slate-500 font-normal">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-white bg-slate-950/80 placeholder-slate-500 focus:bg-slate-900 focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-500/20 touch-manipulation transition-all"
              />
              <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>
        )}

        {showNotesField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1 select-none">
              Special Instructions / Notes{' '}
              <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={customerNotes}
                onChange={(e) => onCustomerNotesChange(e.target.value)}
                placeholder="Pickup notes (all uploaded pages will print)"
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-800 text-xs font-semibold text-white bg-slate-950/80 placeholder-slate-500 focus:bg-slate-900 focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-500/20 touch-manipulation transition-all resize-none"
              />
              <MessageSquare className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

CustomerIdentificationCard.displayName = 'CustomerIdentificationCard';
