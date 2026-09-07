import {NextRequest,NextResponse,after} from 'next/server';
import {reconcilePayment} from '@/lib/payments/service';
import {database} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {paymentProvider} from '@/lib/payments';
import {apiError,HttpError} from '@/lib/http';
export const maxDuration=60;
export async function POST(req:NextRequest){
  try{
    if(Number(req.headers.get('content-length'))>65536)throw new HttpError(413,'Webhook too large.');
    const provider=await paymentProvider();let event;
    try{event=await provider.handleWebhook(req);}catch{throw new HttpError(401,'Webhook rejected.');}
    const db=database(),shop=getCurrentShopId();
    const {data:p,error}=await db.from('payments').select('*').eq('shop_id',shop).eq('provider',provider.name).eq('merchant_id',event.merchantId).eq('payment_reference',event.reference).maybeSingle();
    if(error)throw error;if(!p)throw new HttpError(404,'Unknown payment.');
    // Acknowledge only after durable receipt; the scheduled worker/status poll
    // verifies through PhonePe independently, even if the customer never returns.
    const {error:ie}=await db.from('webhook_inbox').upsert({shop_id:shop,payment_id:p.id,event_hash:event.eventHash},{onConflict:'event_hash',ignoreDuplicates:true});
    if(ie)throw ie;
    const {error:ue}=await db.from('payments').update({reconcile_after:new Date().toISOString()}).eq('id',p.id).eq('shop_id',shop);
    if(ue)throw ue;
    console.info(JSON.stringify({event:'webhook_received',paymentId:p.id}));
    // Fast best-effort reconciliation after acknowledgement. The durable inbox
    // and scheduled worker recover if this serverless invocation is interrupted.
    after(async()=>{
      try{
        await reconcilePayment(p,provider);
        const {error:done}=await db.from('webhook_inbox').update({processed_at:new Date().toISOString()}).eq('payment_id',p.id).eq('shop_id',shop);
        if(done)throw done;
      }catch{console.warn(JSON.stringify({event:'webhook_reconciliation_deferred',paymentId:p.id}));}
    });
    return NextResponse.json({received:true});
  }catch(e){return apiError(e);}
}
