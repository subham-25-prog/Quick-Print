'use client';
import {useEffect,useState} from 'react';
import {useParams,useSearchParams,useRouter} from 'next/navigation';
import Link from 'next/link';
import {Header} from '@/components/Header';
import {formatCurrency} from '@/lib/utils';
type Status={status:string;reference:string;amount:number;environment:string;paymentUrl?:string;orderId?:string;orderAccessToken?:string;reviewRequired?:boolean;verificationPending?:boolean};
export default function PaymentPage(){
  const {id}=useParams<{id:string}>(),query=useSearchParams(),router=useRouter();const token=query.get('access_token')||'';
  const [state,setState]=useState<Status|null>(null),[error,setError]=useState(''),[retrying,setRetrying]=useState(false);
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{const res=await fetch(`/api/payments/${id}`,{headers:{'x-order-access-token':token},cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error||'Unable to check payment.');
        if(stopped)return;setState(data);setError('');
        if(data.status==='SUCCESS'&&data.orderId&&data.orderAccessToken){
          const url=`/order/success/${data.orderId}?access_token=${encodeURIComponent(data.orderAccessToken)}`;
          try{localStorage.setItem('quickprint_last_checkout',url);}catch{}router.replace(url);return;
        }
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Connection interrupted.');}
      if(!stopped)timer=setTimeout(poll,5000);
    }
    void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[id,token,router]);
  async function retry(){setRetrying(true);setError('');try{
    const res=await fetch(`/api/payments/${id}/retry`,{method:'POST',headers:{'x-order-access-token':token}});const data=await res.json();if(!res.ok)throw new Error(data.error);
    const url=`/payment/${data.paymentId}?access_token=${encodeURIComponent(data.accessToken)}`;localStorage.setItem('quickprint_last_checkout',url);router.replace(url);
  }catch(e){setError(e instanceof Error?e.message:'Retry unavailable.');}finally{setRetrying(false);}}
  const failed=state&&['FAILED','EXPIRED','CANCELLED'].includes(state.status);
  return <div className="min-h-screen bg-slate-100 text-slate-900"><Header/><main className="max-w-lg mx-auto p-5"><section className="bg-white rounded-3xl p-6 space-y-5 border border-slate-200">
    <h1 className="text-xl font-bold text-slate-900">{failed?'Payment not completed':'Waiting for payment confirmation'}</h1>
    {state?.environment==='sandbox'&&<p className="bg-amber-50 text-amber-900 p-3 rounded-xl">Sandbox test — no real payment or physical print.</p>}
    {state&&<><p className="text-3xl font-bold text-emerald-700">{formatCurrency(Number(state.amount))}</p><p className="text-xs text-slate-500 break-all">Reference: {state.reference}</p><p role="status" className="text-slate-700">{state.status}</p></>}
    <p className="text-sm text-slate-600">Printing starts after the shop securely verifies your payment. Returning from a payment app does not confirm it.</p>
    {state?.reviewRequired?<p role="alert" className="text-amber-900">This payment needs review. Contact the shop with this reference before paying again.</p>:state?.paymentUrl&&state.status==='PENDING'&&<a className="block bg-indigo-600 text-white text-center p-3 rounded-xl font-semibold" href={state.paymentUrl}>Open secure payment</a>}
    {state?.verificationPending&&<p className="text-amber-900">Confirmation is delayed. We will keep checking; please do not pay again.</p>}
    {failed&&!state.reviewRequired&&<button onClick={retry} disabled={retrying} className="bg-indigo-600 text-white rounded-xl p-3">{retrying?'Checking…':'Retry payment'}</button>}
    {error&&<p role="alert" className="text-rose-700">{error}</p>}
    <p className="text-xs text-slate-500">You can reopen this link after closing the page. Keep your payment reference.</p>
    <Link className="block text-indigo-700" href="/">Back to shop</Link>
  </section></main></div>;
}
