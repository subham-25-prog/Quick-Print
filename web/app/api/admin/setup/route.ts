import {NextRequest,NextResponse} from 'next/server';
import {database,getActivePricing,getPrintAgentInfo} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {isAdminRequest,adminUnauthorizedResponse,isAdminSecurityConfigured} from '@/lib/admin-auth';
import {configuredProvider,paymentProvider} from '@/lib/payments';
import {apiError,HttpError,readJson,requireSameOrigin} from '@/lib/http';
import {appOrigin} from '@/lib/security';
import {createOrderAccessToken} from '@/lib/order-access';
export async function GET(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{
    const checks:Record<string,boolean>={admin:isAdminSecurityConfigured(),orderAccess:!!createOrderAccessToken(getCurrentShopId()),agentSecret:(process.env.PRINT_AGENT_SECRET||'').length>=32&&!!process.env.PRINT_AGENT_ID,cron:(process.env.CRON_SECRET||'').length>=32};
    let merchant='',environment='',origin='';
    try{origin=appOrigin();checks.canonicalUrl=true;}catch{checks.canonicalUrl=false;}
    try{const p=configuredProvider();merchant=p.merchantId;environment=p.environment;checks.providerCredentials=true;}catch{checks.providerCredentials=false;}
    try{await paymentProvider();checks.merchantActivated=true;}catch{checks.merchantActivated=false;}
    try{await getActivePricing();checks.pricing=true;}catch{checks.pricing=false;}
    const agent=await getPrintAgentInfo();checks.agentOnline=agent?.status==='ONLINE';
    return NextResponse.json({checks,merchant,environment,origin,agent},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return apiError(e);}
}
export async function POST(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{
    requireSameOrigin(req);const body=await readJson(req),provider=configuredProvider();
    if(body.merchantAccountConfirmed!==true||body.merchantId!==provider.merchantId)throw new HttpError(400,'Confirm that these API credentials belong to the displayed shop merchant account.');
    appOrigin();await getActivePricing();
    if(!isAdminSecurityConfigured()||!createOrderAccessToken(getCurrentShopId())||(process.env.PRINT_AGENT_SECRET||'').length<32||!process.env.PRINT_AGENT_ID||(process.env.CRON_SECRET||'').length<32)throw new HttpError(503,'Finish security and agent configuration before activating payments.');
    const {error}=await database().from('payment_configs').upsert({shop_id:getCurrentShopId(),provider:provider.name,merchant_id:provider.merchantId,credential_fingerprint:provider.fingerprint,environment:provider.environment,enabled:true,updated_at:new Date().toISOString()});
    if(error)throw error;
    return NextResponse.json({activated:true,message:'Configuration activated. This is not proof of a successful payment or merchant settlement. Complete the acceptance tests.'});
  }catch(e){return apiError(e);}
}
