'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Order } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  Printer,
  FileText,
  AlertCircle,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
  Sparkles,
} from '@/components/ui/Icons';
import { LivePrintVisualizer } from '@/components/customer/LivePrintVisualizer';
import { DeveloperBadge } from '@/components/DeveloperBadge';
import { useShopName } from '@/lib/shop-sync';

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const token = search.get('access_token');
  const shopName = useShopName();

  const [data, setData] = useState<{
    order: Order;
    job: { status: string; is_test: boolean; submitted_at?: string };
    agentOnline: boolean;
  } | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data?.order?.order_number && typeof document !== 'undefined') {
      document.title = `${shopName} – Order #${data.order.order_number}`;
    }
  }, [data?.order?.order_number, shopName]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveErrors = 0;
    let currentId = id;
    let currentToken = token;

    async function poll() {
      try {
        if (!currentToken) {
          throw new Error('This order link is missing an access token.');
        }

        const res = await fetch('/api/orders/' + currentId, {
          headers: { 'x-order-access-token': currentToken },
          cache: 'no-store',
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Order status is temporarily unavailable.');
        }

        if (!stopped) {
          consecutiveErrors = 0;
          setData(result);
          setError('');

          // If assigned a new orderId, track it and keep the browser URL clean
          if (result.order?.id && result.order.id !== currentId) {
            currentId = result.order.id;
            const nextToken: string = typeof result.orderAccessToken === 'string' && result.orderAccessToken
              ? result.orderAccessToken : currentToken;
            currentToken = nextToken;
            if (typeof window !== 'undefined') {
              const nextUrl = `/status/${currentId}?access_token=${encodeURIComponent(nextToken)}`;
              window.history.replaceState(null, '', nextUrl);
            }
          }
        }
      } catch (e) {
        if (!stopped && (e as Error)?.name !== 'AbortError') {
          consecutiveErrors++;
          // Only show error banner after multiple persistent failures to avoid layout twitch
          if (consecutiveErrors >= 3) {
            setError(e instanceof Error ? e.message : 'Connection interrupted.');
          }
        }
      } finally {
        if (!stopped) {
          setLoading(false);
          // Rapid 1-second polling while in progress, 4s once completed
          const isDone =
            data?.order?.order_status === 'PRINTED' ||
            data?.order?.order_status === 'SUBMITTED' ||
            data?.job?.status === 'PRINTED' ||
            data?.job?.status === 'SUBMITTED';
          const nextInterval = isDone ? 4000 : 1000;
          timer = setTimeout(poll, nextInterval);
        }
      }
    }

    void poll();

    // Cross-tab immediate synchronization via BroadcastChannel
    let broadcastCh: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        broadcastCh = new BroadcastChannel('quickprint_order_events');
        broadcastCh.onmessage = (ev) => {
          if (!ev.data) return;
          if (!ev.data.orderId || ev.data.orderId === currentId) {
            // Trigger instantaneous check without waiting for timer
            clearTimeout(timer);
            void poll();
          }
        };
      }
    } catch {}

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (broadcastCh) {
        try { broadcastCh.close(); } catch {}
      }
    };
  }, [id, token]);

  const copyOrderId = () => {
    if (!data?.order?.order_number) return;
    void navigator.clipboard.writeText(data.order.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      <main className="max-w-xl mx-auto w-full px-4 pt-5 space-y-4">
        {/* Top Connectivity & Live Indicator */}
        <div className="flex items-center justify-between px-2 text-xs">
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
                : 'Shop Agent Active (Order Queued)'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync
          </span>
        </div>

        {/* Loading placeholder */}
        {loading && !data && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Loading verified order…</p>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Notice</p>
              <p className="text-xs text-amber-800 mt-0.5">{error} We are still checking; please do not pay again.</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {data.job?.is_test && (
              <div className="p-3.5 rounded-2xl bg-amber-100/80 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Sandbox Test Mode — Simulated print without paper output.</span>
              </div>
            )}

            {/* Awaiting Cash Verification Card OR Live Animated 5-Step Print Status Pipeline */}
            {isAwaitingVerification ? (
              <section className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 rounded-3xl p-6 sm:p-7 text-white shadow-lg space-y-4 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
              <LivePrintVisualizer
                jobStatus={jobState}
                orderStatus={data.order.order_status}
                paymentStatus={data.order.payment_status}
                pageCount={data.order.page_count}
                copies={data.order.copies}
                fileName={data.order.file_name}
                isTest={data.job?.is_test}
                shopName={shopName}
                orderNumber={data.order.order_number}
                paperSize={data.order.paper_size}
                colorMode={data.order.color_mode}
              />
            )}

            {/* 2. Order Reference & Receipt Card */}
            <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Order Number
                  </span>
                  <span className="font-mono text-base font-extrabold text-slate-900 tracking-tight">
                    {data.order.order_number}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyOrderId}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* Document Overview */}
              <div className="flex items-start gap-3.5 pt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {data.order.file_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.order.page_count} {data.order.page_count === 1 ? 'page' : 'pages'} · {data.order.copies} {data.order.copies === 1 ? 'copy' : 'copies'}
                  </p>
                </div>
              </div>

              {/* Specs Pills */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Paper</span>
                  <span className="font-bold text-slate-800">{data.order.paper_size}</span>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Color</span>
                  <span className="font-bold text-slate-800">
                    {data.order.color_mode === 'COLOR' ? 'Full Color' : 'Black & White'}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Sides</span>
                  <span className="font-bold text-slate-800">
                    {data.order.print_sides === 'DOUBLE' ? '2-Sided' : '1-Sided'}
                  </span>
                </div>
              </div>

              {/* Price Total */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">
                  {isAwaitingVerification ? 'Amount Due' : 'Total Paid'}
                </span>
                <div className="text-right">
                  <span className="text-xl font-black text-emerald-700">
                    {formatCurrency(data.order.total_amount)}
                  </span>
                  <span className={`text-[10px] block font-semibold ${isAwaitingVerification ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isAwaitingVerification ? '⏳ Cash – Pay at Counter' : data.order.payment_method === 'CASH' ? '✓ Cash Verified' : '✓ Paid Online'}
                  </span>
                </div>
              </div>
            </section>


          </>
        )}

        {/* Action Button: Print Another Document */}
        <Link
          href="/"
          className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-center font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print Another Document</span>
        </Link>

        {/* Developer Attribution Card */}
        <DeveloperBadge className="mt-3" />
      </main>
    </div>
  );
}
