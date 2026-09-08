import {NextRequest,NextResponse} from 'next/server';
import {database,cleanupOldOrders} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {paymentProvider} from '@/lib/payments';
import {reconcilePayment} from '@/lib/payments/service';
import {equalSecret} from '@/lib/security';
import {apiError,HttpError} from '@/lib/http';
export const maxDuration=60;
export async function GET(req:NextRequest){
  try{
    const secret=process.env.CRON_SECRET||'';
    if(secret.length<32||!equalSecret(req.headers.get('authorization')||'',`Bearer ${secret}`))throw new HttpError(401,'Unauthorized.');
    const db=database(),shop=getCurrentShopId();
    const retention=await cleanupOldOrders(Number(process.env.DOCUMENT_RETENTION_DAYS||3));
    const {data:inbox,error:ie}=await db.from('webhook_inbox').select('payment_id').eq('shop_id',shop).is('processed_at',null).limit(4);if(ie)throw ie;
    const {data:due,error}=await db.from('payments').select('*').eq('shop_id',shop).eq('status','PENDING').lte('reconcile_after',new Date().toISOString()).order('reconcile_after').limit(4);if(error)throw error;
    const {error:rateError}=await db.from('rate_limits').delete().lt('window_start',new Date(Date.now()-86400000).toISOString());
    if(rateError)throw rateError;
    // A new shop can retain documents before it has merchant credentials.
    if(!inbox?.length&&!due?.length)return NextResponse.json({checked:0,failed:0,...retention});
    const provider=await paymentProvider();
    const pending=new Map((due||[]).map(p=>[p.id,p]));
    for(const row of inbox||[]){const {data:p}=await db.from('payments').select('*').eq('id',row.payment_id).eq('shop_id',shop).maybeSingle();if(p)pending.set(p.id,p);}
    let checked=0,failed=0;
    await Promise.all([...pending.values()].map(async p=>{
      try{
        const {data:lock,error:le}=await db.from('payments').update({reconcile_after:new Date(Date.now()+60000).toISOString()}).eq('id',p.id).eq('shop_id',shop).lte('reconcile_after',new Date().toISOString()).select('id').maybeSingle();
        if(le)throw le;if(!lock)return;
        await reconcilePayment(p,provider);
        const {error:done}=await db.from('webhook_inbox').update({processed_at:new Date().toISOString()}).eq('payment_id',p.id).eq('shop_id',shop);if(done)throw done;
        checked++;
      }catch{failed++;}
    }));
    return NextResponse.json({checked,failed,...retention},{status:failed?503:200});
  }catch(e){return apiError(e);}
}
