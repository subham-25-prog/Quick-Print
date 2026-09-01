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

          // Deep stringify check: if fetched data is identical to current state, keep existing array identity to prevent DOM re-renders
          const currentJson = JSON.stringify(prevOrders);
          const mergedJson = JSON.stringify(merged);
          if (currentJson === mergedJson) {
            return prevOrders;
          }

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
    } else if (action === 'RETRY_PRINT') {
      showToast('Reprint requested! Job spooled to agent.', 'success');
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

  // Filtered and searched orders (Newest orders sorted at the top)
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
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
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
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
      <AdminHeader />

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
            <div className="space-y-2 overflow-x-auto pb-2">
              {/* Table Column Header for Desktop */}
              <div className="hidden md:flex items-center justify-between px-4 py-2 bg-slate-100/80 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 border border-slate-200/70 min-w-[760px]">
                <div className="w-[220px]">Customer & Token</div>
                <div className="flex-1 px-2">Document & Specs</div>
                <div className="w-[130px] text-right">Amount & Status</div>
                <div className="w-[150px] text-right">Action</div>
              </div>

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
                    className={`rounded-2xl py-3 px-4 border transition-all duration-150 flex items-center justify-between gap-3 bg-white shadow-2xs hover:shadow-md relative overflow-hidden min-w-[760px] font-sans group ${
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

                    {/* Column 1: Customer & Token (Strict 1 Line) */}
                    <div className="flex items-center gap-3 min-w-[210px] max-w-[240px] pl-1.5 shrink-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 shadow-xs ${
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
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {order.customer_name?.trim() || 'Walk-in'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => copyOrderNumber(order.order_number, e)}
                            className="font-mono text-[10px] font-extrabold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-1.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
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

                    {/* Column 2: Document & Specification Badges (Strict 1 Line) */}
                    <div className="flex-1 flex items-center gap-1.5 text-[11px] min-w-0 overflow-hidden whitespace-nowrap px-2">
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

                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] shrink-0 shadow-2xs">
                        {order.page_count}p × {order.copies} = {totalPages}p
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

                    {/* Column 3: Price, Payment Status & Action Buttons (Strictly Right Aligned) */}
                    <div className="flex items-center gap-3 shrink-0 whitespace-nowrap ml-auto">
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-slate-900">
                          {formatCurrency(order.total_amount)}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${order.payment_method === 'UPI' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
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

                      {/* Rightmost Action Button Toolbar */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOrderAction(order.id, 'APPROVE_PRINT');
                              }}
                              disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                              style={{ touchAction: 'manipulation' }}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer transition-all"
                            >
                              {isApproving ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                              <span>Verify & Print</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOrderAction(order.id, 'REJECT');
                              }}
                              disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                              style={{ touchAction: 'manipulation' }}
                              className="px-2.5 py-2 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs active:scale-95 disabled:opacity-50 cursor-pointer transition-all"
                            >
                              {isRejecting ? (
                                <div className="w-3.5 h-3.5 border-2 border-rose-500/40 border-t-rose-600 rounded-full animate-spin" />
                              ) : (
                                <span>Reject</span>
                              )}
                            </button>
                          </>
                        )}

                        {isPrinting && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOrderAction(order.id, 'MARK_PRINTED');
                            }}
                            disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                            style={{ touchAction: 'manipulation' }}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 disabled:opacity-50 cursor-pointer transition-all"
                          >
                            {isCompleting ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>Mark Completed</span>
                          </button>
                        )}

                        {(isPrinted || isRejected) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOrderAction(order.id, 'RETRY_PRINT');
                            }}
                            disabled={Boolean(actionLoadingKey && actionLoadingKey.startsWith(order.id))}
                            style={{ touchAction: 'manipulation' }}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer transition-all border border-slate-200/80 shadow-2xs"
                          >
                            {isRetrying ? (
                              <div className="w-3.5 h-3.5 border-2 border-slate-600/40 border-t-slate-800 rounded-full animate-spin" />
                            ) : (
                              <Printer className="w-3.5 h-3.5" />
                            )}
                            <span>Reprint</span>
                          </button>
                        )}
                      </div>
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

