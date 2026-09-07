'use client';
import {useEffect,useState} from 'react';
import {useParams,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {Header} from '@/components/Header';
import {Order} from '@/types';
import {formatCurrency} from '@/lib/utils';

export default function OrderStatusPage(){
  const {id}=useParams<{id:string}>(),search=useSearchParams(),token=search.get('access_token');
  const [data,setData]=useState<{order:Order;job:{status:string;is_test:boolean};agentOnline:boolean}|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const controller=new AbortController();
    async function poll(){
      try{
        if(!token)throw new Error('This order link is incomplete. Use your saved payment link.');
        const res=await fetch('/api/orders/'+id,{headers:{'x-order-access-token':token},cache:'no-store',signal:controller.signal});
        const result=await res.json();if(!res.ok)throw new Error(result.error||'Order status is unavailable.');
        if(result.order?.payment_status!=='PAID')throw new Error('Payment has not been verified. Printing is not authorized.');
        if(!stopped){setData(result);setError('');}
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Connection interrupted.');}
      finally{if(!stopped){setLoading(false);timer=setTimeout(poll,5000);}}
    }
    void poll();return()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[id,token]);
  const state=data?.job?.status;
  const title=state==='SUBMITTED'?'Sent to printer':state==='PRINTED'?'Printing completed':state==='REVIEW'?'Printer outcome needs checking':state==='FAILED'?'Waiting for printer recovery':state==='PRINTING'?'Sending your document':state==='CLAIMED'?'Preparing your document':'Queued for printing';
  return <div className="min-h-screen bg-slate-50 text-slate-900"><Header/><main className="max-w-xl mx-auto p-4 py-8 space-y-5">
    {loading&&<p role="status">Loading verified order…</p>}
    {error&&<p role="alert" className="rounded-2xl p-4 bg-amber-50 text-amber-900 border border-amber-200">{error} We will keep checking; do not pay again.</p>}
    {data&&<>
      {data.job?.is_test&&<p className="p-3 rounded-xl bg-amber-100 text-amber-900 font-semibold">Sandbox order — no real payment or physical printing.</p>}
      <section className="bg-white border rounded-3xl p-6 space-y-3">
        <p className="text-emerald-700 font-semibold">Payment verified · Order confirmed</p>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="font-mono break-all text-slate-600">{data.order.order_number}</p>
        <p className="text-sm text-slate-600">{state==='SUBMITTED'?'The Windows printing system accepted the document. This does not confirm physical output; collect it after checking with the shop.':state==='REVIEW'?'Dispatch may have happened. Automatic retry is blocked to prevent duplicate printing. Please ask the shopkeeper to check the printer.':state==='FAILED'?'Printing did not start. The shopkeeper can retry once the printer is available.':!data.agentOnline?'The shop computer is offline. Your paid job stays safely queued.':'Your verified job will be processed automatically. You do not need to pay or submit again.'}</p>
      </section>
      <section className="bg-white border rounded-3xl p-6 space-y-3 text-sm">
        <h2 className="font-bold">Your document</h2><p className="break-words">{data.order.file_name}</p>
        <p>{data.order.page_count} pages × {data.order.copies} copies · {data.order.paper_size} · {data.order.color_mode} · {data.order.print_sides==='DOUBLE'?'Double-sided':'Single-sided'}</p>
        <p className="text-xl font-bold">{formatCurrency(data.order.total_amount)}</p>
        <p className="text-slate-500">Keep this private order link to check progress after closing the page.</p>
      </section>
    </>}
    <Link className="inline-block rounded-xl px-5 py-3 bg-indigo-600 text-white" href="/">Print another document</Link>
  </main></div>;
}
