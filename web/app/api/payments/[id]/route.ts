import {NextRequest,NextResponse} from 'next/server';
import {database} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {hasOrderAccess,createOrderAccessToken} from '@/lib/order-access';
import {rateLimit} from '@/lib/security';
import {apiError,HttpError} from '@/lib/http';
import {paymentProvider} from '@/lib/payments';
import {reconcilePayment} from '@/lib/payments/service';
import {uuid} from '@/lib/validation';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const id=uuid((await params).id);if(!hasOrderAccess(req,id))throw new HttpError(404,'Payment not found.');
    await rateLimit(req,`payment:${id}`,20);
    const db=database(),shop=getCurrentShopId();
    const {data,error}=await db.from('payments').select('*').eq('id',id).eq('shop_id',shop).maybeSingle();
    if(error)throw error;if(!data)throw new HttpError(404,'Payment not found.');
    let p=data,verificationPending=false;
    if(p.status==='PENDING'&&!p.review_required){
      const {data:lock,error:le}=await db.from('payments').update({reconcile_after:new Date(Date.now()+15000).toISOString()}).eq('id',id).eq('shop_id',shop).lte('reconcile_after',new Date().toISOString()).select('id').maybeSingle();
      if(le)throw le;
      if(lock){try{p=await reconcilePayment(p,await paymentProvider());}catch{verificationPending=true;}}
    }
    return NextResponse.json({status:p.status,reference:p.payment_reference,amount:p.amount,environment:p.environment,
      paymentUrl:p.status==='PENDING'?p.payment_url:undefined,reviewRequired:p.review_required,verificationPending,
      orderId:p.status==='SUCCESS'?p.order_id:undefined,orderAccessToken:p.status==='SUCCESS'?createOrderAccessToken(p.order_id):undefined},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return apiError(e);}
}
