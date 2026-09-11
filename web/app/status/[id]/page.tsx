'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
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
  const router = useRouter();
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
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    if (data?.order?.order_number && typeof document !== 'undefined') {
      document.title = `${shopName} – Order #${data.order.order_number}`;
    }
  }, [data?.order?.order_number, shopName]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();

    async function poll() {
      try {
        if (!token) {
          throw new Error('This order link is missing an access token.');
        }

        const res = await fetch('/api/orders/' + id, {
          headers: { 'x-order-access-token': token },
          cache: 'no-store',
          signal: controller.signal,
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Order status is temporarily unavailable.');
        }

        if (result.order?.payment_status !== 'PAID') {
          throw new Error('Payment verification is pending. Printing is not authorized yet.');
        }

        if (!stopped) {
          setData(result);
          setError('');
          setLastUpdated(new Date());
        }
      } catch (e) {
        if (!stopped && (e as Error)?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : 'Connection interrupted.');
        }
      } finally {
        if (!stopped) {
          setLoading(false);
          // Poll every 2.5 seconds for true live updates
          timer = setTimeout(poll, 2500);
        }
      }
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, token]);

  const copyOrderId = () => {
    if (!data?.order?.order_number) return;
    void navigator.clipboard.writeText(data.order.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const jobState = data?.job?.status || 'PENDING';

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
                  data?.agentOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  data?.agentOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="font-semibold text-slate-700">
              {data?.agentOnline ? 'Shop Printer Connected & Live' : 'Shop Agent Offline (Order Queued)'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Live auto-updating
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

            {/* Live Animated 5-Step Print Status Pipeline */}
            <LivePrintVisualizer
              jobStatus={jobState}
              pageCount={data.order.page_count}
              copies={data.order.copies}
              fileName={data.order.file_name}
              isTest={data.job?.is_test}
              shopName={shopName}
              orderNumber={data.order.order_number}
              paperSize={data.order.paper_size}
              colorMode={data.order.color_mode}
            />

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
                <span className="text-sm font-bold text-slate-600">Total Paid</span>
                <div className="text-right">
                  <span className="text-xl font-black text-emerald-700">
                    {formatCurrency(data.order.total_amount)}
                  </span>
                  <span className="text-[10px] text-emerald-600 block font-semibold">
                    ✓ Paid Online
                  </span>
                </div>
              </div>
            </section>

            {/* 3. Counter Pickup Guide */}
            <section className="bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/70 rounded-3xl p-5 border border-indigo-100/80 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Printer className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Pickup Counter Instructions
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Show Order ID <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{data.order.order_number}</span> at the counter, or collect your printed documents directly from the output tray.
                </p>
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
