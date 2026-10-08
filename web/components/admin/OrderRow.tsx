'use client';

import React, { memo } from 'react';
import { Order } from '@/types';
import { formatCurrency, formatDate, isCanvasStudioOrder } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  MessageSquare,
  X,
  Trash2,
  Sparkles,
  Phone,
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
  if (!fileName) return { ext: 'FILE', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
  if (ext === 'PDF') return { ext, color: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (['DOC', 'DOCX'].includes(ext)) return { ext, color: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (['JPG', 'JPEG', 'PNG', 'WEBP'].includes(ext)) return { ext, color: 'bg-purple-100 text-purple-700 border-purple-200' };
  return { ext, color: 'bg-slate-100 text-slate-700 border-slate-200' };
};

function areOrderRowPropsEqual(prevProps: OrderRowProps, nextProps: OrderRowProps): boolean {
  const prevId = String(prevProps.rawOrder?.id || prevProps.rawOrder?.orderId || '');
  const nextId = String(nextProps.rawOrder?.id || nextProps.rawOrder?.orderId || '');
  if (prevId !== nextId) return false;

  const prevOrderNum = String(prevProps.rawOrder?.order_number || prevProps.rawOrder?.orderNumber || prevId);
  const nextOrderNum = String(nextProps.rawOrder?.order_number || nextProps.rawOrder?.orderNumber || nextId);

  // If copied state affects this specific row
  if (prevProps.copiedOrderId !== nextProps.copiedOrderId) {
    if (prevProps.copiedOrderId === prevOrderNum || nextProps.copiedOrderId === nextOrderNum) {
      return false;
    }
  }

  // If actionLoadingKey affects this specific row
  const prevKey = prevProps.actionLoadingKey;
  const nextKey = nextProps.actionLoadingKey;
  if (prevKey !== nextKey) {
    if (prevKey?.startsWith(prevId) || nextKey?.startsWith(nextId)) {
      return false;
    }
  }

  const prev = prevProps.rawOrder;
  const next = nextProps.rawOrder;
  if (!prev || !next) return prev === next;

  return (
    prev.order_status === next.order_status &&
    prev.total_amount === next.total_amount &&
    prev.payment_status === next.payment_status &&
    prev.copies === next.copies &&
    prev.page_count === next.page_count &&
    prev.paper_size === next.paper_size &&
    prev.color_mode === next.color_mode &&
    prev.print_sides === next.print_sides &&
    prev.customer_name === next.customer_name &&
    prev.customer_phone === next.customer_phone &&
    prev.customer_notes === next.customer_notes &&
    prev.file_name === next.file_name
  );
}

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
    advanced_config: rawOrder.advanced_config,
    pricing_snapshot: rawOrder.pricing_snapshot,
  };

  const isPending = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
  const isPrinting = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
  const isPrinted = order.order_status === 'PRINTED' || order.order_status === 'SUBMITTED';
  const isRejected = order.order_status === 'REJECTED';

  const isCanvasStudio = isCanvasStudioOrder(rawOrder);
  const fileBadge = getFileBadge(order.file_name);
  const initials = getInitials(order.customer_name);
  const totalPages = (order.page_count || 1) * (order.copies || 1);

  return (
    <div
      key={order.id}
      className={`rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 relative overflow-hidden font-sans group shadow-2xs hover:shadow-md ${
        isCanvasStudio
          ? 'border-purple-200 hover:border-purple-300 bg-gradient-to-r from-purple-50/30 via-white to-white'
          : isPending
          ? 'border-amber-300/90 bg-gradient-to-r from-amber-50/35 via-white to-white'
          : isPrinting
          ? 'border-indigo-300 bg-gradient-to-r from-indigo-50/35 via-white to-white ring-1 ring-indigo-500/20'
          : isPrinted
          ? 'border-slate-200/90 bg-white hover:border-emerald-300'
          : isRejected
          ? 'border-rose-200 bg-rose-50/20'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Left Color-Coded Indicator Stripe */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          isCanvasStudio
            ? 'bg-gradient-to-b from-violet-600 via-purple-600 to-fuchsia-600'
            : isPending
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

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pl-1.5">
        {/* Column 1: Customer Info, Token & Contact */}
        <div className="flex items-start sm:items-center gap-3 w-full lg:w-[240px] shrink-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 shadow-xs select-none ${
              isCanvasStudio
                ? 'bg-gradient-to-tr from-violet-600 via-purple-600 to-fuchsia-600 ring-2 ring-purple-400/30'
                : isPending
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

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="font-extrabold text-xs sm:text-sm text-slate-900 truncate max-w-[160px] sm:max-w-[200px]"
                title={order.customer_name?.trim() || 'Walk-in Customer'}
              >
                {order.customer_name?.trim() || 'Walk-in'}
              </span>

              <button
                type="button"
                onClick={(e) => onCopyOrderNumber(order.order_number, e)}
                className="font-mono text-[10px] font-extrabold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-1.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1 cursor-pointer shrink-0 transition-colors active:scale-95 select-none"
                title="Click to copy order number"
              >
                <span>{order.order_number}</span>
                {copiedOrderId === order.order_number ? (
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                ) : (
                  <Copy className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                )}
              </button>
            </div>

            <div className="text-[10px] text-slate-400 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span>{formatDate(order.created_at)}</span>
              {order.customer_phone && (
                <a
                  href={`tel:${order.customer_phone}`}
                  className="text-indigo-600 font-bold hover:underline flex items-center gap-0.5"
                >
                  <Phone className="w-2.5 h-2.5" />
                  <span>{order.customer_phone}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Document, Canvas Studio Origin & Full Specification Chips */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 px-0 lg:px-3">
          {/* Top Line: File Name & Studio Origin */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border uppercase shrink-0 shadow-2xs ${fileBadge.color}`}>
              {fileBadge.ext}
            </span>

            <span
              className="font-extrabold text-slate-900 text-xs sm:text-[13px] break-all sm:break-normal max-w-full"
              title={order.file_name}
            >
              {order.file_name}
            </span>

            {/* Canvas Studio Highlight Badge */}
            {isCanvasStudio && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-xs tracking-wide shrink-0">
                <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
                <span>Canvas Studio</span>
              </span>
            )}
          </div>

          {/* Specification Chips Bar (Auto-Wrapping: No Overlaps, No Hidden Text) */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] select-none">
            <span className="px-2 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0">
              {order.paper_size}
            </span>

            <span className="px-2 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0 flex items-center gap-1">
              {order.color_mode === 'COLOR' ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-pink-500 via-amber-400 to-cyan-400 shrink-0" />
                  <span>Color</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                  <span>B&W</span>
                </>
              )}
            </span>

            <span className="px-2 py-0.5 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0">
              {order.print_sides === 'DOUBLE' ? '🔄 2-Sided' : '📄 1-Sided'}
            </span>

            <span
              className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] shrink-0 shadow-2xs"
              title={`${order.page_count} pages × ${order.copies} copies = ${totalPages} total prints`}
            >
              {order.page_count} {order.page_count === 1 ? 'page' : 'pages'} × {order.copies} {order.copies === 1 ? 'copy' : 'copies'} ({totalPages} prints)
            </span>

            {order.add_ons?.spiralBinding && (
              <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-extrabold text-[10px] shrink-0 border border-indigo-200">
                📚 Spiral Binding
              </span>
            )}
            {order.add_ons?.hardBinding && (
              <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-800 font-extrabold text-[10px] shrink-0 border border-purple-200">
                📕 Hard Bound
              </span>
            )}
            {order.add_ons?.lamination && (
              <span className="px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-800 font-extrabold text-[10px] shrink-0 border border-cyan-200">
                🛡️ Lamination
              </span>
            )}
            {order.add_ons?.stapling && (
              <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-[10px] shrink-0 border border-amber-200">
                📎 Stapled
              </span>
            )}
          </div>

          {/* Customer Notes (Full Text Without Overlap) */}
          {order.customer_notes && (
            <div className="flex items-start gap-1.5 text-xs text-amber-950 bg-amber-50/90 border border-amber-300/80 p-2 rounded-xl font-medium shadow-2xs mt-0.5">
              <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="font-extrabold text-[10px] uppercase text-amber-800 mr-1.5">Note:</span>
                <span className="font-semibold break-words">{order.customer_notes}</span>
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Amount & Status */}
        <div className="w-full lg:w-[130px] shrink-0 flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-1 select-none pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div className="text-left lg:text-right">
            <span className="text-xs text-slate-400 block lg:hidden font-bold">Total Amount</span>
            <div className="text-sm sm:text-base font-black text-slate-900">
              {formatCurrency(order.total_amount)}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span
              className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${
                order.payment_method === 'UPI'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {order.payment_method}
            </span>

            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                isPending
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : isPrinting
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  : isPrinted
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-rose-100 text-rose-800 border-rose-200'
              }`}
            >
              {order.order_status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Column 4: Action Buttons */}
        <div className="w-full lg:w-[150px] shrink-0 flex items-center justify-end gap-1.5 select-none pt-1 lg:pt-0">
          {/* Pending Cash Verification Actions */}
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
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center gap-1 shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{actionLoadingKey === `${order.id}_ACCEPT` ? '...' : 'Verify'}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRejectCash(order.id);
                }}
                disabled={actionLoadingKey === `${order.id}_REJECT`}
                title="Reject cash order"
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 font-extrabold text-[11px] flex items-center gap-0.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <X className="w-3 h-3" />
                <span>Reject</span>
              </button>
            </>
          )}

          {/* Order Details & Audit History Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectOrderForHistory(order as Order);
            }}
            title="View full order details, specifications & history"
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center gap-1.5 border border-indigo-200/80 transition-all cursor-pointer active:scale-95 shadow-2xs hover:shadow-xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          {/* Delete Order Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteOrder(order.id);
            }}
            disabled={actionLoadingKey === `${order.id}_DELETE`}
            title="Delete order from history"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}, areOrderRowPropsEqual);
