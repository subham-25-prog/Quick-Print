'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Order } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Printer,
  FileText,
  ChevronRight,
  Trash2,
  RefreshCw,
  X,
  History,
  AlertCircle
} from '@/components/ui/Icons';

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({ isOpen, onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Load orders from localStorage on open
  useEffect(() => {
    if (!isOpen) return;

    const loadOrders = () => {
      try {
        const raw = localStorage.getItem('quickprint_customer_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Sort newest first
            const sorted = parsed.sort(
              (a: Order, b: Order) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setOrders(sorted);
          }
        }
      } catch (err) {
        console.error('Failed to load customer order history:', err);
      }
    };

    loadOrders();
  }, [isOpen]);

  // Sync latest status for stored orders from API
  const refreshHistory = async () => {
    if (orders.length === 0) return;
    setRefreshing(true);

    try {
      const updatedOrders: Order[] = [...orders];
      for (let i = 0; i < updatedOrders.length; i++) {
        try {
          const res = await fetch(`/api/orders/${updatedOrders[i].id}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data.order) {
              updatedOrders[i] = data.order;
            }
          }
        } catch {}
      }

      setOrders(updatedOrders);
      localStorage.setItem('quickprint_customer_orders', JSON.stringify(updatedOrders));
    } catch (err) {
      console.error('Failed to refresh order history:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear your local order history? This will only remove past orders from this browser.')) {
      localStorage.removeItem('quickprint_customer_orders');
      setOrders([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop overlay click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">My Order History</h3>
              <p className="text-[11px] text-slate-400 font-medium">Track all your print requests</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {orders.length > 0 && (
              <button
                type="button"
                onClick={refreshHistory}
                disabled={refreshing}
                title="Refresh order status"
                className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Orders List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {orders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shadow-xs">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">No Orders Yet</h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Orders placed from this device will be automatically saved here so you can track live status.
                </p>
              </div>
            </div>
          ) : (
            orders.map((order) => {
              const isPending = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
              const isPrinting = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
              const isPrinted = order.order_status === 'PRINTED';
              const isRejected = order.order_status === 'REJECTED';

              return (
                <Link
                  key={order.id}
                  href={`/status/${order.id}`}
                  onClick={onClose}
                  className="block p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all space-y-2.5 group"
                >
                  {/* Top Row: Order # & Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                      {order.order_number}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                        isPending
                          ? 'bg-amber-100 text-amber-800'
                          : isPrinting
                          ? 'bg-indigo-100 text-indigo-800 animate-pulse'
                          : isPrinted
                          ? 'bg-emerald-100 text-emerald-800'
                          : isRejected
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isPending && <Clock className="w-2.5 h-2.5" />}
                      {isPrinting && <Printer className="w-2.5 h-2.5" />}
                      {isPrinted && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {isRejected && <XCircle className="w-2.5 h-2.5" />}
                      <span>{order.order_status.replace(/_/g, ' ')}</span>
                    </span>
                  </div>

                  {/* Document & Options Info */}
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                      {order.file_name}
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {order.paper_size} • {order.color_mode === 'COLOR' ? 'Color' : 'B&W'} • {order.page_count}p ({order.copies} {order.copies === 1 ? 'copy' : 'copies'})
                    </p>
                  </div>

                  {/* Footer Row: Date & Amount */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[10px] font-medium text-slate-400">
                      {formatDate(order.created_at)}
                    </span>
                    <div className="flex items-center gap-1 font-black text-slate-900">
                      <span>{formatCurrency(order.total_amount)}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        {orders.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">
              {orders.length} {orders.length === 1 ? 'Order Saved' : 'Orders Saved'}
            </span>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Local History</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
