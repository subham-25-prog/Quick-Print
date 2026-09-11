'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, RefreshCw, AlertCircle, ShieldAlert } from '@/components/ui/Icons';

type Status = {
  status: string;
  reference: string;
  amount: number;
  environment: string;
  paymentMethod?: string;
  paymentUrl?: string;
  orderId?: string;
  orderAccessToken?: string;
  reviewRequired?: boolean;
  verificationPending?: boolean;
};

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const token = query.get('access_token') || '';

  const [state, setState] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Waiting for payment confirmation…');

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/payments/${id}`, {
          headers: { 'x-order-access-token': token },
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to check payment.');
        if (stopped) return;

        setState(data);
        setError('');

        if (data.status === 'SUCCESS' && data.orderId) {
          stopped = true;
          const targetToken = data.orderAccessToken || token;
          const url = `/status/${data.orderId}?access_token=${encodeURIComponent(targetToken)}`;
          window.location.replace(url);
          return;
        }

        if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(data.status)) {
          stopped = true;
          // When payment fails, automatically redirect back to client interface
          router.replace('/?payment_error=' + encodeURIComponent(data.status.toLowerCase()));
          return;
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Connection interrupted.');
      }

      if (!stopped) timer = setTimeout(poll, 1500);
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, token, router]);

  async function retry() {
    setRetrying(true);
    setError('');
    try {
      const res = await fetch(`/api/payments/${id}/retry`, {
        method: 'POST',
        headers: { 'x-order-access-token': token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry unavailable.');
      const url = `/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;
      router.replace(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry unavailable.');
    } finally {
      setRetrying(false);
    }
  }

  const failed = state && ['FAILED', 'EXPIRED', 'CANCELLED'].includes(state.status);
  const isCash = state?.paymentMethod === 'CASH' || state?.reference?.includes('CASH');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header />
      <main className="max-w-lg mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col justify-center">
        <section className="bg-white rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-200 shadow-sm text-center">
          {/* Status Animation */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            {failed ? (
              <ShieldAlert className="w-8 h-8 text-rose-600" />
            ) : (
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {failed
                ? 'Payment Not Completed'
                : isCash
                ? 'Waiting for Cash Verification'
                : 'Verifying Your Payment'}
            </h1>
            <p className="text-sm text-slate-500">
              {failed
                ? 'Returning you to the shop interface…'
                : isCash
                ? 'Please pay at the shop counter. The operator will verify and start printing.'
                : 'Please complete the payment in your app. Do not close this window.'}
            </p>
          </div>

          {state?.environment === 'sandbox' && (
            <p className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
              Sandbox Test Mode — No real money or physical print
            </p>
          )}

          {state && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 border border-slate-100">
              <p className="text-3xl font-extrabold text-slate-900">
                {formatCurrency(Number(state.amount))}
              </p>
              <p className="text-xs font-mono text-slate-400 break-all">
                Ref: {state.reference}
              </p>
            </div>
          )}

          {state?.verificationPending && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Confirmation is slightly delayed. We are checking automatically; please do not pay again.</span>
            </div>
          )}

          {state?.reviewRequired && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>This payment needs manual shopkeeper review. Please share your reference at the counter.</span>
            </div>
          )}

          {state?.paymentUrl && state.status === 'PENDING' && (
            <a
              className="block w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-center font-bold text-sm shadow-md transition-all active:scale-[0.99]"
              href={state.paymentUrl}
            >
              Open Secure Payment App
            </a>
          )}

          {failed && !state.reviewRequired && (
            <div className="space-y-3">
              <button
                onClick={() => router.replace('/?payment_error=failed')}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Shop Interface
              </button>
              <button
                onClick={retry}
                disabled={retrying}
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all disabled:opacity-50"
              >
                {retrying ? 'Starting…' : 'Try Payment Again'}
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </p>
          )}

          {!failed && (
            <button
              type="button"
              onClick={() => router.replace('/?payment_error=cancelled')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 mx-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Cancel & Return to Shop
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
