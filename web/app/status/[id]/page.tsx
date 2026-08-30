'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { OrderStatusTimeline } from '@/components/customer/OrderStatusTimeline';
import { Order } from '@/types';
import { formatCurrency, formatDate, formatBytes } from '@/lib/utils';
import {
  FileText,
  Printer,
  CheckCircle2,
  Clock,
  Smartphone,
  Banknote,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check
} from '@/components/ui/Icons';

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [upiLink, setUpiLink] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [payeeName, setPayeeName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Order not found');
      const data = await res.json();
      setOrder(data.order);
      if (data.upiLink) setUpiLink(data.upiLink);
      if (data.upiId) setUpiId(data.upiId);
      if (data.payeeName) setPayeeName(data.payeeName);
    } catch (err) {
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll for status changes every 3 seconds while order is not completed/rejected
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(() => {
      if (order && !['PRINTED', 'REJECTED', 'CANCELLED'].includes(order.order_status)) {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [orderId, order?.order_status]);

  const copyOrderNumber = () => {
    if (order?.order_number) {
      navigator.clipboard.writeText(order.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading order status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col">
        <Header />
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Order Not Found</h2>
          <p className="text-xs text-slate-400">
            The order could not be located. Please verify your order link or create a new order.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header />

      <main className="max-w-xl mx-auto px-4 py-6 sm:py-10 flex-1 w-full space-y-6">
        {/* Order Number Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
            <span>Order Number</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-wider font-mono">
              {order.order_number}
            </h2>
            <button
              onClick={copyOrderNumber}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy Order ID"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Show this order number to the shopkeeper at the counter
          </p>
        </div>

        {/* Live Status Timeline */}
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-bold text-sm text-slate-200">Live Status</h3>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Updates
            </span>
          </div>

          <OrderStatusTimeline
            orderStatus={order.order_status}
            paymentMethod={order.payment_method}
            paymentStatus={order.payment_status}
            rejectionReason={order.rejection_reason}
            failureReason={order.failure_reason}
          />
        </div>

        {/* Payment reminder if pending */}
        {order.order_status === 'PAYMENT_VERIFICATION_PENDING' && order.payment_method === 'UPI' && upiLink && (
          <div className="p-5 rounded-3xl bg-indigo-500/10 border border-indigo-500/25 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-indigo-300">UPI Payment Pending Verification</span>
              <span className="font-bold text-white text-sm">{formatCurrency(order.total_amount)}</span>
            </div>
            <p className="text-slate-300">
              Haven't paid yet? Tap below to open your UPI app and pay {formatCurrency(order.total_amount)}:
            </p>
            <a
              href={upiLink}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all"
            >
              <Smartphone className="w-4 h-4" />
              <span>Pay {formatCurrency(order.total_amount)} via UPI</span>
            </a>
          </div>
        )}

        {/* Document & Order Summary */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3 text-xs">
          <h4 className="font-semibold text-slate-300">Order Summary</h4>
          <div className="space-y-1.5 text-slate-400">
            <div className="flex justify-between">
              <span>File:</span>
              <span className="font-medium text-slate-200 truncate max-w-[200px]">{order.file_name}</span>
            </div>
            <div className="flex justify-between">
              <span>Pages & Copies:</span>
              <span className="font-medium text-slate-200">
                {order.page_count} pages • {order.copies} {order.copies === 1 ? 'copy' : 'copies'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Print Type:</span>
              <span className="font-medium text-slate-200">
                {order.paper_size} • {order.color_mode === 'COLOR' ? 'Color' : 'B&W'} • {order.print_sides === 'DOUBLE' ? '2-Sided' : '1-Sided'}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 font-bold text-sm text-white">
              <span>Total Amount:</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="text-center pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Another Document</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
