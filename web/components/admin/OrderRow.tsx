'use client';

import React, { memo } from 'react';
import { Order } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  MessageSquare,
  X,
  Trash2,
} from '@/components/ui/Icons';

interface OrderRowProps {
  rawOrder: any;
  copiedOrderId: string | null;
  actionLoadingKey: string | null;
  onCopyOrderNumber: (orderNumber: string, e: React.MouseEvent) => void;
  onAcceptCash: (orderId: string) => void;
  onRejectCash: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onSelectOrderForHistory: (order: Order) => void;
}

const getInitials = (name?: string) => {
  if (!name || !name.trim()) return 'QP';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

const getFileBadge = (fileName?: string) => {
  if (!fileName) return { ext: 'FILE', color: 'bg-slate-100 text-slate-700' };
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  if (ext === 'PDF') return { ext, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (['DOC', 'DOCX'].includes(ext)) return { ext, color: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (['JPG', 'JPEG', 'PNG'].includes(ext)) return { ext, color: 'bg-purple-100 text-purple-700 border-purple-200' };
  return { ext, color: 'bg-slate-100 text-slate-700 border-slate-200' };
};

export const OrderRow = memo(function OrderRow({
  rawOrder,
  copiedOrderId,
  actionLoadingKey,
  onCopyOrderNumber,
  onAcceptCash,
  onRejectCash,
  onDeleteOrder,
  onSelectOrderForHistory,
}: OrderRowProps) {
  const order = {
    ...rawOrder,
    id: String(rawOrder.id || rawOrder.orderId || rawOrder.order_id || ''),
    order_number: String(rawOrder.order_number || rawOrder.orderNumber || rawOrder.order_id || rawOrder.id || 'QP-0000'),
    customer_name: rawOrder.customer_name || rawOrder.customerName || rawOrder.name || undefined,
    customer_phone: rawOrder.customer_phone || rawOrder.customerPhone || rawOrder.phone || undefined,
    customer_notes: rawOrder.customer_notes || rawOrder.customerNotes || rawOrder.notes || undefined,
    file_name: String(rawOrder.file_name || rawOrder.fileName || rawOrder.filename || 'document.pdf'),
    paper_size: String(rawOrder.paper_size || rawOrder.paperSize || 'A4'),
    color_mode: String(rawOrder.color_mode || rawOrder.colorMode || 'BW'),
    print_sides: String(rawOrder.print_sides || rawOrder.printSides || 'SINGLE'),
    page_count: Math.max(1, parseInt(String(rawOrder.page_count ?? rawOrder.pageCount ?? 1), 10) || 1),
    copies: Math.max(1, parseInt(String(rawOrder.copies ?? 1), 10) || 1),
    total_amount: Number(rawOrder.total_amount ?? rawOrder.totalAmount ?? rawOrder.total_price ?? 0),
    payment_method: String(rawOrder.payment_method || rawOrder.paymentMethod || 'UPI'),
    created_at: String(rawOrder.created_at || rawOrder.createdAt || rawOrder.timestamp || ''),
    order_status: rawOrder.order_status,
    add_ons: rawOrder.add_ons,
  };

  const isPending = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
  const isPrinting = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
  const isPrinted = order.order_status === 'PRINTED' || order.order_status === 'SUBMITTED';
  const isRejected = order.order_status === 'REJECTED';

  const fileBadge = getFileBadge(order.file_name);
  const initials = getInitials(order.customer_name);
  const totalPages = (order.page_count || 1) * (order.copies || 1);

  return (
    <div
      key={order.id}
      className={`rounded-2xl py-3 px-4 border transition-all duration-150 flex items-center justify-between gap-3 bg-white shadow-2xs hover:shadow-md relative overflow-hidden min-w-[760px] font-sans group content-auto contain-layout ${
        isPending
          ? 'border-amber-300/90 bg-gradient-to-r from-amber-50/40 via-white to-white'
          : isPrinting
          ? 'border-indigo-300 bg-gradient-to-r from-indigo-50/40 via-white to-white ring-1 ring-indigo-500/20'
          : isPrinted
          ? 'border-slate-200 bg-white hover:border-emerald-300'
          : isRejected
          ? 'border-rose-200 bg-rose-50/15'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Left Indicator Stripe */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          isPending
            ? 'bg-amber-500'
            : isPrinting
            ? 'bg-indigo-600 animate-pulse'
            : isPrinted
            ? 'bg-emerald-500'
            : isRejected
            ? 'bg-rose-500'
            : 'bg-slate-300'
        }`}
      />

      {/* Column 1: Customer & Token */}
      <div className="flex items-center gap-3 min-w-[260px] max-w-[340px] lg:max-w-[400px] pl-1.5 shrink-0">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 shadow-xs select-none ${
            isPending
              ? 'bg-gradient-to-tr from-amber-500 to-orange-500'
              : isPrinting
              ? 'bg-gradient-to-tr from-indigo-600 to-blue-500'
              : isPrinted
              ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
              : 'bg-slate-700'
          }`}
        >
          {initials}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="font-extrabold text-xs text-slate-900 truncate max-w-[190px] sm:max-w-[240px] lg:max-w-[290px]"
              title={order.customer_name?.trim() || 'Walk-in'}
            >
              {order.customer_name?.trim() || 'Walk-in'}
            </span>
            <button
              type="button"
              onClick={(e) => onCopyOrderNumber(order.order_number, e)}
              className="font-mono text-[10px] font-extrabold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-1.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1 cursor-pointer shrink-0 transition-colors active-press select-none"
              title="Copy Order #"
            >
              <span>{order.order_number}</span>
              {copiedOrderId === order.order_number ? (
                <Check className="w-2.5 h-2.5 text-emerald-600" />
              ) : (
                <Copy className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
              )}
            </button>
          </div>
          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-2 whitespace-nowrap mt-0.5">
            <span>{formatDate(order.created_at)}</span>
            {order.customer_phone && (
              <a
                href={`tel:${order.customer_phone}`}
                className="text-indigo-600 font-bold hover:underline"
              >
                📞 {order.customer_phone}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Column 2: Document & Specification Badges & Customer Notes */}
      <div className="flex-1 flex flex-col justify-center min-w-0 px-2 gap-1 overflow-hidden">
        <div className="flex items-center gap-1.5 text-[11px] min-w-0 overflow-hidden whitespace-nowrap select-none">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase shrink-0 shadow-2xs ${fileBadge.color}`}>
            {fileBadge.ext}
          </span>
          <span className="font-extrabold text-slate-800 text-xs truncate max-w-[160px]" title={order.file_name}>
            {order.file_name}
          </span>

          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0">
            {order.paper_size}
          </span>

          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0 flex items-center gap-1">
            {order.color_mode === 'COLOR' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-pink-500 via-amber-400 to-cyan-400" />
                <span>Color</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                <span>B&W</span>
              </>
            )}
          </span>

          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0">
            {order.print_sides === 'DOUBLE' ? '🔄 2-Side' : '📄 1-Side'}
          </span>

          <span
            className="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] shrink-0 shadow-2xs"
            title={`${order.page_count} document ${order.page_count === 1 ? 'page' : 'pages'}; ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} to print`}
          >
            Pages: {order.page_count} × {order.copies} · Print: {totalPages}
          </span>

          {order.add_ons?.spiralBinding && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-extrabold text-[10px] shrink-0 border border-indigo-200">
              📚 Spiral
            </span>
          )}
          {order.add_ons?.hardBinding && (
            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-extrabold text-[10px] shrink-0 border border-purple-200">
              📕 HardBound
            </span>
          )}
        </div>

        {order.customer_notes && (
          <div
            className="flex items-center gap-1.5 text-[11px] text-amber-950 bg-amber-50/90 border border-amber-300/80 px-2 py-0.5 rounded-md max-w-fit font-medium truncate shadow-2xs select-none"
            title={`Customer instructions: ${order.customer_notes}`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-extrabold text-[10px] uppercase text-amber-800 shrink-0">Note:</span>
            <span className="truncate max-w-[400px] font-semibold">{order.customer_notes}</span>
          </div>
        )}
      </div>

      {/* Column 3: Price, Payment Status & Action Buttons */}
      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap ml-auto select-none">
        <div className="text-right shrink-0">
          <div className="text-xs font-black text-slate-900">
            {formatCurrency(order.total_amount)}
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                order.payment_method === 'UPI'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {order.payment_method}
            </span>
            <span
              className={`px-2 py-0.2 rounded-full text-[9px] font-extrabold uppercase ${
                isPending
                  ? 'bg-amber-100 text-amber-800'
                  : isPrinting
                  ? 'bg-indigo-100 text-indigo-800'
                  : isPrinted
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {order.order_status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Pending Cash / Verification Action Buttons */}
          {isPending && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcceptCash(order.id);
                }}
                disabled={actionLoadingKey === `${order.id}_ACCEPT`}
                title="Verify cash payment and start printing"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active-press text-white font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{actionLoadingKey === `${order.id}_ACCEPT` ? 'Verifying...' : 'Verify Cash & Print'}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRejectCash(order.id);
                }}
                disabled={actionLoadingKey === `${order.id}_REJECT`}
                title="Reject cash order"
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 font-extrabold text-[11px] flex items-center gap-1 transition-all active-press cursor-pointer disabled:opacity-50"
              >
                <X className="w-3 h-3" />
                <span>Reject</span>
              </button>
            </>
          )}

          {/* Order History / Audit Details Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectOrderForHistory(order as Order);
            }}
            title="View order history & specifications"
            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center gap-1 border border-indigo-200/80 transition-all active-press cursor-pointer"
          >
            <Clock className="w-3 h-3" />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteOrder(order.id);
            }}
            disabled={actionLoadingKey === `${order.id}_DELETE`}
            title="Delete order from history"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all active-press cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
