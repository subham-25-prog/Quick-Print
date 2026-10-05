'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Order } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  FileText,
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
  } | null>(() => {
    if (typeof window === 'undefined' || !id) return null;
    try {
      const cached = localStorage.getItem(`quickprint_cached_status_${id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.order?.id) return parsed;
      }
    } catch {}
    return null;
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => !data);
  const [copied, setCopied] = useState(false);
  const [isOfflineCached, setIsOfflineCached] = useState(() => Boolean(data));

  const copyOrderId = useCallback(async () => {
    if (!data?.order?.order_number) return;
    try {
      await navigator.clipboard.writeText(data.order.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy. Please select and copy the order number manually.');
    }
  }, [data?.order?.order_number]);

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
    <div className="min-h-screen spidey-bg text-slate-100 flex flex-col font-sans pb-16 selection:bg-red-600 selection:text-white">
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
                    : 'bg-red-500'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isAwaitingVerification
                    ? 'bg-amber-500'
                    : isPrinted
                    ? 'bg-emerald-500'
                    : 'bg-red-600'
                }`}
              />
            </span>
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <span>🕷️</span>
              <span>
                {isAwaitingVerification
                  ? 'Awaiting Cash Verification at Counter'
                  : isPrinted
                  ? 'Superhero Prints Ready at Counter Tray'
                  : isHardwarePrinting
                  ? 'Printing Live on Counter Hardware...'
                  : data?.agentOnline
                  ? 'Spider-Printer Connected & Live'
                  : 'Printer Offline (Order Spooled in Web)'}
              </span>
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isOfflineCached ? 'Cached Offline' : 'Live Sync'}
          </span>
        </div>

        {/* Loading placeholder */}
        {loading && !data && (
          <div className="spidey-card rounded-3xl p-8 text-center space-y-3 animate-pulse text-white">
            <RefreshCw className="w-8 h-8 animate-spin text-red-500 mx-auto" />
            <p className="text-sm font-black text-white">Spider-spooling your verified order…</p>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-sm flex items-start gap-3 animate-fade-in-up">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p className="text-xs text-amber-300 mt-0.5">{error} We are still checking; please do not pay again.</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Awaiting Cash Verification Card OR Live Animated 5-Step Print Status Pipeline */}
            {isAwaitingVerification ? (
              <>
                <section className="bg-gradient-to-br from-red-600 via-rose-700 to-blue-900 rounded-3xl p-6 sm:p-7 text-white shadow-xl shadow-red-950/60 border-2 border-red-500/40 space-y-4 relative overflow-hidden animate-fade-in-scale">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                        🕷️ Spider Cash Verification
                      </span>
                    </div>
                    <span className="text-[11px] font-black bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/20 uppercase">
                      Pay at Counter
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                      Pay {formatCurrency(data.order.total_amount)} at the counter
                    </h2>
                    <p className="text-xs sm:text-sm text-red-100 font-medium leading-relaxed">
                      Show your order number to the shopkeeper. Once verified, printing starts automatically on this screen.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/30 backdrop-blur-xs flex items-center justify-between text-xs border border-white/10">
                    <span className="text-amber-200 font-medium flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      Listening live for counter verification...
                    </span>
                    <span className="font-mono font-black text-amber-300 bg-white/15 px-2.5 py-0.5 rounded-md text-sm border border-amber-400/30">
                      {data.order.order_number}
                    </span>
                  </div>
                </section>

                {/* Order Reference & Receipt Card for Cash Verification */}
                <section className="spidey-card rounded-3xl p-6 space-y-4 contain-layout text-white">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block select-none flex items-center gap-1">
                        <span>🕷️</span>
                        <span>Order Number</span>
                      </span>
                      <span className="font-mono text-lg font-black text-amber-300 tracking-tight">
                        #{data.order.order_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={copyOrderId}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all duration-150 active-press cursor-pointer select-none"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* Document Overview */}
                  <div className="flex items-start gap-3.5 pt-1">
                    <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">
                        {data.order.file_name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">
                        {data.order.page_count} {data.order.page_count === 1 ? 'page' : 'pages'} · {data.order.copies} {data.order.copies === 1 ? 'copy' : 'copies'}
                      </p>
                    </div>
                  </div>

                  {/* Specs Pills */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 select-none">
                    <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Paper</span>
                      <span className="font-black text-white">{data.order.paper_size}</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Color</span>
                      <span className="font-black text-white">
                        {data.order.color_mode === 'COLOR' ? 'Full Color' : 'Black & White'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Sides</span>
                      <span className="font-black text-white">
                        {data.order.print_sides === 'DOUBLE' ? '2-Sided' : '1-Sided'}
                      </span>
                    </div>
                  </div>

                  {/* Price Total */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-400 select-none">
                      Amount Due
                    </span>
                    <div className="text-right">
                      <span className="text-xl font-black text-amber-300">
                        {formatCurrency(data.order.total_amount)}
                      </span>
                      <span className="text-[10px] block font-semibold text-amber-400 select-none">
                        ⏳ Cash – Pay at Counter
                      </span>
                    </div>
                  </div>
                </section>
              </>
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
          className="btn-shimmer spidey-btn-thwip w-full py-3.5 rounded-2xl text-white text-center font-black text-sm shadow-xl shadow-red-900/40 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active-press select-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print Another Document</span>
          <span className="text-base select-none">🕸️</span>
        </Link>

        {/* Developer Attribution Card */}
        <DeveloperBadge className="mt-2" />
      </main>
    </div>
  );
}
