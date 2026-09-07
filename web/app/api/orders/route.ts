import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {database,getActivePricing,getAllOrders} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {isAdminRequest,adminUnauthorizedResponse} from '@/lib/admin-auth';
import {apiError,HttpError,readJson,requireSameOrigin} from '@/lib/http';
import {rateLimit,hash} from '@/lib/security';
import {uuid,textField,printOptions} from '@/lib/validation';
import {calculateOrderPrice} from '@/lib/pricing';
import {paymentProvider} from '@/lib/payments';
import {openPayment} from '@/lib/payments/service';
import {createOrderAccessToken} from '@/lib/order-access';
export async function GET(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{return NextResponse.json({orders:await getAllOrders(req.nextUrl.searchParams.get('status')||'ALL')},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}
}
export async function POST(req:NextRequest){
  try{
    requireSameOrigin(req);await rateLimit(req,'checkout',10);
    if(!createOrderAccessToken(randomUUID()))throw new HttpError(503,'Checkout security is not configured.');
    const body=await readJson(req);const uploadId=uuid(body.uploadId);const key=uuid(body.idempotencyKey);
    if(body.paymentMethod && body.paymentMethod!=='UPI')throw new HttpError(400,'This installation accepts verified online payments only.');
    const token=textField(body.uploadToken,128);if(token.length!==64)throw new HttpError(404,'Upload not found.');
    const db=database(),shop=getCurrentShopId(),owner=hash(token);
    const {data:file,error}=await db.from('uploaded_files').select('*').eq('id',uploadId).eq('shop_id',shop).eq('owner_hash',owner).is('deleted_at',null).maybeSingle();
    if(error)throw error;if(!file||file.deletion_claimed_at||Date.parse(file.expires_at)<Date.now())throw new HttpError(404,'This upload has expired. Upload it again.');
    const pricing=await getActivePricing();if(pricing.form_fields?.allowUpiPayment===false)throw new HttpError(503,'Online payment is unavailable.');
    const options=printOptions(body,pricing),price=calculateOrderPrice(file.page_count,options,pricing);
    if(!Number.isFinite(price.totalAmount)||price.totalAmount<1||price.totalAmount>100000)throw new HttpError(400,'The payment total must be between ₹1 and ₹100,000.');
    const name=textField(body.customerName,100),phone=textField(body.customerPhone,20),notes=textField(body.customerNotes,1000);
    if(pricing.form_fields?.requireCustomerName&&!name)throw new HttpError(400,'Enter your name.');
    if(pricing.form_fields?.requireCustomerPhone&&!/^\+?[0-9 ]{10,15}$/.test(phone))throw new HttpError(400,'Enter a valid mobile number.');
    const requestHash=hash(JSON.stringify({uploadId,options,name,phone,notes}));
    const provider=await paymentProvider();
    const {data:previous,error:prevError}=await db.from('payments').select('*').eq('shop_id',shop).eq('owner_hash',owner).eq('idempotency_key',key).maybeSingle();
    if(prevError)throw prevError;
    if(previous){if(previous.request_hash!==requestHash)throw new HttpError(409,'Checkout already exists with different options.');return NextResponse.json(await openPayment(previous,provider));}
    const id=randomUUID();
    const record={id,shop_id:shop,uploaded_file_id:uploadId,owner_hash:owner,idempotency_key:key,request_hash:requestHash,provider:provider.name,
      merchant_id:provider.merchantId,environment:provider.environment,credential_fingerprint:provider.fingerprint,payment_reference:`QP_${id.replace(/-/g,'')}`,amount:price.totalAmount,currency:'INR',status:'PENDING',
      draft_order:{paper_size:options.paperSize,color_mode:options.colorMode,print_sides:options.printSides,copies:options.copies,add_ons:options.addOns,
        advanced_config:(options as any).advancedConfig,
        per_page_rate:price.effectiveRatePerPage,print_subtotal:price.printSubtotal,addons_subtotal:price.addOnsSubtotal,total_amount:price.totalAmount,currency:'INR',pricing_snapshot:pricing,customer_name:name,customer_phone:phone,customer_notes:notes}};
    const {data:payment,error:insert}=await db.from('payments').insert(record).select('*').single();
    if(insert){
      if(insert.code==='23505'){
        const {data:active}=await db.from('payments').select('*').eq('uploaded_file_id',uploadId).eq('shop_id',shop).in('status',['PENDING','SUCCESS']).maybeSingle();
        if(active&&active.owner_hash===owner&&active.request_hash===requestHash)return NextResponse.json(await openPayment(active,provider));
        throw new HttpError(409,'This document already has a checkout. Resume it or upload again for a new order.');
      }
      throw insert;
    }
    return NextResponse.json(await openPayment(payment,provider),{status:201});
  }catch(e){return apiError(e);}
}
