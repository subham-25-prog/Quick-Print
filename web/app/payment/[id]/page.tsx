'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Header } from '@/components/Header';
import { ArrowLeft, RefreshCw, ShieldAlert, Smartphone, QrCode } from '@/components/ui/Icons';

type PaymentDetails = {
  status: string;
  reference: string;
  orderNumber?: string;
  amount: number;
  environment: string;
  paymentMethod?: string;
  paymentUrl?: string;
  upiUri?: string;
  payeeVpa?: string;
  payeeName?: string;
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

  const [state, setState] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

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
        if (!res.ok) throw new Error(data.error || 'Unable to check payment status.');
        if (stopped) return;

        setState(data);
        setError('');

        // Only redirect if trusted server-side confirmation returns SUCCESS
        if (data.status === 'SUCCESS' && data.orderId) {
          stopped = true;
          const targetToken = data.orderAccessToken || token;
          const url = `/status/${data.orderId}?access_token=${encodeURIComponent(targetToken)}`;
          window.location.replace(url);
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

      if (!stopped) timer = setTimeout(poll, 2500);
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, token, router]);

  // Generate Dynamic QR Code from exact UPI URI
  const effectiveUpiUri =
    state?.upiUri ||
    state?.paymentUrl ||
    (state?.orderNumber
      ? `upi://pay?pa=${encodeURIComponent(state.payeeVpa || 'wbs.erf@icici')}&pn=${encodeURIComponent(state.payeeName || 'West Bengal State Emergency Relief Fund')}&am=1&cu=INR&tn=${encodeURIComponent(`QuickPrint Test ${state.orderNumber}`)}&tr=${encodeURIComponent(state.orderNumber)}`
      : '');

  useEffect(() => {
    if (!effectiveUpiUri) return;

    QRCode.toDataURL(effectiveUpiUri, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
  }, [effectiveUpiUri]);

  const isCash = state?.paymentMethod === 'CASH' || state?.reference?.includes('CASH');
  const orderIdDisplay = state?.orderNumber || state?.reference || `QP-${id.slice(0, 4).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header />

      <main className="max-w-lg mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col justify-center">
        <section className="bg-white rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-200 shadow-sm text-center">
          {isCash ? (
            /* Cash at Counter flow */
            <>
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Waiting for Cash Verification
                </h1>
                <p className="text-sm text-slate-500">
                  Please pay at the shop counter. The operator will verify and start printing.
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 border border-slate-100">
                <p className="text-3xl font-extrabold text-slate-900">
                  ₹{state?.amount || 0}
                </p>
                <p className="text-xs font-mono text-slate-400">
                  Order: {orderIdDisplay}
                </p>
              </div>
            </>
          ) : (
            /* Direct UPI Initiation Test Flow */
            <>
              {/* Header Badge */}
              <div className="flex items-center justify-center gap-2">
                <span className="px-3.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-extrabold uppercase tracking-wider">
                  TEST PAYMENT
                </span>
                <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                  TEST MODE
                </span>
              </div>

              {/* Order & Amount Display */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 space-y-1">
                <div className="text-xs font-bold text-slate-500 tracking-wide uppercase">
                  Order: <span className="font-mono font-black text-slate-900 text-sm">{orderIdDisplay}</span>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  Amount: ₹1
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Payee: {state?.payeeName || 'West Bengal State Emergency Relief Fund'} ({state?.payeeVpa || 'wbs.erf@icici'})
                </div>
              </div>

              {/* Pay with UPI App Button (Mobile Intent) */}
              <div className="space-y-2">
                {effectiveUpiUri ? (
                  <a
                    href={effectiveUpiUri}
                    className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-center font-extrabold text-sm sm:text-base shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <Smartphone className="w-5 h-5 shrink-0" />
                    <span>Pay with UPI App</span>
                  </a>
                ) : (
                  <div className="w-full py-4 rounded-2xl bg-slate-100 text-slate-400 font-bold text-sm flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Preparing UPI Intent...</span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 font-medium">
                  Tapping launches Google Pay, PhonePe, Paytm, or BHIM on your device
                </p>
              </div>

              {/* Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  OR
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* Dynamic QR Code Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-slate-700">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>Scan with UPI App</span>
                </div>

                <div className="p-3 bg-white border-2 border-dashed border-slate-200 rounded-2xl inline-block shadow-2xs">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt="UPI Payment QR Code"
                      className="w-52 h-52 sm:w-56 sm:h-56 mx-auto rounded-xl"
                    />
                  ) : (
                    <div className="w-52 h-52 sm:w-56 sm:h-56 flex flex-col items-center justify-center gap-2 bg-slate-50 rounded-xl text-slate-400 text-xs">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      <span>Generating QR...</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 font-medium">
                  Scan using GPay, PhonePe, Paytm, or any banking app
                </p>
              </div>

              {/* Clear Warning */}
              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-semibold text-center flex items-center justify-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Test payment sends real money. Do not use amounts above ₹1.</span>
              </div>

              {/* Status Note */}
              <div className="p-3 rounded-xl bg-slate-100/70 border border-slate-200/80 text-[11px] text-slate-600 font-medium text-left space-y-1">
                <div className="font-bold flex items-center justify-between text-slate-800">
                  <span>Status: PAYMENT_PENDING</span>
                  <span className="text-[10px] text-slate-400 font-mono">Ready for bank API</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Automatic printing remains disabled until a trusted bank/PSP confirmation API is connected. Order ID will be verified upon server confirmation.
                </p>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </p>
          )}

          {/* Cancel & Return Option */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => router.replace('/?payment_error=cancelled')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Cancel & Return to Shop</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
