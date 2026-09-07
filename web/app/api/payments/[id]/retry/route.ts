import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {database} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {hasOrderAccess} from '@/lib/order-access';
import {rateLimit} from '@/lib/security';
import {apiError,HttpError,requireSameOrigin} from '@/lib/http';
import {paymentProvider} from '@/lib/payments';
import {openPayment,reconcilePayment} from '@/lib/payments/service';
import {uuid} from '@/lib/validation';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    requireSameOrigin(req);const id=uuid((await params).id);if(!hasOrderAccess(req,id))throw new HttpError(404,'Payment not found.');
    await rateLimit(req,'payment-retry',5);
    const db=database(),shop=getCurrentShopId(),provider=await paymentProvider();
    const {data:p,error}=await db.from('payments').select('*').eq('id',id).eq('shop_id',shop).maybeSingle();
    if(error)throw error;if(!p)throw new HttpError(404,'Payment not found.');
    const checked=await reconcilePayment(p,provider);
    if(checked.status==='SUCCESS')return NextResponse.json(await openPayment(checked,provider));
    if(!['FAILED','EXPIRED','CANCELLED'].includes(checked.status)||checked.review_required)throw new HttpError(409,'Payment is still being checked. Do not pay again yet.');
    const {data:f}=await db.from('uploaded_files').select('id').eq('id',p.uploaded_file_id).eq('shop_id',shop).is('deleted_at',null).is('deletion_claimed_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(!f)throw new HttpError(410,'Upload expired. Upload the document again.');
    const newId=randomUUID();
    const {data:created,error:ce}=await db.from('payments').insert({id:newId,shop_id:shop,uploaded_file_id:p.uploaded_file_id,owner_hash:p.owner_hash,
      request_hash:p.request_hash,idempotency_key:randomUUID(),provider:provider.name,merchant_id:provider.merchantId,environment:provider.environment,
      credential_fingerprint:provider.fingerprint,payment_reference:`QP_${newId.replace(/-/g,'')}`,amount:p.amount,currency:p.currency,status:'PENDING',draft_order:p.draft_order}).select('*').single();
    if(ce){if(ce.code==='23505'){const {data:active}=await db.from('payments').select('*').eq('uploaded_file_id',p.uploaded_file_id).eq('shop_id',shop).in('status',['PENDING','SUCCESS']).maybeSingle();if(active)return NextResponse.json(await openPayment(active,provider));}throw ce;}
    return NextResponse.json(await openPayment(created,provider));
  }catch(e){return apiError(e);}
}
