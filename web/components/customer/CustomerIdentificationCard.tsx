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
  missingRequiredFields: string[];
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
  missingRequiredFields,
}) => {
  const showNameError = missingRequiredFields.includes('your full name');
  const showPhoneError = missingRequiredFields.includes('your WhatsApp / mobile number');

  return (
    <section className="animate-fade-in-up card-hover-lift bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-3.5 hover:border-slate-300 [animation-delay:180ms] contain-layout">
      <h2 className="text-sm font-bold text-slate-900 select-none">
        {sectionIndexText}
      </h2>

      {missingRequiredFields.length > 0 && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          Please fill in all mandatory fields before opening Preview.
        </p>
      )}

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
                id="customer-name"
                type="text"
                value={customerName}
                onChange={(e) => onCustomerNameChange(e.target.value)}
                placeholder="Enter your name"
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'customer-name-error' : undefined}
                className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 touch-manipulation ${showNameError ? 'border-rose-500 ring-1 ring-rose-200' : 'border-slate-200'}`}
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            {showNameError && <p id="customer-name-error" className="mt-1 text-[11px] font-medium text-rose-600">Your full name is required.</p>}
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
                id="customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                placeholder="e.g. 9876543210"
                aria-invalid={showPhoneError}
                aria-describedby={showPhoneError ? 'customer-phone-error' : undefined}
                className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-xs font-medium text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:border-indigo-600 touch-manipulation ${showPhoneError ? 'border-rose-500 ring-1 ring-rose-200' : 'border-slate-200'}`}
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            {showPhoneError && <p id="customer-phone-error" className="mt-1 text-[11px] font-medium text-rose-600">Your WhatsApp / mobile number is required.</p>}
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
