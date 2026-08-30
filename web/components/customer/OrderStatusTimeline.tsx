'use client';

import React from 'react';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@/types';
import { CheckCircle2, Clock, Printer, Check, XCircle, AlertTriangle, AlertCircle } from '@/components/ui/Icons';

interface OrderStatusTimelineProps {
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  rejectionReason?: string;
  failureReason?: string;
}

export const OrderStatusTimeline: React.FC<OrderStatusTimelineProps> = ({
  orderStatus,
  paymentMethod,
  paymentStatus,
  rejectionReason,
  failureReason,
}) => {
  const isRejected = orderStatus === 'REJECTED' || orderStatus === 'CANCELLED';
  const isFailed = orderStatus === 'FAILED';

  const steps = [
    {
      id: 'submitted',
      label: 'Order Submitted',
      description: paymentMethod === 'UPI' ? 'UPI payment reference recorded' : 'Cash on counter selected',
      isCompleted: true,
      isCurrent: false,
    },
    {
      id: 'verification',
      label: 'Payment Verification',
      description:
        paymentStatus === 'VERIFIED'
          ? 'Payment verified by shopkeeper'
          : paymentMethod === 'UPI'
          ? 'Shopkeeper verifying in UPI app'
          : 'Waiting for cash payment at counter',
      isCompleted: paymentStatus === 'VERIFIED' || ['APPROVED', 'PRINTING', 'PRINTED'].includes(orderStatus),
      isCurrent: orderStatus === 'PAYMENT_VERIFICATION_PENDING' || orderStatus === 'PENDING_PAYMENT',
    },
    {
      id: 'approved',
      label: 'Approved for Printing',
      description: 'Job queued in shop printer system',
      isCompleted: ['APPROVED', 'PRINTING', 'PRINTED'].includes(orderStatus),
      isCurrent: orderStatus === 'APPROVED',
    },
    {
      id: 'printing',
      label: 'Printing Document',
      description: 'Sending to shop printer',
      isCompleted: orderStatus === 'PRINTED',
      isCurrent: orderStatus === 'PRINTING',
    },
    {
      id: 'ready',
      label: 'Printed & Ready',
      description: 'Collect your print from the counter',
      isCompleted: orderStatus === 'PRINTED',
      isCurrent: orderStatus === 'PRINTED',
    },
  ];

  if (isRejected) {
    return (
      <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200">
        <div className="flex items-center gap-3">
          <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
          <div>
            <h3 className="font-bold text-lg text-rose-100">Order {orderStatus}</h3>
            <p className="text-xs text-rose-300 mt-0.5">
              {rejectionReason || 'This order was declined by the shopkeeper.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
          <div>
            <h3 className="font-bold text-lg text-amber-100">Printer Notice</h3>
            <p className="text-xs text-amber-300 mt-0.5">
              {failureReason || 'Printer is currently busy or experiencing a delay. The shopkeeper will reprint shortly.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {steps.map((step) => {
          let dotBg = 'bg-slate-800 text-slate-500 border-slate-700';
          if (step.isCompleted) {
            dotBg = 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20';
          } else if (step.isCurrent) {
            dotBg = 'bg-indigo-600 text-white border-indigo-400 ring-4 ring-indigo-500/20 animate-pulse';
          }

          return (
            <div key={step.id} className="relative flex items-start gap-3">
              <div
                className={`absolute -left-6 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${dotBg}`}
              >
                {step.isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : null}
              </div>
              <div>
                <h4
                  className={`text-sm font-semibold ${
                    step.isCompleted
                      ? 'text-emerald-300'
                      : step.isCurrent
                      ? 'text-indigo-400 font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
