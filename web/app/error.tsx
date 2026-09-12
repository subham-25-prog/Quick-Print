'use client';

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 flex items-center justify-center text-slate-900">
      <section role="alert" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm space-y-4">
        <h1 className="text-xl font-bold">This page could not load</h1>
        <p>Please try again. If you already started a payment, reopen its status page before paying again.</p>
        <button type="button" onClick={reset} className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">
          Try again
        </button>
      </section>
    </main>
  );
}
