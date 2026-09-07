import { createHash,timingSafeEqual } from 'node:crypto';
import {readText} from '../http';
import { PaymentContext,PaymentProvider,VerifiedPayment,assertVerified } from './provider';

// Source contracts: docs/MERCHANT_PROVIDER_SETUP.md (PhonePe v2, checked 2026-09-07).
export class PhonePeProvider implements PaymentProvider {
  readonly name='phonepe';
  readonly fingerprint:string;
  private token?:{value:string;expires:number};
  private base:string;
  constructor(readonly merchantId:string,readonly environment:'sandbox'|'live',private clientId:string,
    private clientVersion:string,private clientSecret:string,private webhookUser:string,private webhookPassword:string,
    private transport:typeof fetch=fetch){
    this.base=environment==='live'?'https://api.phonepe.com/apis/pg':'https://api-preprod.phonepe.com/apis/pg-sandbox';
    this.fingerprint=createHash('sha256').update(`${clientId}:${clientVersion}:${environment}`).digest('hex');
  }
  private async authorization(){
    if(this.token&&this.token.expires>Date.now()+60000)return this.token.value;
    const url=this.environment==='live'?'https://api.phonepe.com/apis/identity-manager/v1/oauth/token':`${this.base}/v1/oauth/token`;
    const res=await this.transport(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.clientId,client_version:this.clientVersion,client_secret:this.clientSecret,grant_type:'client_credentials'})});
    if(!res.ok)throw new Error('Provider authentication unavailable');
    const data=await res.json();
    if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_at))throw new Error('Invalid provider authorization');
    this.token={value:data.access_token,expires:data.expires_at*1000};return data.access_token;
  }
  private async call(path:string,body?:object){
    const token=await this.authorization();
    const res=await this.transport(`${this.base}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`O-Bearer ${token}`},body:body?JSON.stringify(body):undefined});
    if(!res.ok){if(res.status===401)this.token=undefined;throw new Error('Provider request unavailable');}
    return res.json();
  }
  async createPayment(p:PaymentContext,returnUrl:string){
    if(p.provider!==this.name||p.merchant_id!==this.merchantId||p.environment!==this.environment||p.credential_fingerprint!==this.fingerprint)throw new Error('Merchant configuration mismatch');
    const amount=Math.round(Number(p.amount)*100);
    if(p.currency!=='INR'||amount<100||!Number.isSafeInteger(amount))throw new Error('PhonePe requires at least INR 1');
    const data=await this.call('/checkout/v2/pay',{merchantOrderId:p.payment_reference,amount,expireAfter:1200,
      paymentFlow:{type:'PG_CHECKOUT',merchantUrls:{redirectUrl:returnUrl}},
      metaInfo:{udf1:p.shop_id,udf2:p.id,udf3:this.merchantId,udf4:this.fingerprint}});
    const url=new URL(data.redirectUrl);
    if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='phonepe.com'||url.hostname.endsWith('.phonepe.com')))throw new Error('Invalid provider payment URL');
    if(typeof data.orderId!=='string'||!data.orderId)throw new Error('Missing provider order');
    return {url:url.href,providerOrderId:data.orderId};
  }
  async getPaymentStatus(p:PaymentContext):Promise<VerifiedPayment>{
    if(p.provider!==this.name||p.merchant_id!==this.merchantId||p.credential_fingerprint!==this.fingerprint||p.environment!==this.environment)throw new Error('Merchant configuration changed');
    const data=await this.call(`/checkout/v2/order/${encodeURIComponent(p.payment_reference)}/status?details=true`);
    if(!['COMPLETED','FAILED','PENDING'].includes(data.state)||!Number.isSafeInteger(data.amount))throw new Error('Invalid provider status');
    // Status is scoped by merchant OAuth credentials. PhonePe v2 defines amounts
    // in INR paisa; it does not supply a currency/merchant field on every status.
    // Metadata plus stored provider order ID bind this response to this checkout.
    const meta=data.metaInfo;
    if(meta?.udf1!==p.shop_id||meta?.udf2!==p.id||meta?.udf3!==this.merchantId||meta?.udf4!==this.fingerprint||
       (data.merchantId&&data.merchantId!==this.merchantId)||(data.currency&&data.currency!=='INR')||
       (p.provider_link_id&&data.orderId!==p.provider_link_id))throw new Error('Provider order identity mismatch');
    const successes=(data.paymentDetails||[]).filter((d:{state:string})=>d.state==='COMPLETED');
    if(data.state==='COMPLETED'&&(successes.length!==1||successes[0].amount!==data.amount))throw new Error('Ambiguous provider payment');
    return {state:data.state==='COMPLETED'?'SUCCESS':data.state==='FAILED'?'FAILED':'PENDING',provider:this.name,
      reference:p.payment_reference,providerOrderId:data.orderId,merchantId:this.merchantId,shopId:p.shop_id,
      currency:'INR',amountMinor:data.amount,transactionId:successes[0]?.transactionId,environment:this.environment,fingerprint:this.fingerprint};
  }
  async verifyPayment(p:PaymentContext){const result=await this.getPaymentStatus(p);assertVerified(p,result);return result;}
  async handleWebhook(req:Request){
    // Select SHA username/password authentication in the PhonePe dashboard.
    const expected=createHash('sha256').update(`${this.webhookUser}:${this.webhookPassword}`).digest('hex');
    const supplied=req.headers.get('authorization')||'';
    if(!this.webhookUser||!this.webhookPassword||supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new Error('Invalid webhook authentication');
    const raw=await readText(req,65536);
    const data=JSON.parse(raw);
    if(!['checkout.order.completed','checkout.order.failed'].includes(data.event)||data.payload?.merchantId!==this.merchantId||
      !/^[A-Za-z0-9_-]{1,63}$/.test(data.payload?.merchantOrderId||''))throw new Error('Invalid webhook identity');
    // Authenticate/store notification only. Every success is independently fetched
    // from the provider API; replayed or modified notification bodies cannot pay.
    return {reference:data.payload.merchantOrderId,merchantId:this.merchantId,eventHash:createHash('sha256').update(raw).digest('hex')};
  }
}
