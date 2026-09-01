'use client';

import React, { useState } from 'react';
import { Order, OrderStatus } from '@/types';
import { formatCurrency, formatDate, formatBytes } from '@/lib/utils';
import {
  FileText,
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Smartphone,
  Banknote,
  RotateCcw,
  AlertCircle,
  Copy,
  Sparkles
} from '@/components/ui/Icons';

interface AdminOrderCardProps {
  order: Order;
  onAction: (orderId: string, action: string, reason?: string) => Promise<void>;
  onPreview: (order: Order) => void;
}

export const AdminOrderCard: React.FC<AdminOrderCardProps> = ({ order, onAction, onPreview }) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleActionClick = async (action: string) => {
    setLoadingAction(action);
    try {
      await onAction(order.id, action);
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING_PAYMENT':
      case 'PAYMENT_VERIFICATION_PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Verify Payment
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Printer className="w-3 h-3" />
            Ready in Spooler
          </span>
        );
      case 'PRINTING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 animate-pulse">
            <Printer className="w-3 h-3" />
            Printing Now
          </span>
        );
      case 'PRINTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Printed & Ready
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Print Failed
          </span>
        );
      case 'REJECTED':
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="w-3 h-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const activeAddOnsList = Object.entries(order.add_ons || {})
    .filter(([_, enabled]) => !!enabled)
    .map(([key]) => key);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 transition-all space-y-4">
      {/* Header Info */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-white tracking-wide">
              {order.customer_name?.trim() || `Customer (${order.order_number})`}
            </span>
            <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
              {order.order_number}
            </span>
            {getStatusBadge(order.order_status)}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <span>{formatDate(order.created_at)}</span>
            {order.customer_phone && (
              <span className="text-slate-300 font-medium">
                • 📞 {order.customer_phone}
              </span>
            )}
          </div>
        </div>

        {/* Amount & Payment Method */}
        <div className="text-right">
          <div className="text-lg sm:text-xl font-bold text-white">
            {formatCurrency(order.total_amount, order.currency === 'INR' ? '₹' : order.currency)}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400 mt-0.5">
            {order.payment_method === 'UPI' ? (
              <span className="inline-flex items-center gap-1 text-indigo-400 font-medium">
                <Smartphone className="w-3 h-3" /> UPI ({order.payment_status})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <Banknote className="w-3 h-3" /> CASH ({order.payment_status})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Document & Print Specs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Document Info */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-200 truncate">{order.file_name}</div>
              <div className="text-slate-400 text-[11px]">
                {order.page_count} pages • {formatBytes(order.file_size_bytes)}
              </div>
            </div>
          </div>
          <button
            onClick={() => onPreview(order)}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors ml-2 shrink-0"
            title="Preview or Download"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Specifications */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 space-y-1">
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Specs:</span>
            <span className="font-semibold text-slate-100">
              {order.paper_size} • {order.color_mode === 'COLOR' ? 'Color' : 'B&W'} • {order.print_sides === 'DOUBLE' ? '2-Sided' : '1-Sided'}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Copies:</span>
            <span className="font-semibold text-slate-100">{order.copies}</span>
          </div>
          {activeAddOnsList.length > 0 && (
            <div className="flex justify-between items-center text-indigo-300 text-[11px] pt-0.5">
              <span>Add-ons:</span>
              <span className="capitalize">{activeAddOnsList.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {order.customer_notes && (
        <div className="p-2.5 rounded-lg bg-slate-800/50 text-xs text-slate-300">
          <span className="text-slate-400 font-medium">Customer Note:</span> {order.customer_notes}
        </div>
      )}

      {order.advanced_config && (
        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800/50 text-xs text-red-200 space-y-1">
          <div className="flex items-center justify-between font-bold text-[11px] text-red-400">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 bg-red-600 text-white rounded text-[9px] font-black flex items-center justify-center">PDF</span>
              <span>Adobe Advanced Print Options</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">{order.advanced_config.pagesPerSheet}-Up Layout</span>
          </div>
          <div className="text-[11px] text-slate-300 font-mono flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
            <span>Range: <strong>{order.advanced_config.pageRangeMode === 'RANGE' ? order.advanced_config.customPageRange : order.advanced_config.pageRangeMode}</strong></span>
            <span>Scaling: <strong>{order.advanced_config.pageScaling} ({order.advanced_config.customScalePercent}%)</strong></span>
            <span>Orient: <strong>{order.advanced_config.orientation}</strong></span>
            {order.advanced_config.watermark && order.advanced_config.watermark !== 'NONE' && (
              <span className="text-rose-400 font-bold">Watermark: {order.advanced_config.watermark}</span>
            )}
          </div>
        </div>
      )}

      {order.transaction_ref && (
        <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-800/60 text-xs text-indigo-200 flex items-center justify-between">
          <span><strong className="text-white">⚡ UPI Ref / UTR:</strong> <span className="font-mono text-indigo-300 font-bold">{order.transaction_ref}</span></span>
          <span className="text-[10px] bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full font-bold">Proof Submitted</span>
        </div>
      )}

      {order.failure_reason && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{order.failure_reason}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
        {/* Approve & Print Button */}
        {['PAYMENT_VERIFICATION_PENDING', 'PENDING_PAYMENT'].includes(order.order_status) && (
          <>
            <button
              onClick={() => handleActionClick('REJECT')}
              disabled={!!loadingAction}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => handleActionClick('APPROVE_PRINT')}
              disabled={!!loadingAction}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:opacity-95 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Verify & Approve Print</span>
            </button>
          </>
        )}

        {order.order_status === 'APPROVED' && (
          <div className="text-xs text-indigo-300 font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Queued for Print Agent...</span>
          </div>
        )}

        {order.order_status === 'PRINTING' && (
          <button
            onClick={() => handleActionClick('MARK_PRINTED')}
            disabled={!!loadingAction}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          >
            Mark as Printed
          </button>
        )}

        {order.order_status === 'FAILED' && (
          <button
            onClick={() => handleActionClick('RETRY_PRINT')}
            disabled={!!loadingAction}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Print</span>
          </button>
        )}
      </div>
    </div>
  );
};
