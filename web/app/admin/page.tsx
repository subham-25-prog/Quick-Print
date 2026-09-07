'use client';
import {useEffect,useState} from 'react';
import {AdminHeader} from '@/components/admin/AdminHeader';
import {formatCurrency} from '@/lib/utils';
import Link from 'next/link';
type Dashboard={stats:Record<string,number>;orders:any[];payments:any[];agent:any;printers:any[]};
export default function DashboardPage(){
  const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    async function poll(){try{
      const res=await fetch('/api/admin/dashboard',{cache:'no-store',signal:controller.signal});
      if(res.status===401){window.location.assign('/admin/login');return;}
      const body=await res.json();if(!res.ok)throw new Error(body.error||'Dashboard unavailable.');
      if(!stopped){setData(body);setError('');}
    }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Connection interrupted.');}
    finally{if(!stopped)timer=setTimeout(poll,10000);}}
    void poll();return()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[revision]);
  async function retry(id:string){setBusy(id);setError('');try{
    const res=await fetch('/api/admin/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id,action:'RETRY_PRINT'})});
    const body=await res.json();if(!res.ok)throw new Error(body.error);setRevision(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:'Retry unavailable.');}finally{setBusy('');}}
  return <div className="min-h-screen bg-slate-50 text-slate-900"><AdminHeader/><main className="max-w-6xl mx-auto p-4 py-8 space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">Shop dashboard</h1><Link href="/admin/settings" className="text-indigo-700 underline">Settings & installation checks</Link></div>
    {error&&<p role="alert" className="bg-amber-50 border border-amber-200 p-4 rounded-xl">{error} Displayed data may be stale.</p>}
    {!data&&!error&&<p>Loading shop data…</p>}
    {data&&<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
        ["Today's paid orders",data.stats.today_orders],["Today's revenue",formatCurrency(data.stats.today_revenue)],
        ["Pages submitted today",data.stats.today_pages_submitted],["Pending jobs",data.stats.pending_jobs],
        ["Failed before printing",data.stats.failed_jobs],["Needs review",data.stats.review_jobs],
        ["Agent",data.agent?.status||'NOT CONNECTED'],["Printer",data.agent?.printer_name||'Not configured']
      ].map(([label,value])=><section key={label} className="rounded-2xl bg-white border p-4"><h2 className="text-xs text-slate-500">{label}</h2><p className="text-xl font-bold break-words mt-2">{value??0}</p></section>)}</div>
      <p className="text-xs text-slate-500">Today uses Asia/Kolkata. Revenue and page totals exclude sandbox orders. Pages submitted are not confirmed physical pages. Printer readiness is checked by the agent before dispatch.</p>
      <section className="space-y-3"><h2 className="text-lg font-bold">Recent verified orders</h2>
        {data.orders.length===0&&<p>No verified orders yet.</p>}
        {data.orders.map(order=><article key={order.id} className="bg-white border rounded-2xl p-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="min-w-0"><p className="font-mono text-sm break-all">{order.order_number}</p><p className="text-sm break-all">{order.file_name}</p><p className="text-xs text-slate-500">{order.page_count} pages × {order.copies} · {order.paper_size} · {order.color_mode}</p></div>
          <div><p className="font-bold">{formatCurrency(order.total_amount)}</p><p className="text-xs">{order.print_jobs?.[0]?.is_test?'SANDBOX · ':''}{order.print_jobs?.[0]?.status||order.order_status}</p></div>
          {order.print_jobs?.[0]?.status==='FAILED'&&<button disabled={!!busy} onClick={()=>retry(order.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">{busy===order.id?'Retrying…':'Retry pre-dispatch failure'}</button>}
          {order.print_jobs?.[0]?.status==='REVIEW'&&<p className="text-amber-800 text-sm max-w-xs">Check the printer and local journal. No automatic reprint: dispatch may already have happened.</p>}
        </article>)}
      </section>
      <section className="space-y-3"><h2 className="text-lg font-bold">Recent payments</h2><p className="text-xs text-slate-500">Pending payments are not orders and cannot be printed. No manual payment-success control is available.</p>
        {data.payments.length===0&&<p>No payment sessions yet.</p>}
        {data.payments.map(p=><div key={p.id} className="bg-white rounded-xl border p-3 text-sm flex flex-wrap gap-2 justify-between"><span className="font-mono break-all">{p.payment_reference}</span><span>{formatCurrency(p.amount)} · {p.environment} · {p.review_required?'REVIEW REQUIRED':p.status}</span></div>)}
      </section>
    </>}
  </main></div>;
}

