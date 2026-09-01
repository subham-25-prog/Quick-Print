'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { Order, OrderStatus, PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Eye,
  RefreshCw,
  FileText,
  CreditCard,
  Banknote,
  ShieldCheck,
  AlertCircle,
  Inbox,
  Sparkles,
  Search,
  Copy,
  Check,
  Phone,
  MessageSquare,
  Layers,
  Zap,
  RotateCcw,
  X,
  Tag,
} from '@/components/ui/Icons';

export default function AdminLiveOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'PRINTING' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const copyOrderNumber = (orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderNumber);
    setCopiedOrderId(orderNumber);
    showToast(`Copied order #${orderNumber} to clipboard!`, 'success');
    setTimeout(() => {
      setCopiedOrderId(null);
    }, 2000);
  };

  // Load cached orders and pricing on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('qp_admin_cached_orders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrders(parsed);
          setLoading(false);
        }
      }
    } catch (e) {}

    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setPricing(data.pricing);
      })
      .catch(() => {});
  }, []);

  const fetchOrders = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        setOrders((prevOrders) => {
          const map = new Map<string, Order>();

          // 1. Load from localStorage cache first
          try {
            const cached = localStorage.getItem('qp_admin_cached_orders');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) {
                for (const o of parsed) {
                  if (o && o.id) map.set(o.id, o);
                }
              }
            }
          } catch (e) {}

          // 2. Add current state orders
          for (const o of prevOrders) {
            if (o && o.id) map.set(o.id, o);
          }

          // Status weight helper: never allow polling to revert higher status back to lower status
          const getStatusWeight = (st?: string) => {
            if (!st) return 0;
            if (['PRINTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(st)) return 3;
            if (['APPROVED', 'PRINTING'].includes(st)) return 2;
            return 1;
          };

          // 3. Merge server response orders intelligently
          for (const s of data.orders) {
            if (s && s.id) {
              const existing = map.get(s.id);
              if (!existing || getStatusWeight(s.order_status) >= getStatusWeight(existing.order_status)) {
                map.set(s.id, s);
              }
            }
          }

          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          try {
            localStorage.setItem('qp_admin_cached_orders', JSON.stringify(merged));
          } catch (e) {}

          return merged;
        });
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      if (isManual) showToast('Failed to refresh live orders', 'error');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => {
      // Background poll only if no button action is currently in-flight
      if (!actionLoadingKey) {
        fetchOrders();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchOrders, actionLoadingKey]);

  const handleOrderAction = async (
    orderId: string,
    action: 'APPROVE_PRINT' | 'REJECT' | 'VERIFY_PAYMENT' | 'MARK_PRINTED' | 'RETRY_PRINT'
  ) => {
    const actionKey = `${orderId}_${action}`;
    setActionLoadingKey(actionKey);

    // Save previous snapshot for rollback if needed
    const previousOrders = [...orders];

    // OPTIMISTIC UPDATE: Update local state instantly (0ms latency)
    setOrders((currentOrders) =>
      currentOrders.map((order) => {
        if (order.id !== orderId) return order;

        if (action === 'APPROVE_PRINT' || action === 'RETRY_PRINT') {
          return {
            ...order,
            order_status: 'APPROVED' as OrderStatus,
            payment_status: 'VERIFIED' as const,
            approved_at: new Date().toISOString(),
          };
        } else if (action === 'REJECT') {
          return {
            ...order,
            order_status: 'REJECTED' as OrderStatus,
            payment_status: 'REJECTED' as const,
          };
        } else if (action === 'MARK_PRINTED') {
          return {
            ...order,
            order_status: 'PRINTED' as OrderStatus,
            payment_status: 'VERIFIED' as const,
            printed_at: new Date().toISOString(),
          };
        } else if (action === 'VERIFY_PAYMENT') {
          return {
            ...order,
            payment_status: 'VERIFIED' as const,
          };
        }
        return order;
      })
    );

    if (action === 'APPROVE_PRINT') {
      showToast('Payment verified & Print job spooled to agent!', 'success');
    } else if (action === 'MARK_PRINTED') {
      showToast('Order marked as Completed!', 'success');
    } else if (action === 'REJECT') {
      showToast('Order marked as Rejected', 'success');
    }

    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });

      const data = await res.json();

      if (res.ok && data.order) {
        // Merge the server-confirmed order object directly
        setOrders((currentOrders) => {
          const updated = currentOrders.map((o) => (o.id === orderId ? { ...o, ...data.order } : o));
          try {
            localStorage.setItem('qp_admin_cached_orders', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      } else {
        throw new Error(data.error || 'Server rejected action');
      }
    } catch (err) {
      console.error('Action error:', err);
      // Rollback to previous state
      setOrders(previousOrders);
      try {
        localStorage.setItem('qp_admin_cached_orders', JSON.stringify(previousOrders));
      } catch (e) {}
      showToast(err instanceof Error ? err.message : 'Action failed. Reverted.', 'error');
    } finally {
      setActionLoadingKey(null);
    }
  };

  // Counts for tabs
  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.order_status === 'PAYMENT_VERIFICATION_PENDING' || o.order_status === 'PENDING_PAYMENT').length,
    [orders]
  );
  const printingOrdersCount = useMemo(
    () => orders.filter((o) => o.order_status === 'APPROVED' || o.order_status === 'PRINTING').length,
    [orders]
  );
  const completedOrdersCount = useMemo(
    () => orders.filter((o) => ['PRINTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(o.order_status)).length,
    [orders]
  );

  // Filtered and searched orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Status Filter
      let matchesFilter = true;
      if (filter === 'PENDING') {
        matchesFilter = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
      } else if (filter === 'PRINTING') {
        matchesFilter = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
      } else if (filter === 'COMPLETED') {
        matchesFilter = ['PRINTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(order.order_status);
      }

      if (!matchesFilter) return false;

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (order.customer_name || '').toLowerCase().includes(query);
        const orderNumMatch = (order.order_number || '').toLowerCase().includes(query);
        const phoneMatch = (order.customer_phone || '').toLowerCase().includes(query);
        const fileMatch = (order.file_name || '').toLowerCase().includes(query);
        const noteMatch = (order.customer_notes || '').toLowerCase().includes(query);
        return nameMatch || orderNumMatch || phoneMatch || fileMatch || noteMatch;
      }

      return true;
    });
  }, [orders, filter, searchQuery]);

  // Helper for initials
  const getInitials = (name?: string) => {
    if (!name || !name.trim()) return 'QP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Helper to extract file extension
  const getFileBadge = (fileName?: string) => {
    if (!fileName) return { ext: 'FILE', color: 'bg-slate-100 text-slate-700' };
    const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
    if (ext === 'PDF') return { ext, color: 'bg-rose-100 text-rose-700 border-rose-200' };
    if (['DOC', 'DOCX'].includes(ext)) return { ext, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (['JPG', 'JPEG', 'PNG'].includes(ext)) return { ext, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    return { ext, color: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col font-sans pb-24">
      <AdminHeader onOpenPricing={() => setIsPricingModalOpen(true)} />

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-3 backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-slate-900/95 text-white border-slate-700 shadow-emerald-500/10'
                : 'bg-rose-600/95 text-white border-rose-500 shadow-rose-500/20'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Decorated Live Order Stream Container */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xl shadow-slate-200/50 space-y-6 relative overflow-hidden">
          {/* Subtle Ambient Decorative Gradient Header Glow */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

          {/* Section Header: Title, Live Status & Summary Badges */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2.5">
                  <span>Live Order Stream</span>
                </h2>
                
                {/* Glowing Live Radar Indicator */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>LIVE QUEUE</span>
                </span>

                {/* Real-time sync interval pill */}
                <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/60 hidden sm:inline-block">
                  Auto-sync: 3s
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Incoming print requests from customer mobile scans with instant spooling
              </p>
            </div>

            {/* Quick Status Count Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {pendingOrdersCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{pendingOrdersCount} Awaiting Action</span>
                </div>
              )}
              {printingOrdersCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200">
                  <Printer className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{printingOrdersCount} Printing</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>{orders.length} Total Submissions</span>
              </div>
            </div>
          </div>

          {/* Interactive Toolbar: Search Box, Filter Pills & Sync Button */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, #order, phone, or file..."
                className="w-full pl-10 pr-9 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills & Sync Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'ALL'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>All</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'ALL' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
                    {orders.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'PENDING'
                      ? 'bg-white text-amber-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Pending</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'PENDING' ? 'bg-amber-100 text-amber-800 font-extrabold' : 'bg-slate-200 text-slate-600'}`}>
                    {pendingOrdersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('PRINTING')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'PRINTING'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Printing</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'PRINTING' ? 'bg-indigo-100 text-indigo-800 font-extrabold' : 'bg-slate-200 text-slate-600'}`}>
                    {printingOrdersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('COMPLETED')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'COMPLETED'
                      ? 'bg-white text-emerald-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Order History</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {completedOrdersCount}
                  </span>
                </button>
              </div>

              {/* Sync Button */}
              <button
                type="button"
                onClick={() => fetchOrders(true)}
                disabled={isRefreshing}
                title="Sync queue now"
                className="px-3.5 py-2 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs hover:shadow-xs disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
              </button>
            </div>
          </div>

          {/* Orders Stream Grid or Empty States */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 shadow-sm animate-pulse">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Connecting to live queue...</h4>
              <p className="text-xs text-slate-400">Loading incoming submissions in real-time</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-slate-50/60 rounded-3xl border border-dashed border-slate-200">
              <div className="w-14 h-14 rounded-3xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400 shadow-xs">
                <Inbox className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                {searchQuery ? 'No matching orders found' : 'No orders in this view'}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No order records matched "${searchQuery}". Try searching by order number or customer name.`
                  : 'Customers scanning your store QR poster will appear in this stream instantly.'}
              </p>
              {(searchQuery || filter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilter('ALL');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer transition-all active:scale-95"
                >
                  <RotateCcw className="w-3 h-3 text-slate-500" />
                  <span>Reset filters</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {filteredOrders.map((order) => {
                const isPending = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
                const isPrinting = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
                const isPrinted = order.order_status === 'PRINTED';
                const isRejected = order.order_status === 'REJECTED';

                const isApproving = actionLoadingKey === `${order.id}_APPROVE_PRINT`;
                const isRejecting = actionLoadingKey === `${order.id}_REJECT`;
                const isCompleting = actionLoadingKey === `${order.id}_MARK_PRINTED`;
                const isRetrying = actionLoadingKey === `${order.id}_RETRY_PRINT`;

                const fileBadge = getFileBadge(order.file_name);
                const initials = getInitials(order.customer_name);
                const totalPages = (order.page_count || 1) * (order.copies || 1);

                return (
                  <div
                    key={order.id}
                    className={`rounded-3xl p-5 sm:p-6 border transition-all duration-200 space-y-4 relative overflow-hidden group hover:shadow-lg ${
                      isPending
                        ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/40 via-white to-white hover:border-amber-400 shadow-xs'
                        : isPrinting
                        ? 'border-indigo-300 bg-gradient-to-b from-indigo-50/40 via-white to-white ring-2 ring-indigo-500/15 shadow-sm'
                        : isPrinted
                        ? 'border-emerald-200/90 bg-gradient-to-b from-emerald-50/25 via-white to-white hover:border-emerald-300'
                        : isRejected
                        ? 'border-rose-200 bg-gradient-to-b from-rose-50/25 via-white to-white opacity-85'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Top Status Accent Bar */}
                    <div
                      className={`absolute top-0 inset-x-0 h-1.5 ${
                        isPending
                          ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                          : isPrinting
                          ? 'bg-gradient-to-r from-indigo-500 to-blue-500 animate-pulse'
                          : isPrinted
                          ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                          : isRejected
                          ? 'bg-rose-400'
                          : 'bg-slate-300'
                      }`}
                    />

                    {/* Header: Avatar, Customer Name, Order Token & Total Amount */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Customer Avatar Initials */}
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shrink-0 shadow-xs ${
                            isPending
                              ? 'bg-gradient-to-tr from-amber-500 to-orange-500'
                              : isPrinting
                              ? 'bg-gradient-to-tr from-indigo-600 to-blue-500'
                              : isPrinted
                              ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                              : 'bg-gradient-to-tr from-slate-600 to-slate-800'
                          }`}
                        >
                          {initials}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-base text-slate-900 truncate">
                              {order.customer_name?.trim() || 'Walk-in Customer'}
                            </span>

                            {/* Order Number Badge with One-click Copy */}
                            <button
                              type="button"
                              onClick={(e) => copyOrderNumber(order.order_number, e)}
                              className="font-mono text-xs font-extrabold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-0.5 rounded-lg border border-slate-200 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                              title="Click to copy order #"
                            >
                              <span>{order.order_number}</span>
                              {copiedOrderId === order.order_number ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-50" />
                              )}
                            </button>
                          </div>

                          {/* Customer Phone & Timestamp */}
                          <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2.5">
                            <span className="flex items-center gap-1 text-slate-500 font-medium">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{formatDate(order.created_at)}</span>
                            </span>

                            {order.customer_phone && (
                              <a
                                href={`tel:${order.customer_phone}`}
                                className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 hover:underline bg-indigo-50/70 px-1.5 py-0.5 rounded-md border border-indigo-100"
                                title="Call customer"
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>{order.customer_phone}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Status Badge */}
                      <div className="text-right shrink-0">
                        <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                          {formatCurrency(order.total_amount)}
                        </div>

                        <div className="flex flex-col items-end gap-1 mt-1">
                          {/* Payment Method Badge */}
                          {order.payment_method === 'UPI' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <CreditCard className="w-3 h-3" />
                              <span>UPI DIRECT</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Banknote className="w-3 h-3" />
                              <span>CASH</span>
                            </span>
                          )}

                          {/* Order Status Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide inline-flex items-center gap-1 ${
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
                      </div>
                    </div>

                    {/* Document Details & Configuration Inner Card */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-3">
                      {/* Document Name Row */}
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black border uppercase shrink-0 ${fileBadge.color}`}>
                            {fileBadge.ext}
                          </span>
                          <span className="font-bold text-slate-800 truncate" title={order.file_name}>
                            {order.file_name}
                          </span>
                        </div>

                        {/* Page Count Total */}
                        <div className="text-slate-600 font-bold text-xs shrink-0 bg-white px-2.5 py-1 rounded-xl border border-slate-200/70 shadow-2xs">
                          {order.page_count}p × {order.copies} = <span className="text-indigo-600 font-extrabold">{totalPages} pages</span>
                        </div>
                      </div>

                      {/* Print Settings Tag Badges */}
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-700">
                        {/* Paper Size */}
                        <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-2xs">
                          📐 {order.paper_size}
                        </span>

                        {/* Color Mode */}
                        <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-2xs flex items-center gap-1">
                          {order.color_mode === 'COLOR' ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-pink-500 via-amber-400 to-cyan-400" />
                              <span>Color Print</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-slate-800" />
                              <span>Black & White</span>
                            </>
                          )}
                        </span>

                        {/* Print Sides */}
                        <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-2xs">
                          {order.print_sides === 'DOUBLE' ? '🔄 Back-to-Back (Duplex)' : '📄 Single-Sided'}
                        </span>

                        {/* Add-ons: Spiral Binding */}
                        {order.add_ons?.spiralBinding && (
                          <span className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                            📚 Spiral Binding
                          </span>
                        )}

                        {/* Add-ons: Hard Binding */}
                        {order.add_ons?.hardBinding && (
                          <span className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
                            📕 HardBound
                          </span>
                        )}
                      </div>

                      {/* Customer Note Callout */}
                      {order.customer_notes && (
                        <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 font-medium flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-bold text-[11px] uppercase tracking-wider text-amber-800 block">
                              Customer Instruction:
                            </span>
                            <p className="italic">"{order.customer_notes}"</p>
                          </div>
                        </div>
                      )}

                      {/* UPI Reference Callout */}
                      {order.transaction_ref && (
                        <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 font-medium flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-indigo-700">⚡ UPI UTR / Ref:</span>
                            <span className="font-mono font-bold text-indigo-950">{order.transaction_ref}</span>
                          </div>
                          <span className="text-[10px] bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded-full">Proof Submitted</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Toolbar */}
                    <div className="flex items-center gap-2 pt-1">
                      {/* PENDING ACTIONS */}
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOrderAction(order.id, 'APPROVE_PRINT')}
                            disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                            className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            {isApproving ? (
                              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Printer className="w-4 h-4" />
                            )}
                            <span>Verify & Spool Print</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOrderAction(order.id, 'REJECT')}
                            disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                            className="py-2.5 px-3.5 rounded-2xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs hover:shadow-xs"
                          >
                            {isRejecting ? (
                              <div className="w-4 h-4 border-2 border-rose-500/40 border-t-rose-600 rounded-full animate-spin" />
                            ) : (
                              <span>Reject</span>
                            )}
                          </button>
                        </>
                      )}

                      {/* PRINTING ACTIONS */}
                      {isPrinting && (
                        <button
                          type="button"
                          onClick={() => handleOrderAction(order.id, 'MARK_PRINTED')}
                          disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                          className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isCompleting ? (
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Mark as Completed</span>
                        </button>
                      )}

                      {/* REJECTED ACTIONS */}
                      {isRejected && (
                        <button
                          type="button"
                          onClick={() => handleOrderAction(order.id, 'RETRY_PRINT')}
                          disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                          className="flex-1 py-2.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isRetrying ? (
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          <span>Re-approve & Print</span>
                        </button>
                      )}

                      {/* COMPLETED ACTIONS */}
                      {isPrinted && (
                        <button
                          type="button"
                          onClick={() => handleOrderAction(order.id, 'RETRY_PRINT')}
                          disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                          className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
                          title="Reprint Document"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Reprint</span>
                        </button>
                      )}

                      {/* Download Document Button */}
                      <a
                        href={`/api/orders/${order.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-3.5 rounded-2xl bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs hover:shadow-xs"
                        title="Download Original Document"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Download</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

