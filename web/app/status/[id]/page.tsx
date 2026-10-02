'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Order } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  RefreshCw,
} from '@/components/ui/Icons';
import { LivePrintVisualizer } from '@/components/customer/LivePrintVisualizer';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { startPolling } from '@/lib/polling';
import { useShopName } from '@/lib/shop-sync';

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const token = search.get('access_token');
  const shopName = useShopName();

  const router = useRouter();

  const [data, setData] = useState<{
    order: Order;
    job: { status: string; submitted_at?: string };
    agentOnline: boolean;
  } | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOfflineCached, setIsOfflineCached] = useState(false);

  // Restore order state from local cache instantly (0ms latency / offline-first)
  useEffect(() => {
    if (!id) return;
    try {
      const cached = localStorage.getItem(`quickprint_cached_status_${id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.order?.id) {
          setData(parsed);
          setLoading(false);
          setIsOfflineCached(true);
        }
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    if (data?.order?.order_number && typeof document !== 'undefined') {
      document.title = `${shopName} – Order #${data.order.order_number}`;
    }
  }, [data?.order?.order_number, shopName]);

  useEffect(() => {
    setError('');
    if (!token) {
      setLoading(false);
      setError('This order link is missing an access token.');
      return;
    }
    let stopped = false;
    const polling = startPolling({
      intervalMs: 1000,
      poll: async (signal) => {
        const res = await fetch('/api/orders/' + id, {
          headers: { 'x-order-access-token': token },
          cache: 'no-store',
          signal,
        });
        const result = await res.json();
        if (stopped || signal.aborted) return false;
        if (!res.ok) {
          if ([401, 403, 404].includes(res.status)) {
            setLoading(false);
            setError(result.error || 'This order link is unavailable.');
            return false;
          }
          throw new Error(result.error || 'Order status is temporarily unavailable.');
        }
        if (!result?.order?.id) throw new Error('Order status is temporarily unavailable.');
        setData(result);
        setIsOfflineCached(false);
        setError('');
        setLoading(false);

        // Cache the verified status locally
        try {
          localStorage.setItem(`quickprint_cached_status_${id}`, JSON.stringify(result));
        } catch {}

        if (result.order.id !== id) {
          const nextToken = result.orderAccessToken || token;
          router.replace('/status/' + result.order.id + '?access_token=' + encodeURIComponent(nextToken));
          return false;
        }
        const done = ['PRINTED', 'SUBMITTED', 'FAILED', 'REVIEW', 'CANCELLED', 'REJECTED'];
        return done.includes(result.order.order_status) || done.includes(result.job?.status) ? 4000 : 1000;
      },
      onError: (error) => {
        if (!stopped) {
          setLoading(false);
          setError(error instanceof Error ? error.message : 'Connection interrupted. Retrying automatically.');
        }
      },
    });

    let channel: BroadcastChannel | undefined;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('quickprint_order_events');
        channel.onmessage = ({ data: event }) => {
          if (event && (!event.orderId || event.orderId === id || event.newOrderId === id)) polling.refresh();
        };
      }
    } catch {}

    return () => {
      stopped = true;
      polling.stop();
      channel?.close();
    };
  }, [id, token, router]);


  const isAwaitingVerification =
    data?.order?.payment_status === 'AWAITING_VERIFICATION' ||
    data?.order?.order_status === 'PAYMENT_VERIFICATION_PENDING' ||
    (data?.order?.payment_status === 'PENDING' && data?.order?.payment_method === 'CASH');

  const isPrinted =
    data?.order?.order_status === 'PRINTED' ||
    data?.order?.order_status === 'SUBMITTED' ||
    data?.job?.status === 'PRINTED' ||
    data?.job?.status === 'SUBMITTED';

  const isHardwarePrinting =
    !isPrinted &&
    (data?.order?.order_status === 'PRINTING' || data?.job?.status === 'PRINTING');

  const jobState = isAwaitingVerification
    ? 'AWAITING_VERIFICATION'
    : data?.job?.status ||
      (isPrinted
        ? 'PRINTED'
        : isHardwarePrinting
        ? 'PRINTING'
        : 'PENDING');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-16">
      <Header shopName={shopName} />

      <main className="max-w-xl mx-auto w-full px-4 pt-5 space-y-4 contain-layout">
        {/* Top Connectivity & Live Indicator */}
        <div className="flex items-center justify-between px-2 text-xs select-none">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isAwaitingVerification
                    ? 'bg-amber-400'
                    : isPrinted
                    ? 'bg-emerald-400'
                    : 'bg-indigo-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isAwaitingVerification
                    ? 'bg-amber-500'
                    : isPrinted
                    ? 'bg-emerald-500'
                    : 'bg-indigo-500'
                }`}
              />
            </span>
            <span className="font-semibold text-slate-700">
              {isAwaitingVerification
                ? 'Awaiting Cash Verification at Counter'
                : isPrinted
                ? 'Document Printed & Ready at Counter'
                : isHardwarePrinting
                ? 'Printing on Counter Hardware...'
                : data?.agentOnline
                ? 'Shop Printer Connected & Live'
                : 'Shop Agent Offline (Order Queued)'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {isOfflineCached ? 'Cached Offline' : 'Live Sync'}
          </span>
        </div>

        {/* Loading placeholder */}
        {loading && !data && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs text-center space-y-3 animate-pulse">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Loading verified order…</p>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3 animate-fade-in-up">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p className="text-xs text-amber-800 mt-0.5">{error} We are still checking; please do not pay again.</p>
            </div>
          </div>
        )}

        {data && (
          <>

            {/* Awaiting Cash Verification Card OR Live Animated 5-Step Print Status Pipeline */}
            {isAwaitingVerification ? (
              <section className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 rounded-3xl p-6 sm:p-7 text-white shadow-lg space-y-4 relative overflow-hidden animate-fade-in-scale">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider text-amber-100">
                      Awaiting Cash Verification
                    </span>
                  </div>
                  <span className="text-[11px] font-extrabold bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-full">
                    Pay at Counter
                  </span>
                </div>

                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                    Pay {formatCurrency(data.order.total_amount)} at the counter
                  </h2>
                  <p className="text-xs sm:text-sm text-amber-100 font-medium leading-relaxed">
                    Please visit the counter and show your order number. Once verified by the shopkeeper, printing starts automatically on this screen.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-black/15 backdrop-blur-xs flex items-center justify-between text-xs">
                  <span className="text-amber-100 font-medium flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    Listening live for verification...
                  </span>
                  <span className="font-mono font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-md">
                    {data.order.order_number}
                  </span>
                </div>
              </section>
            ) : (
              /* Live Print Visualizer includes all order specs, price, and copyable order token */
              <LivePrintVisualizer
                jobStatus={jobState}
                orderStatus={data.order.order_status}
                paymentStatus={data.order.payment_status}
                pageCount={data.order.page_count}
                copies={data.order.copies}
                fileName={data.order.file_name}

                shopName={shopName}
                orderNumber={data.order.order_number}
                paperSize={data.order.paper_size}
                colorMode={data.order.color_mode}
                totalAmount={data.order.total_amount}
                paymentMethod={data.order.payment_method}
                printSides={data.order.print_sides}
              />
            )}
          </>
        )}

        {/* Action Button: Print Another Document */}
        <Link
          href="/"
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-center font-bold text-sm shadow-md transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active-press select-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print Another Document</span>
        </Link>

        {/* Developer Attribution Card */}
        <DeveloperBadge className="mt-2" />
      </main>
    </div>
  );
}
