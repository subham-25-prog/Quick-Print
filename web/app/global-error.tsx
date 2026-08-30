'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-slate-950 p-8 rounded-3xl border border-slate-800 space-y-4">
          <h2 className="text-xl font-bold text-rose-400">Application Error</h2>
          <p className="text-xs text-slate-400">
            {error?.message || 'A critical error occurred in the application.'}
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
          >
            Refresh Page
          </button>
        </div>
      </body>
    </html>
  );
}
