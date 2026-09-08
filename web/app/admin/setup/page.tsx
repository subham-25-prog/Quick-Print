'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';

type Health = { checks: Record<string, boolean>; merchant: string; environment: string; origin: string };
const labels: Record<string, string> = {
  admin: 'Admin access configured', orderAccess: 'Private order access configured',
  agentSecret: 'Printer pairing configured', cron: 'Maintenance key configured',
  canonicalUrl: 'Stable website address configured', providerCredentials: 'PhonePe credentials configured',
  merchantActivated: 'Merchant mapping activated', pricing: 'Shop pricing saved', agentOnline: 'Print agent online',
};
export default function SetupPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const refresh = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/setup', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to check this installation.');
      setHealth(data);
    } catch (e) { setHealth(null); setError(e instanceof Error ? e.message : 'Unable to check setup.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const ready = health && ['admin','orderAccess','agentSecret','cron','canonicalUrl','providerCredentials','pricing'].every(key => health.checks[key]);
  async function activate() {
    if (!ready || !confirmed || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantAccountConfirmed: true, merchantId: health?.merchant }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Activation failed.');
      setMessage(data.message); setConfirmed(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Activation failed. Refresh status before retrying.'); }
    finally { setBusy(false); }
  }
  return <><AdminHeader /><main className="max-w-2xl w-full mx-auto p-4 space-y-4">
    <h1 className="text-xl font-bold">Setup & Health</h1>
    <p>Finish these checks for this shop's own accounts. Until PhonePe is configured and activated, online checkout stays closed.</p>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {message && <p role="status" className="text-emerald-800">{message}</p>}
    <button type="button" onClick={() => void refresh()} className="rounded-xl border bg-white px-4 py-2">Refresh checks</button>
    {!health && !error && <p role="status">Checking installation…</p>}
    {health && <>
      <ul className="bg-white rounded-xl p-4 space-y-3">{Object.entries(labels).map(([key,label]) => <li key={key} className="flex justify-between gap-4"><span>{label}</span><span className={health.checks[key] ? 'text-emerald-700' : 'text-amber-800'}>{health.checks[key] ? 'Ready' : 'Needs setup'}</span></li>)}</ul>
      <p className="break-all">Merchant: {health.merchant || 'Not configured'} · Environment: {health.environment || 'Not configured'}</p>
      {health.origin && <p className="break-all">Webhook URL: {health.origin}/api/payments/webhook</p>}
      <label className="flex gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={!ready || busy} />I confirm these API credentials belong to this shop's merchant account.</label>
      <button type="button" disabled={!ready || !confirmed || busy} onClick={() => void activate()} className="rounded-xl bg-indigo-700 text-white px-4 py-3 disabled:opacity-40">{busy ? 'Activating…' : 'Activate configured merchant'}</button>
    </>}
    <p className="text-sm text-slate-600">Configured does not mean tested. Before opening the shop, verify a sandbox payment, duplicate webhook recovery, an offline-printer recovery and a controlled live payment with physical output. Maintenance scheduling must also be tested separately.</p>
  </main></>;
}
