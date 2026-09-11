'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { Order, OrderStatus, PricingConfig } from '@/types';
import { defaultPricingConfig } from '@/lib/config';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
Printer,
CheckCircle2,Clock,RefreshCw,
FileText,AlertCircle,
Inbox,Search,
Copy,
Check,
Phone,
MessageSquare,
Layers,RotateCcw,
X,Trash2,
Play
} from '@/components/ui/Icons';

export default function AdminLiveOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricingConfig);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'CURRENT' | 'PENDING' | 'PRINTING' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState<'COMPLETED' | 'ALL'>('COMPLETED');
  const [isClearing, setIsClearing] = useState(false);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<Order | null>(null);

  // Set of IDs deleted locally so background polls never resurrect them
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;
    const checkAgent = () => {
      fetch('/api/admin/db-status')
        .then((r) => r.json())
        .then((d) => {
          if (!stopped) setAgentOnline(Boolean(d.agentOnline));
        })
        .catch(() => {
          if (!stopped) setAgentOnline(false);
        });
    };
    checkAgent();
    const interval = setInterval(checkAgent, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  const handleStartAgent = () => {
    window.location.href = 'quickprint://start';
    setShowAgentModal(true);
  };

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

  const handleConfirmClear = async () => {
    const previousOrders = [...orders];
    const targetOrders = clearScope === 'ALL'
      ? orders
      : orders.filter((o) => ['PRINTED', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(o.order_status));
    const targetCount = targetOrders.length;
    const targetIds = targetOrders.map((o) => o.id);

    // 0ms instant local purge: mark IDs deleted & close modal immediately
    targetIds.forEach((id) => deletedOrderIdsRef.current.add(id));
    setShowClearModal(false);
    setActionLoadingKey('CLEAR_HISTORY');
    setIsClearing(true);

    if (clearScope === 'ALL') {
      setOrders([]);
    } else {
      setOrders((prev) =>
        prev.filter((o) => !deletedOrderIdsRef.current.has(o.id))
      );
    }
    showToast(`Cleared ${targetCount} order(s) from history.`, 'success');

    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLEAR_HISTORY', scope: clearScope }),
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

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to remove this order from history?')) {
      return;
    }

    // 0ms instant local purge
    deletedOrderIdsRef.current.add(orderId);
    const previousOrders = [...orders];
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
      setOrders(previousOrders);
      showToast(err.message || 'Could not delete order.', 'error');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handleAcceptCash = async (orderId: string) => {
    setActionLoadingKey(`${orderId}_ACCEPT`);
    try {
      const res = await fetch('/api/admin/cash-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'ACCEPT' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify cash payment');

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, payment_status: 'PAID', order_status: 'PRINTING' as OrderStatus }
            : o
        )
      );
      if (selectedOrderForHistory && selectedOrderForHistory.id === orderId) {
        setSelectedOrderForHistory((prev) =>
          prev ? { ...prev, payment_status: 'PAID', order_status: 'PRINTING' as OrderStatus } : null
        );
      }
      showToast('Cash verified! Spooling to printer...', 'success');
      await fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to verify cash', 'error');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handleRejectCash = async (orderId: string) => {
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
  };

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

  const fetchOrders = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        // Strip out any locally purged orders so background polls never resurrect them
        const freshOrders = data.orders.filter((o: Order) => !deletedOrderIdsRef.current.has(o.id));
        setOrders(freshOrders);
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
      <AdminHeader shopName={pricing.shop_name} />

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
                onClick={() => setFilter('CURRENT')}
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
                onClick={() => setFilter('COMPLETED')}
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
                onClick={() => setFilter('ALL')}
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
                  onClick={() => setFilter('CURRENT')}
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
                  onClick={() => setFilter('COMPLETED')}
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
                  onClick={() => setFilter('ALL')}
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
                  onClick={() => setFilter('PENDING')}
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
                  onClick={() => setFilter('PRINTING')}
                  className={`px-2.5 py-1.5 rounded-xl transition-all duration-100 active:scale-95 cursor-pointer flex items-center gap-1 text-[11px] ${
                    filter === 'PRINTING'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>Printing ({printingOrdersCount})</span>
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
                  setClearScope(completedOrdersCount > 0 ? 'COMPLETED' : 'ALL');
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
              <div className="hidden md:flex items-center justify-between px-4 py-2 bg-slate-100/80 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 border border-slate-200/70 min-w-[760px]">
                <div className="w-[220px]">Customer & Token</div>
                <div className="flex-1 px-2">Document & Specs</div>
                <div className="w-[130px] text-right">Amount & Status</div>
                <div className="w-[150px] text-right">Action</div>
              </div>

              {filteredOrders.map((rawOrder) => {
                const order = {
                  ...rawOrder,
                  id: String(rawOrder.id || (rawOrder as any).orderId || (rawOrder as any).order_id || ''),
                  order_number: String(rawOrder.order_number || (rawOrder as any).orderNumber || (rawOrder as any).order_id || rawOrder.id || 'QP-0000'),
                  customer_name: rawOrder.customer_name || (rawOrder as any).customerName || (rawOrder as any).name || undefined,
                  customer_phone: rawOrder.customer_phone || (rawOrder as any).customerPhone || (rawOrder as any).phone || undefined,
                  file_name: String(rawOrder.file_name || (rawOrder as any).fileName || (rawOrder as any).filename || 'document.pdf'),
                  paper_size: String(rawOrder.paper_size || (rawOrder as any).paperSize || 'A4'),
                  color_mode: String(rawOrder.color_mode || (rawOrder as any).colorMode || 'BW'),
                  print_sides: String(rawOrder.print_sides || (rawOrder as any).printSides || 'SINGLE'),
                  page_count: Math.max(1, parseInt(String(rawOrder.page_count ?? (rawOrder as any).pageCount ?? 1), 10) || 1),
                  copies: Math.max(1, parseInt(String(rawOrder.copies ?? 1), 10) || 1),
                  total_amount: Number(rawOrder.total_amount ?? (rawOrder as any).totalAmount ?? (rawOrder as any).total_price ?? 0),
                  payment_method: String(rawOrder.payment_method || (rawOrder as any).paymentMethod || 'UPI'),
                  created_at: String(rawOrder.created_at || (rawOrder as any).createdAt || (rawOrder as any).timestamp || ''),
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

                      <div className="flex items-center gap-1.5">
                        {/* Pending Cash / Verification Action Buttons */}
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptCash(order.id);
                              }}
                              disabled={actionLoadingKey === `${order.id}_ACCEPT`}
                              title="Verify cash payment and start printing"
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{actionLoadingKey === `${order.id}_ACCEPT` ? 'Accepting...' : 'Accept & Print'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRejectCash(order.id);
                              }}
                              disabled={actionLoadingKey === `${order.id}_REJECT`}
                              title="Reject cash order"
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 font-extrabold text-[11px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
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
                            setSelectedOrderForHistory(order as Order);
                          }}
                          title="View order history & specifications"
                          className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center gap-1 border border-indigo-200/80 transition-all cursor-pointer"
                        >
                          <Clock className="w-3 h-3" />
                          <span>History</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(order.id);
                          }}
                          disabled={actionLoadingKey === `${order.id}_DELETE`}
                          title="Delete order from history"
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Developer Attribution */}
        <DeveloperBadge variant="inline" className="mt-2 pb-4" />
      </main>

      {/* Clear History Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-slate-900">Clear Order History</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose which records to remove. This permanently deletes the order details and uploaded document files.
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

            {/* Scope Selection Options */}
            <div className="space-y-2.5">
              <label
                onClick={() => setClearScope('COMPLETED')}
                className={`flex items-start gap-3 p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                  clearScope === 'COMPLETED'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="clearScope"
                  checked={clearScope === 'COMPLETED'}
                  onChange={() => setClearScope('COMPLETED')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Completed History Only</span>
                    <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                      {completedOrdersCount} orders
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 text-[11px]">
                    Removes printed, cancelled, and failed orders. Keeps active and pending print jobs intact.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setClearScope('ALL')}
                className={`flex items-start gap-3 p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                  clearScope === 'ALL'
                    ? 'border-rose-600 bg-rose-50/50 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="clearScope"
                  checked={clearScope === 'ALL'}
                  onChange={() => setClearScope('ALL')}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Clear All Orders & History</span>
                    <span className="px-2 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold">
                      {orders.length} orders
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 text-[11px]">
                    Completely purges all orders and queues. Fresh clean slate for the store.
                  </p>
                </div>
              </label>
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
                disabled={isClearing || (clearScope === 'COMPLETED' && completedOrdersCount === 0 && orders.length > 0)}
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
                    <span>Yes, Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Agent Launcher Info Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-slate-900">Starting Print Agent…</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your browser was instructed to open the QuickPrint Agent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>1. Allow Browser Prompt</span>
                </p>
                <p className="text-slate-500 text-[11px]">
                  If your browser shows a popup asking to open <strong>QuickPrint</strong> or <strong>command line</strong>, click <strong>Open</strong> or <strong>Allow</strong>.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 space-y-1">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>2. First time on this computer?</span>
                </p>
                <p className="text-amber-800 text-[11px]">
                  Run <code className="bg-amber-100 px-1 py-0.2 rounded font-mono font-bold">register_protocol.bat</code> in the <code className="bg-amber-100 px-1 py-0.2 rounded font-mono font-bold">print-agent</code> folder once to enable 1-click launching from the website.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = 'quickprint://start';
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order History & Details Modal */}
      {selectedOrderForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      Order Details & History
                    </h3>
                    <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                      {selectedOrderForHistory.order_number}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Placed on {formatDate(selectedOrderForHistory.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForHistory(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customer Details */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Customer Information
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  {selectedOrderForHistory.customer_name?.trim() || 'Walk-in Customer'}
                </span>
                {selectedOrderForHistory.customer_phone ? (
                  <a
                    href={`tel:${selectedOrderForHistory.customer_phone}`}
                    className="text-indigo-600 font-extrabold hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{selectedOrderForHistory.customer_phone}</span>
                  </a>
                ) : (
                  <span className="text-slate-400 text-[11px]">No phone number</span>
                )}
              </div>
              {selectedOrderForHistory.customer_notes && (
                <div className="pt-1.5 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-start gap-1.5">
                  <MessageSquare className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  <span className="italic font-medium">"{selectedOrderForHistory.customer_notes}"</span>
                </div>
              )}
            </div>

            {/* Print & Document Specs */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Print & Document Specifications
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Document Name</span>
                  <span className="font-bold text-slate-800 truncate block" title={selectedOrderForHistory.file_name}>
                    {selectedOrderForHistory.file_name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Pages & Copies</span>
                  <span className="font-bold text-indigo-700">
                    {selectedOrderForHistory.page_count} pages × {selectedOrderForHistory.copies} copies ={' '}
                    {(selectedOrderForHistory.page_count || 1) * (selectedOrderForHistory.copies || 1)} total
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Paper & Color</span>
                  <span className="font-bold text-slate-800">
                    {selectedOrderForHistory.paper_size} • {selectedOrderForHistory.color_mode === 'COLOR' ? 'Color' : 'Black & White'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Sides (Duplex)</span>
                  <span className="font-bold text-slate-800">
                    {selectedOrderForHistory.print_sides === 'DOUBLE' ? '2-Sided (Duplex)' : '1-Sided (Simplex)'}
                  </span>
                </div>
              </div>
              {(selectedOrderForHistory.add_ons?.spiralBinding || selectedOrderForHistory.add_ons?.hardBinding) && (
                <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold">Add-ons:</span>
                  {selectedOrderForHistory.add_ons?.spiralBinding && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                      Spiral Binding
                    </span>
                  )}
                  {selectedOrderForHistory.add_ons?.hardBinding && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                      Hard Binding
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Financial & Payment History */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                <span>Payment & Verification</span>
                <span className={`px-2 py-0.2 rounded-md font-extrabold text-[9px] ${
                  selectedOrderForHistory.payment_status === 'PAID'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedOrderForHistory.payment_status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Method</div>
                  <div className="font-extrabold text-xs text-slate-800">
                    {selectedOrderForHistory.payment_method === 'CASH' ? '💵 Cash at Counter' : '⚡ UPI Online'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-medium">Total Amount</div>
                  <div className="text-base font-black text-slate-900">
                    {formatCurrency(selectedOrderForHistory.total_amount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar inside Modal */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const id = selectedOrderForHistory.id;
                  setSelectedOrderForHistory(null);
                  handleDeleteOrder(id);
                }}
                className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                {['PAYMENT_VERIFICATION_PENDING', 'PENDING_PAYMENT'].includes(selectedOrderForHistory.order_status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        handleRejectCash(selectedOrderForHistory.id);
                      }}
                      disabled={actionLoadingKey === `${selectedOrderForHistory.id}_REJECT`}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
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
                      <span>Accept Cash & Print</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrderForHistory(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

