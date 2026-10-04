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
    <section className="animate-fade-in-up card-hover-lift bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-3.5 hover:border-slate-300 [animation-delay:180ms] contain-layout">
      <h2 className="text-sm font-bold text-slate-900 select-none">
        {sectionIndexText}
      </h2>

      <div className="space-y-3">
        {showNameField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 select-none">
              Your Full Name{' '}
              {isNameRequired ? (
                <span className="text-rose-500">*</span>
              ) : (
                <span className="text-slate-400 font-normal">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                placeholder="Enter your name"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 touch-manipulation"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>
        )}

        {showPhoneField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 select-none">
              WhatsApp / Mobile Number{' '}
              {isPhoneRequired ? (
                <span className="text-rose-500">*</span>
              ) : (
                <span className="text-slate-400 font-normal">(Optional)</span>
              )}
            </label>
            <div className="relative">
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 touch-manipulation"
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>
        )}

        {showNotesField && (
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 select-none">
              Special Instructions / Notes{' '}
              <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={customerNotes}
                onChange={(e) => onCustomerNotesChange(e.target.value)}
                placeholder="Pickup notes (all uploaded pages will print)"
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 touch-manipulation"
              />
              <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

CustomerIdentificationCard.displayName = 'CustomerIdentificationCard';
