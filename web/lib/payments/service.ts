import {database} from '../db';
import {getCurrentShopId} from '../shop';
import {appOrigin} from '../security';
import {createOrderAccessToken} from '../order-access';
import {HttpError} from '../http';
import {PaymentContext,PaymentProvider,assertVerified} from './provider';

export type StoredPayment=PaymentContext & {status:string;order_id?:string;payment_url?:string;review_required?:boolean;creation_started_at?:string;};
export async function openPayment(p:StoredPayment,provider:PaymentProvider){
  const token=createOrderAccessToken(p.id);if(!token)throw new HttpError(503,'Checkout access security is unavailable.');
  let url=p.payment_url;
  if(p.status==='PENDING'&&!url&&!p.creation_started_at){
    const db=database();
    const {data:lock,error}=await db.from('payments').update({creation_started_at:new Date().toISOString()}).eq('id',p.id).eq('shop_id',getCurrentShopId()).is('creation_started_at',null).select('id').maybeSingle();
    if(error)throw error;
    if(lock){
      try{
        const session=await provider.createPayment(p,`${appOrigin()}/payment/${p.id}?access_token=${encodeURIComponent(token)}`);
        const {error:save}=await db.from('payments').update({payment_url:session.url,provider_link_id:session.providerOrderId}).eq('id',p.id).eq('shop_id',getCurrentShopId());
        if(save)throw save;url=session.url;
      }catch{
        // Unknown network outcome: retain this reference for reconciliation.
        // Never create another charge from a transport error.
        console.warn(JSON.stringify({event:'payment_creation_pending',paymentId:p.id}));
      }
    }
  }
  return {success:true,paymentId:p.id,accessToken:token,paymentUrl:url,amount:p.amount,reference:p.payment_reference,status:p.status,environment:p.environment,orderId:p.order_id};
}
export async function reconcilePayment(p:StoredPayment,provider:PaymentProvider){
  if(p.status==='SUCCESS')return p;
  const result=await provider.getPaymentStatus(p);
  const db=database(),shop=getCurrentShopId();
  if(result.state==='SUCCESS'){
    assertVerified(p,result);
    const {data:orderId,error}=await db.rpc('finalize_payment',{p_shop_id:shop,p_payment_id:p.id,p_provider:result.provider,
      p_merchant_id:result.merchantId,p_reference:result.reference,p_transaction_id:result.transactionId,p_amount_minor:result.amountMinor,
      p_currency:result.currency,p_environment:result.environment,p_credential_fingerprint:result.fingerprint});
    if(error)throw error;
    return {...p,status:orderId?'SUCCESS':p.status,order_id:orderId,review_required:!orderId};
  }
  const {error}=await db.from('payments').update({status:result.state,last_checked_at:new Date().toISOString(),reconcile_after:new Date(Date.now()+60000).toISOString()}).eq('id',p.id).eq('shop_id',shop).neq('status','SUCCESS');
  if(error)throw error;
  return {...p,status:result.state};
}
