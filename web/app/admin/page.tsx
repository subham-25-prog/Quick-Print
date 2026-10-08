'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue, useTransition } from 'react';
import { startPolling } from '@/lib/polling';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { Order, OrderStatus, PricingConfig } from '@/types';
import { useInitialPricing } from '@/lib/initial-pricing';
import { formatCurrency, formatDate, isCanvasStudioOrder } from '@/lib/utils';
import {
  Printer,
  CheckCircle2,
  RefreshCw,
  FileText,
  AlertCircle,
  Inbox,
  Search,
  Phone,
  MessageSquare,
  Layers,
  RotateCcw,
  X,
  Trash2,
  Play,
  Sparkles,
  Copy,
  Check,
  Clock,
  ExternalLink,
} from '@/components/ui/Icons';
import { OrderRow } from '@/components/admin/OrderRow';

export default function AdminLiveOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>(useInitialPricing());
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'CURRENT' | 'PENDING' | 'PRINTING' | 'COMPLETED' | 'CANVAS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [, startFilterTransition] = useTransition();

  const handleFilterChange = useCallback((newFilter: 'ALL' | 'CURRENT' | 'PENDING' | 'PRINTING' | 'COMPLETED' | 'CANVAS') => {
    startFilterTransition(() => {
      setFilter(newFilter);
    });
  }, []);

  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  const [isClearing, setIsClearing] = useState(false);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<Order | null>(null);

  const cashRequest = useRef(false);
  const ordersRequest = useRef<AbortController | null>(null);

  // Set of IDs deleted locally so background polls never resurrect them
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;
    const polling = startPolling({
      intervalMs: 4000,
      poll: async (signal) => {
        const response = await fetch('/api/admin/db-status', { signal });
        if (!response.ok) throw new Error('Could not refresh agent status');
        const data = await response.json();
        if (!stopped && !signal.aborted) setAgentOnline(Boolean(data.agentOnline));
      },
      onError: () => { if (!stopped) setAgentOnline(false); },
    });
    return () => { stopped = true; polling.stop(); };
  }, []);

  useEffect(() => () => { ordersRequest.current?.abort(); }, []);

  const handleStartAgent = () => {
    window.location.href = 'quickprint://start';
    showToast('Starting Print Agent...', 'success');
  };

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  const fetchOrders = useCallback(async (isManual = false) => {
    if (ordersRequest.current) return;
    const controller = new AbortController();
    ordersRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store', signal: controller.signal });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok || !Array.isArray(data.orders)) throw new Error(data.error || 'Could not refresh orders');
      if (Array.isArray(data.orders)) {
        // Strip out any locally purged orders so background polls never resurrect them
        const freshOrders = data.orders.filter((o: Order) => !deletedOrderIdsRef.current.has(o.id));
        setOrders(freshOrders);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      if (isManual) showToast('Failed to refresh live orders', 'error');
    } finally {
      clearTimeout(timeout);
      if (ordersRequest.current === controller) ordersRequest.current = null;
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, [showToast]);

  const copyOrderNumber = useCallback((orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderNumber);
    setCopiedOrderId(orderNumber);
    showToast(`Copied order #${orderNumber} to clipboard!`, 'success');
    setTimeout(() => {
      setCopiedOrderId(null);
    }, 2000);
  }, [showToast]);

  const handleConfirmClear = async () => {
    const previousOrders = [...orders];
    const targetOrders = orders;
    const targetCount = targetOrders.length;
    const targetIds = targetOrders.map((o) => o.id);

    // 0ms instant local purge: mark IDs deleted & close modal immediately
    targetIds.forEach((id) => deletedOrderIdsRef.current.add(id));
    setShowClearModal(false);
    setActionLoadingKey('CLEAR_HISTORY');
    setIsClearing(true);

    setOrders([]);
    showToast(`Cleared ${targetCount} order(s) from history.`, 'success');

    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLEAR_HISTORY', scope: 'ALL' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear history');
      await fetchOrders();
    } catch (err: any) {
      // Revert state if failed
      targetIds.forEach((id) => deletedOrderIdsRef.current.delete(id));
      setOrders(previousOrders);
      showToast(err.message || 'Could not clear history.', 'error');
    } finally {
      setIsClearing(false);
      setActionLoadingKey(null);
    }
  };

  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (!window.confirm('Are you sure you want to remove this order from history?')) {
      return;
    }

    // 0ms instant local purge
    deletedOrderIdsRef.current.add(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    showToast('Order removed from history.', 'success');

    try {
      setActionLoadingKey(`${orderId}_DELETE`);
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_ORDER', orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete order');
      await fetchOrders();
    } catch (err: any) {
      // Revert state if failed
      deletedOrderIdsRef.current.delete(orderId);
      await fetchOrders();
      showToast(err.message || 'Could not delete order.', 'error');
    } finally {
      setActionLoadingKey(null);
    }
  }, [fetchOrders, showToast]);

  const handleAcceptCash = useCallback(async (orderId: string) => {
    if (cashRequest.current) return;
    cashRequest.current = true;
    setActionLoadingKey(`${orderId}_ACCEPT`);

    try {
      const res = await fetch('/api/admin/cash-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'ACCEPT' }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify cash payment');

      // Re-broadcast with newly assigned orderId if present
      if (data.orderId && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const ch = new BroadcastChannel('quickprint_order_events');
          ch.postMessage({ type: 'ORDER_VERIFIED', orderId, newOrderId: data.orderId });
          ch.close();
        } catch {}
      }

      setSelectedOrderForHistory(null);
      showToast('Cash verified. Order queued for printing.', 'success');
      void fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to verify cash', 'error');
    } finally {
      cashRequest.current = false;
      setActionLoadingKey(null);
    }
  }, [fetchOrders, showToast]);

  const handleRejectCash = useCallback(async (orderId: string) => {
    if (!window.confirm('Are you sure you want to reject this order?')) return;
    setActionLoadingKey(`${orderId}_REJECT`);
    try {
      const res = await fetch('/api/admin/cash-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'REJECT' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject order');

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, payment_status: 'REJECTED', order_status: 'REJECTED' as OrderStatus }
            : o
        )
      );
      if (selectedOrderForHistory && selectedOrderForHistory.id === orderId) {
        setSelectedOrderForHistory((prev) =>
          prev ? { ...prev, payment_status: 'REJECTED', order_status: 'REJECTED' as OrderStatus } : null
        );
      }
      showToast('Order marked as rejected.', 'success');
      await fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject order', 'error');
    } finally {
      setActionLoadingKey(null);
    }
  }, [fetchOrders, selectedOrderForHistory, showToast]);

  // Load cached orders and pricing on mount
  useEffect(() => {
    try {
      localStorage.removeItem('qp_admin_cached_orders');
    } catch (e) {}

    fetch('/api/admin/pricing')
      .then((res) => res.json())
      .then((data) => {
        if (data.pricing) setPricing(data.pricing);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!actionLoadingKey && !isClearing) void fetchOrders();
    const interval = setInterval(() => {
      // Background poll only if no mutation action is currently in-flight
      if (!actionLoadingKey && !isClearing) {
        fetchOrders();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchOrders, actionLoadingKey, isClearing]);

  // Counts for tabs
  const currentOrdersCount = useMemo(
    () => orders.filter((o) => !['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(o.order_status)).length,
    [orders]
  );
  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.order_status === 'PAYMENT_VERIFICATION_PENDING' || o.order_status === 'PENDING_PAYMENT').length,
    [orders]
  );
  const printingOrdersCount = useMemo(
    () => orders.filter((o) => o.order_status === 'APPROVED' || o.order_status === 'PRINTING').length,
    [orders]
  );
  const completedOrdersCount = useMemo(
    () => orders.filter((o) => ['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(o.order_status)).length,
    [orders]
  );
  const canvasOrdersCount = useMemo(
    () => orders.filter((o) => isCanvasStudioOrder(o)).length,
    [orders]
  );

  // Filtered and searched orders (Newest orders sorted at the top)
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        // 1. Status Filter
        let matchesFilter = true;
        if (filter === 'CURRENT') {
          matchesFilter = !['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(order.order_status);
        } else if (filter === 'PENDING') {
          matchesFilter = order.order_status === 'PAYMENT_VERIFICATION_PENDING' || order.order_status === 'PENDING_PAYMENT';
        } else if (filter === 'PRINTING') {
          matchesFilter = order.order_status === 'APPROVED' || order.order_status === 'PRINTING';
        } else if (filter === 'COMPLETED') {
          matchesFilter = ['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(order.order_status);
        } else if (filter === 'CANVAS') {
          matchesFilter = isCanvasStudioOrder(order);
        }

        if (!matchesFilter) return false;

        // 2. Search Query Filter (Concurrent non-blocking search at 120 FPS)
        if (deferredSearchQuery.trim()) {
          const query = deferredSearchQuery.toLowerCase().trim();
          const nameMatch = (order.customer_name || '').toLowerCase().includes(query);
          const orderNumMatch = (order.order_number || '').toLowerCase().includes(query);
          const phoneMatch = (order.customer_phone || '').toLowerCase().includes(query);
          const fileMatch = (order.file_name || '').toLowerCase().includes(query);
          const noteMatch = (order.customer_notes || '').toLowerCase().includes(query);
          const isCanvas = isCanvasStudioOrder(order);
          const canvasMatch = isCanvas && (query.includes('canva') || query.includes('canvas') || query.includes('studio'));
          return nameMatch || orderNumMatch || phoneMatch || fileMatch || noteMatch || canvasMatch;
        }

        return true;
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [orders, filter, deferredSearchQuery]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col font-sans pb-24">
      <AdminHeader shopName={pricing.shop_name} />

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
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
                  <span>Orders & History</span>
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
                View current live orders and browse completed customer order histories
              </p>
            </div>

            {/* Quick Status Count Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleFilterChange('CURRENT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  filter === 'CURRENT'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{currentOrdersCount} Current Orders</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('COMPLETED')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  filter === 'COMPLETED'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{completedOrdersCount} Order History</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('CANVAS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  filter === 'CANVAS'
                    ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white border-purple-600 shadow-sm'
                    : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{canvasOrdersCount} Canvas Studio</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('ALL')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  filter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>{orders.length} Total</span>
              </button>
            </div>
          </div>

          {/* Interactive Toolbar: Search Box, Filter Pills & Sync Button */}
          <div className="flex flex-col lg:flex-row flex-wrap items-stretch lg:items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px] sm:min-w-[320px] max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, order #, phone, or file..."
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
                  onClick={() => handleFilterChange('CURRENT')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'CURRENT'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Current Orders</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'CURRENT' ? 'bg-indigo-100 text-indigo-800 font-extrabold' : 'bg-slate-200 text-slate-600'}`}>
                    {currentOrdersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFilterChange('COMPLETED')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'COMPLETED'
                      ? 'bg-white text-emerald-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Order History</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 font-extrabold' : 'bg-slate-200 text-slate-600'}`}>
                    {completedOrdersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFilterChange('ALL')}
                  className={`px-3 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    filter === 'ALL'
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>All</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>
                    {orders.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFilterChange('PENDING')}
                  className={`px-2.5 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1 text-[11px] ${
                    filter === 'PENDING'
                      ? 'bg-white text-amber-700 font-bold shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>Pending ({pendingOrdersCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFilterChange('PRINTING')}
                  className={`px-2.5 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1 text-[11px] ${
                    filter === 'PRINTING'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>Printing ({printingOrdersCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFilterChange('CANVAS')}
                  className={`px-2.5 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1 text-[11px] ${
                    filter === 'CANVAS'
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold shadow-xs'
                      : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>Canvas Studio ({canvasOrdersCount})</span>
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

              {/* Start Print Agent Button */}
              {agentOnline ? (
                <div
                  title="Windows Print Agent is running and connected"
                  className="px-3.5 py-2 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Agent Online</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartAgent}
                  title="Click to launch Print Agent on this PC (quickprint://start)"
                  className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm hover:shadow-indigo-500/25"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Print Agent</span>
                </button>
              )}

              {/* Single Consolidated Clear History Button */}
              <button
                type="button"
                onClick={() => {
                  if (orders.length === 0) {
                    showToast('No orders in history to clear.', 'error');
                    return;
                  }

                  setShowClearModal(true);
                }}
                disabled={isRefreshing || isClearing}
                title="Clear order history"
                className="px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border-rose-200 shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Clear History</span>
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
              <div className="hidden lg:flex items-center justify-between px-4 py-2 bg-slate-100/80 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 border border-slate-200/70">
                <div className="w-[240px]">Customer & Order Token</div>
                <div className="flex-1 px-3">Document, Canvas Origin & Specifications</div>
                <div className="w-[130px] text-right">Amount & Status</div>
                <div className="w-[150px] text-right">Actions</div>
              </div>

              {filteredOrders.map((rawOrder) => (
                <OrderRow
                  key={rawOrder.id}
                  rawOrder={rawOrder}
                  copiedOrderId={copiedOrderId}
                  actionLoadingKey={actionLoadingKey}
                  onCopyOrderNumber={copyOrderNumber}
                  onAcceptCash={handleAcceptCash}
                  onRejectCash={handleRejectCash}
                  onDeleteOrder={handleDeleteOrder}
                  onSelectOrderForHistory={setSelectedOrderForHistory}
                />
              ))}
            </div>
          )}
        </section>

        {/* Developer Attribution */}
        <DeveloperBadge className="mt-2 pb-4" />
      </main>

      {/* Clear History Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-slate-900">Delete All Orders</h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will permanently delete all {orders.length} order(s) and uploaded document files.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isClearing && setShowClearModal(false)}
                disabled={isClearing}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Orders Summary to be deleted */}
            <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex items-center justify-between">
              <div className="text-xs">
                <span className="font-extrabold text-slate-900 block">Total Orders To Delete</span>
                <span className="text-[11px] text-slate-500 font-medium">All active and completed orders will be purged</span>
              </div>
              <span className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-black shadow-xs">
                {orders.length} Orders
              </span>
            </div>

            {/* Warning Note */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-800 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>This action cannot be undone. Files in cloud storage will also be deleted.</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearing || orders.length === 0}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete All Orders</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order History & Details Modal */}
      {selectedOrderForHistory && (() => {
        const isCanvasStudio = isCanvasStudioOrder(selectedOrderForHistory);
        const totalPages = (selectedOrderForHistory.page_count || 1) * (selectedOrderForHistory.copies || 1);
        const isPending = selectedOrderForHistory.order_status === 'PAYMENT_VERIFICATION_PENDING' || selectedOrderForHistory.order_status === 'PENDING_PAYMENT';
        const isPrinted = selectedOrderForHistory.order_status === 'PRINTED' || selectedOrderForHistory.order_status === 'SUBMITTED';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl sm:max-w-3xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto font-sans">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-xs ${
                      isCanvasStudio
                        ? 'bg-gradient-to-tr from-violet-600 via-purple-600 to-fuchsia-600'
                        : 'bg-indigo-600'
                    }`}
                  >
                    {isCanvasStudio ? <Sparkles className="w-5 h-5 text-amber-200" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        Order Details & History
                      </h3>
                      <button
                        type="button"
                        onClick={(e) => copyOrderNumber(selectedOrderForHistory.order_number, e)}
                        className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                        title="Click to copy order number"
                      >
                        <span>{selectedOrderForHistory.order_number}</span>
                        {copiedOrderId === selectedOrderForHistory.order_number ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      Placed on {formatDate(selectedOrderForHistory.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                      isPending
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : isPrinted
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : selectedOrderForHistory.order_status === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                        : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    }`}
                  >
                    {selectedOrderForHistory.order_status.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForHistory(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Canvas Studio Highlight Banner */}
              {isCanvasStudio && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-purple-200/90 shadow-2xs space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-purple-600 to-fuchsia-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Sparkles className="w-5 h-5 text-amber-200 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-purple-950">
                            Generated by Canvas Studio
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-2xs">
                            Studio Layout
                          </span>
                        </div>
                        <p className="text-xs text-purple-800/80 font-medium mt-0.5">
                          This document was custom-composed and rendered using QuickPrint Canvas Studio.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/90 border border-purple-100 shadow-2xs">
                      <span className="text-[10px] font-bold text-purple-600 block uppercase">Design Type</span>
                      <span className="font-extrabold text-slate-800">Multi-Image Canvas</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/90 border border-purple-100 shadow-2xs">
                      <span className="text-[10px] font-bold text-purple-600 block uppercase">Canvas Pages</span>
                      <span className="font-extrabold text-slate-800">
                        {selectedOrderForHistory.page_count} Custom Page{selectedOrderForHistory.page_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/90 border border-purple-100 shadow-2xs col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-bold text-purple-600 block uppercase">Authored Sheet</span>
                      <span className="font-extrabold text-slate-800">
                        {selectedOrderForHistory.paper_size} Printable Layout
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Information Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Customer Information
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="font-extrabold text-slate-900 text-sm">
                      {selectedOrderForHistory.customer_name?.trim() || 'Walk-in Customer'}
                    </span>
                  </div>
                  {selectedOrderForHistory.customer_phone ? (
                    <a
                      href={`tel:${selectedOrderForHistory.customer_phone}`}
                      className="text-indigo-600 font-extrabold hover:underline flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200/80"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{selectedOrderForHistory.customer_phone}</span>
                    </a>
                  ) : (
                    <span className="text-slate-400 text-xs">No phone number provided</span>
                  )}
                </div>

                {/* Customer Notes (Full, Non-Overlapping Callout) */}
                {selectedOrderForHistory.customer_notes && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5 mt-2">
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-900 uppercase tracking-wider">
                      <MessageSquare className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Customer Special Instructions & Notes</span>
                    </div>
                    <p className="font-semibold text-xs text-amber-950 whitespace-pre-wrap leading-relaxed pl-5">
                      {selectedOrderForHistory.customer_notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Print & Document Specifications Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Print & Document Specifications
                  </div>

                  {/* Direct Document View/Download Link */}
                  <a
                    href={`/api/orders/${selectedOrderForHistory.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
                    title="Open original document in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Document</span>
                  </a>
                </div>

                {/* Document Name */}
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Document File</span>
                    <span className="font-extrabold text-slate-900 text-xs sm:text-sm break-all">
                      {selectedOrderForHistory.file_name}
                    </span>
                  </div>
                </div>

                {/* 4-Box Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Paper Size</span>
                    <span className="font-extrabold text-slate-900 text-xs mt-0.5 block">
                      📄 {selectedOrderForHistory.paper_size}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Color Mode</span>
                    <span className="font-extrabold text-slate-900 text-xs mt-0.5 block">
                      {selectedOrderForHistory.color_mode === 'COLOR' ? '🎨 Full Color' : '⚪ B&W Mono'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Print Sides</span>
                    <span className="font-extrabold text-slate-900 text-xs mt-0.5 block">
                      {selectedOrderForHistory.print_sides === 'DOUBLE' ? '🔄 2-Sided (Duplex)' : '📄 1-Sided (Simplex)'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Volume Calc</span>
                    <span className="font-extrabold text-indigo-700 text-xs mt-0.5 block">
                      {selectedOrderForHistory.page_count} pgs × {selectedOrderForHistory.copies} cps = {totalPages} total
                    </span>
                  </div>
                </div>

                {/* Add-ons & Bindings */}
                {(selectedOrderForHistory.add_ons?.spiralBinding ||
                  selectedOrderForHistory.add_ons?.hardBinding ||
                  selectedOrderForHistory.add_ons?.lamination ||
                  selectedOrderForHistory.add_ons?.stapling) && (
                  <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Add-ons:</span>
                    {selectedOrderForHistory.add_ons?.spiralBinding && (
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-extrabold text-xs border border-indigo-200">
                        📚 Spiral Binding
                      </span>
                    )}
                    {selectedOrderForHistory.add_ons?.hardBinding && (
                      <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 font-extrabold text-xs border border-purple-200">
                        📕 Hard Bound
                      </span>
                    )}
                    {selectedOrderForHistory.add_ons?.lamination && (
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-100 text-cyan-800 font-extrabold text-xs border border-cyan-200">
                        🛡️ Lamination
                      </span>
                    )}
                    {selectedOrderForHistory.add_ons?.stapling && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs border border-amber-200">
                        📎 Stapled
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Financial & Payment History Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                  <span>Payment & Financial Summary</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md font-extrabold text-[10px] border ${
                      selectedOrderForHistory.payment_status === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}
                  >
                    {selectedOrderForHistory.payment_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Payment Method</div>
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 mt-0.5">
                      {selectedOrderForHistory.payment_method === 'CASH' ? '💵 Cash at Counter' : '⚡ UPI Online'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 font-medium">Per Page Rate</div>
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 mt-0.5">
                      {formatCurrency(selectedOrderForHistory.per_page_rate || 0)} / page
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-left sm:text-right">
                    <div className="text-xs text-slate-500 font-medium">Grand Total</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900">
                      {formatCurrency(selectedOrderForHistory.total_amount)}
                    </div>
                  </div>
                </div>

                {selectedOrderForHistory.transaction_ref && (
                  <div className="pt-2 border-t border-slate-200/60 text-xs flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Transaction Reference:</span>
                    <span className="font-mono text-slate-700 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      {selectedOrderForHistory.transaction_ref}
                    </span>
                  </div>
                )}
              </div>

              {/* Order Lifecycle Progress / Audit Timeline */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Order Lifecycle & History Milestones
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Order Placed</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {formatDate(selectedOrderForHistory.created_at)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs">
                    <div className="flex items-center gap-1.5 text-indigo-600 font-bold">
                      {isCanvasStudio ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="text-purple-700">Canvas Studio</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>File Upload</span>
                        </>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {isCanvasStudio ? 'Authored in Studio' : 'Direct Upload'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs">
                    <div className={`flex items-center gap-1.5 font-bold ${
                      selectedOrderForHistory.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Payment</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {selectedOrderForHistory.payment_status} ({selectedOrderForHistory.payment_method})
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-xs">
                    <div className={`flex items-center gap-1.5 font-bold ${
                      isPrinted ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-indigo-600'
                    }`}>
                      <Printer className="w-3.5 h-3.5 shrink-0" />
                      <span>Print Status</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      {selectedOrderForHistory.order_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Bar inside Modal */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedOrderForHistory.id;
                    setSelectedOrderForHistory(null);
                    handleDeleteOrder(id);
                  }}
                  className="px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border border-rose-200/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete From History</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/orders/${selectedOrderForHistory.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </a>

                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleRejectCash(selectedOrderForHistory.id);
                        }}
                        disabled={actionLoadingKey === `${selectedOrderForHistory.id}_REJECT`}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleAcceptCash(selectedOrderForHistory.id);
                        }}
                        disabled={actionLoadingKey === `${selectedOrderForHistory.id}_ACCEPT`}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{actionLoadingKey === `${selectedOrderForHistory.id}_ACCEPT` ? 'Verifying...' : 'Verify Cash & Print'}</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedOrderForHistory(null)}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

