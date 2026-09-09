'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Order } from '@/types';
import { formatCurrency } from '@/lib/utils';
import {
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  Activity,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
  Clock,
  Sparkles,
} from '@/components/ui/Icons';

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get('access_token');

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

  // Compute active step index (0 to 3)
  const currentStep = useMemo(() => {
    switch (jobState) {
      case 'PRINTED':
        return 3;
      case 'SUBMITTED':
      case 'PRINTING':
      case 'CLAIMED':
        return 2;
      case 'PENDING':
      default:
        return 1;
    }
  }, [jobState]);

  const statusConfig = useMemo(() => {
    switch (jobState) {
      case 'PRINTED':
        return {
          title: 'Printing Completed!',
          subtitle: 'Your document has been printed successfully. Please collect it from the counter tray.',
          badgeBg: 'bg-emerald-500 text-white',
          cardBorder: 'border-emerald-200 bg-gradient-to-b from-emerald-50/50 to-white',
          pulseColor: 'bg-emerald-400',
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
        };
      case 'SUBMITTED':
        return {
          title: 'Document Sent to Printer',
          subtitle: 'The Windows print system accepted your document. Output is being processed right now.',
          badgeBg: 'bg-blue-600 text-white',
          cardBorder: 'border-blue-200 bg-gradient-to-b from-blue-50/40 to-white',
          pulseColor: 'bg-blue-400',
          icon: <Printer className="w-8 h-8 text-blue-600" />,
        };
      case 'PRINTING':
      case 'CLAIMED':
        return {
          title: 'Printing in Progress…',
          subtitle: 'The shop printer agent is downloading and dispatching your pages to the printer.',
          badgeBg: 'bg-indigo-600 text-white',
          cardBorder: 'border-indigo-200 bg-gradient-to-b from-indigo-50/40 to-white',
          pulseColor: 'bg-indigo-400',
          icon: <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />,
        };
      case 'REVIEW':
        return {
          title: 'Print Verification Needed',
          subtitle: 'Your payment is confirmed. Please ask the shopkeeper at the counter to release your print job.',
          badgeBg: 'bg-amber-500 text-white',
          cardBorder: 'border-amber-200 bg-gradient-to-b from-amber-50/40 to-white',
          pulseColor: 'bg-amber-400',
          icon: <AlertCircle className="w-8 h-8 text-amber-600" />,
        };
      case 'FAILED':
        return {
          title: 'Printer Recovery Required',
          subtitle: 'The printer encountered a paper/hardware issue. The shopkeeper can restart it instantly.',
          badgeBg: 'bg-rose-500 text-white',
          cardBorder: 'border-rose-200 bg-gradient-to-b from-rose-50/40 to-white',
          pulseColor: 'bg-rose-400',
          icon: <AlertCircle className="w-8 h-8 text-rose-600" />,
        };
      case 'PENDING':
      default:
        return {
          title: 'Queued for Printing',
          subtitle: 'Payment verified! Your document is securely queued and waiting for the printer.',
          badgeBg: 'bg-indigo-600 text-white',
          cardBorder: 'border-indigo-100 bg-white',
          pulseColor: 'bg-indigo-400',
          icon: <Clock className="w-8 h-8 text-indigo-600" />,
        };
    }
  }, [jobState]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans pb-16">
      <Header />

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

            {/* 1. Hero Live Status Card */}
            <section className={`rounded-3xl p-6 sm:p-7 border shadow-xs space-y-5 transition-all ${statusConfig.cardBorder}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Payment Verified</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
                    {statusConfig.title}
                  </h1>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
                  {statusConfig.icon}
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {statusConfig.subtitle}
              </p>

              {/* Live 4-Step Stepper */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Live Printing Progress
                </p>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {/* Step 1: Paid */}
                  <div className="space-y-1.5">
                    <div className="h-2 rounded-full bg-emerald-500 w-full" />
                    <span className="block font-bold text-slate-800 text-[11px]">1. Paid</span>
                  </div>
                  {/* Step 2: Queued */}
                  <div className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full w-full transition-all ${
                        currentStep >= 1 ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                    <span className={`block font-bold text-[11px] ${currentStep >= 1 ? 'text-slate-800' : 'text-slate-400'}`}>
                      2. Queued
                    </span>
                  </div>
                  {/* Step 3: Printing */}
                  <div className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full w-full transition-all ${
                        currentStep >= 2
                          ? currentStep === 2
                            ? 'bg-indigo-500 animate-pulse'
                            : 'bg-emerald-500'
                          : 'bg-slate-200'
                      }`}
                    />
                    <span className={`block font-bold text-[11px] ${currentStep >= 2 ? 'text-slate-800' : 'text-slate-400'}`}>
                      3. Printing
                    </span>
                  </div>
                  {/* Step 4: Ready */}
                  <div className="space-y-1.5">
                    <div
                      className={`h-2 rounded-full w-full transition-all ${
                        currentStep >= 3 ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                    <span className={`block font-bold text-[11px] ${currentStep >= 3 ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}`}>
                      4. Ready
                    </span>
                  </div>
                </div>
              </div>
            </section>

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
      </main>
    </div>
  );
}
