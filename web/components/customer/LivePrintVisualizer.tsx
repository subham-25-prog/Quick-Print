'use client';
import React from 'react';
import { useShopName } from '@/lib/shop-sync';
interface LivePrintVisualizerProps {
  jobStatus: string; orderStatus?: string; paymentStatus?: string;
  pageCount?: number; copies?: number; fileName?: string; isTest?: boolean;
  shopName?: string; orderNumber?: string; paperSize?: string; colorMode?: string;
}
export const LivePrintVisualizer: React.FC<LivePrintVisualizerProps> = ({ jobStatus, orderStatus, pageCount = 1, copies = 1, fileName, isTest, shopName, orderNumber, paperSize = 'A4', colorMode = 'B&W' }) => {
  const name = useShopName(shopName);
  const status = ['CANCELLED', 'REJECTED'].includes(orderStatus || '') ? orderStatus! : jobStatus || orderStatus || 'PENDING';
  const states: Record<string, { title: string; detail: string; step: number; attention?: boolean }> = {
    PENDING: { title: 'Preparing Document Pages', detail: 'Your order is queued. Printing begins when the shop printer is available.', step: 1 },
    CLAIMED: { title: 'Preparing your print job', detail: 'The shop print agent is preparing your document for submission.', step: 2 },
    PRINTING: { title: 'Sending document to printer', detail: 'The print agent is processing your job. Physical page progress is not available.', step: 2 },
    SUBMITTED: { title: 'Sent to printer', detail: 'Your document was submitted to the printer. Check with the counter before collecting; physical completion is not confirmed.', step: 3 },
    PRINTED: { title: 'Document Printed & Ready!', detail: 'Printing is confirmed. Collect your documents at the shop counter.', step: 4 },
    REVIEW: { title: 'Shop review needed', detail: 'The print result is uncertain. Ask the shopkeeper to check before retrying to avoid duplicate copies.', step: 2, attention: true },
    FAILED: { title: 'Printer Attention Needed', detail: 'Printing could not finish. Contact the shopkeeper with your order number; please do not pay again.', step: 2, attention: true },
    CANCELLED: { title: 'Order cancelled', detail: 'This order will not continue printing. Contact the shop for payment or refund questions.', step: 0, attention: true },
    REJECTED: { title: 'Order declined', detail: 'The shop could not accept this order. Contact the counter for help.', step: 0, attention: true },
  };
  const state = states[status] || states.PENDING;
  return (
    <section aria-label="Print status" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500"><span>{name}</span>{orderNumber && <span>Order {orderNumber}</span>}</div>
      {isTest && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Simulation only — no physical print output.</p>}
      <div role="status" aria-live="polite">
        <h3 className={state.attention ? 'text-2xl font-bold text-amber-800' : 'text-2xl font-bold text-slate-900'}>{state.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{state.detail}</p>
      </div>
      {!state.attention && <ol aria-label="Print stages" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {['Queued', 'Processing', 'Submitted', 'Printed'].map((label, index) => <li key={label} aria-current={state.step === index + 1 ? 'step' : undefined} className={'rounded-xl border px-3 py-3 text-xs font-semibold ' + (state.step >= index + 1 ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-500')}>{index + 1}. {label}</li>)}
      </ol>}
      <div className="border-t border-slate-100 pt-4 text-sm text-slate-600"><p className="break-all font-medium text-slate-900">{fileName}</p><p className="mt-1">{pageCount} {pageCount === 1 ? 'page' : 'pages'} · {copies} {copies === 1 ? 'copy' : 'copies'} · {paperSize} · {colorMode}</p></div>
    </section>
  );
};
