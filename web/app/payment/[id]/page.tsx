'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, RefreshCw, AlertCircle, Smartphone, QrCode, CheckCircle2 } from '@/components/ui/Icons';

type Status = {
  status: string;
  reference: string;
  amount: number;
  environment: string;
  paymentMethod?: string;
  paymentUrl?: string;
  upiUri?: string;
  qrDataUrl?: string;
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
  const [isMobile, setIsMobile] = useState(false);
  const [showQrOnMobile, setShowQrOnMobile] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        const userAgent = navigator.userAgent || '';
        const isMobileUA = /android|iphone|ipad|ipod|mobile/i.test(userAgent);
        const isSmallScreen = window.innerWidth < 640;
        setIsMobile(isMobileUA || isSmallScreen);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

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
          setIsVerified(true);
          const targetToken = data.orderAccessToken || token;
          const url = `/status/${data.orderId}?access_token=${encodeURIComponent(targetToken)}`;
          setTimeout(() => {
            window.location.replace(url);
          }, 1200);
          return;
        }

        if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(data.status)) {
          stopped = true;
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
  const upiLink = state?.upiUri || state?.paymentUrl || '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header />
      <main className="max-w-lg mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col justify-center">
        <section className="bg-white rounded-3xl p-6 sm:p-8 space-y-5 border border-slate-200 shadow-sm text-center">
          {/* Header & Total Amount */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount to Pay</span>
            <div className="text-4xl font-black text-slate-900 tracking-tight">
              {state ? formatCurrency(Number(state.amount)) : '...'}
            </div>
            {state?.reference && (
              <div className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 inline-block px-3 py-0.5 rounded-full mt-1 border border-indigo-100">
                Order: {state.reference}
              </div>
            )}
          </div>

          {/* Verification Success State */}
          {isVerified && (
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-center animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-emerald-950">Payment Verified!</h3>
              <p className="text-xs text-emerald-700 font-medium">Your document has been added to the print queue.</p>
            </div>
          )}

          {/* Direct UPI Payment Methods (Mobile vs Desktop) */}
          {!failed && !isVerified && state?.status === 'PENDING' && !isCash && (
            <div className="space-y-4 pt-1">
              {isMobile ? (
                /* Mobile: Prioritize "Pay with UPI App" button */
                <div className="space-y-3">
                  {upiLink && (
                    <a
                      href={upiLink}
                      className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-center font-extrabold text-base shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                    >
                      <Smartphone className="w-5 h-5" />
                      <span>Pay with UPI App</span>
                    </a>
                  )}
                  <p className="text-[11px] text-slate-500 font-medium">
                    Tap to pay with GPay, PhonePe, Paytm, or BHIM directly
                  </p>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-3 text-slate-400 font-bold text-[10px]">OR</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowQrOnMobile(!showQrOnMobile)}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    <span>{showQrOnMobile ? 'Hide Dynamic QR' : 'Scan with any UPI App (Show QR)'}</span>
                  </button>

                  {showQrOnMobile && state.qrDataUrl && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col items-center">
                      <img
                        src={state.qrDataUrl}
                        alt="Dynamic UPI QR Code"
                        className="w-56 h-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                      />
                      <p className="text-[11px] text-slate-500 font-medium mt-2">
                        Scan from another device using any UPI app
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Desktop: Prioritize Dynamic UPI QR */
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center max-w-xs w-full shadow-2xs">
                    <div className="text-xs font-bold text-slate-700 mb-2">
                      Scan with any UPI App
                    </div>
                    {state.qrDataUrl ? (
                      <img
                        src={state.qrDataUrl}
                        alt="Dynamic UPI QR Code"
                        className="w-60 h-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                      />
                    ) : (
                      <div className="w-60 h-60 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-xs font-medium">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      </div>
                    )}
                    <div className="mt-2.5 text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <span>PhonePe</span> • <span>Google Pay</span> • <span>Paytm</span> • <span>BHIM</span>
                    </div>
                  </div>

                  <div className="relative w-full py-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-3 text-slate-400 font-bold text-[10px]">OR</span>
                    </div>
                  </div>

                  {upiLink && (
                    <a
                      href={upiLink}
                      className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4 text-indigo-600" />
                      <span>Pay with UPI App</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cash Payment Flow Message */}
          {!failed && !isVerified && isCash && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-center">
              <h4 className="text-sm font-bold text-slate-800">Waiting for Cash Verification</h4>
              <p className="text-xs text-slate-500">
                Please pay at the shop counter. The operator will verify and start printing.
              </p>
            </div>
          )}

          {/* Waiting for payment indicator */}
          {!failed && !isVerified && state?.status === 'PENDING' && (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs font-bold text-slate-600">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600" />
              </span>
              <span>Waiting for payment...</span>
            </div>
          )}

          {state?.environment === 'sandbox' && (
            <p className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
              Sandbox Test Mode — Physical printing triggers on simulation agent
            </p>
          )}

          {state?.verificationPending && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Confirmation is being verified. Please do not pay again.</span>
            </div>
          )}

          {state?.reviewRequired && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium text-left flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>This payment needs manual review. Please share your reference at the counter.</span>
            </div>
          )}

          {failed && !state?.reviewRequired && (
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                Payment could not be completed.
              </div>
              <button
                type="button"
                onClick={() => router.replace('/?payment_error=failed')}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Shop Interface
              </button>
              <button
                type="button"
                onClick={retry}
                disabled={retrying}
                className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
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
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 mx-auto pt-1 cursor-pointer"
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
