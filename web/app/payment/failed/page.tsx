'use client';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { ArrowLeft, ShieldAlert } from '@/components/ui/Icons';

export default function Failed() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header />
      <main className="max-w-md mx-auto w-full p-6 flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-3xl p-7 text-center space-y-5 border border-slate-200 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900">Payment Not Completed</h1>
            <p className="text-sm text-slate-500">
              Your transaction was not completed or was cancelled. If any money was deducted, it will be automatically refunded by your UPI app.
            </p>
          </div>
          <button
            onClick={() => router.replace('/?payment_error=failed')}
            className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Client Interface</span>
          </button>
        </div>
      </main>
    </div>
  );
}
