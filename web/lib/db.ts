import { Order, PricingConfig, PrintAgentInfo } from '@/types';
import { getAdminClient } from './supabase/admin';
import { getCurrentShopId } from './shop';
import { defaultPricingConfig } from './config';
import { HttpError } from './http';
import { validatePricing } from './validation';

export function database() {
  const db=getAdminClient();
  if(!db) throw new HttpError(503,'The shop is not ready to accept orders. Please contact the shopkeeper.');
  return db;
}
export async function getActivePricing(): Promise<PricingConfig> {
  const {data,error}=await database().from('shop_settings').select('pricing').eq('shop_id',getCurrentShopId()).maybeSingle();
  if(error) throw error;
  if(!data?.pricing) throw new HttpError(503,'The shopkeeper must finish setting up pricing before checkout.');
  const {admin_pin:_pin,...pricing}=data.pricing;
  return validatePricing({...defaultPricingConfig,...pricing});
}
export async function updatePricing(patch:Partial<PricingConfig>):Promise<PricingConfig>{
  if(!patch || typeof patch!=='object' || Array.isArray(patch)) throw new HttpError(400,'Invalid pricing.');
  const db=database(); const shopId=getCurrentShopId();
  const {data,error:readError}=await db.from('shop_settings').select('pricing').eq('shop_id',shopId).maybeSingle();
  if(readError) throw readError;
  const allowed=new Set([...Object.keys(defaultPricingConfig),'shop_name','shop_slug','shop_phone','shop_address','enabled_papers','enabled_addons','custom_papers','custom_addons','form_fields']);
  const clean=Object.fromEntries(Object.entries(patch).filter(([key])=>allowed.has(key)&&key!=='admin_pin'));
  const pricing=validatePricing({...defaultPricingConfig,...data?.pricing,...clean,updated_at:new Date().toISOString()});
  const {error}=await db.from('shop_settings').upsert({id:shopId,shop_id:shopId,pricing,updated_at:new Date().toISOString()});
  if(error) throw error;
  return pricing;
}
export async function getOrderById(id:string):Promise<Order|null>{
  const {data,error}=await database().from('orders').select('*').eq('id',id).eq('shop_id',getCurrentShopId()).maybeSingle();
  if(error) throw error;
  return data as Order|null;
}
export async function getAllOrders(status='ALL'):Promise<Order[]>{
  let q=database().from('orders').select('*').eq('shop_id',getCurrentShopId()).not('payment_id','is',null).order('created_at',{ascending:false}).limit(500);
  if(status!=='ALL')q=q.eq('order_status',status);
  const {data,error}=await q;if(error)throw error;return data as Order[];
}
export async function claimNextPrintJob(agentId:string){
  const db=database();const shop=getCurrentShopId();
  const {data,error}=await db.rpc('claim_print_job',{p_shop_id:shop,p_agent_id:agentId});
  if(error)throw error;
  const job=data?.[0];if(!job)return {success:true,job:null};
  const order=await getOrderById(job.order_id);if(!order)throw new Error('Claimed order missing');
  return {success:true,job:{...job,order_number:order.order_number,file_name:order.file_name,file_type:'application/pdf',
    download_url:`/api/orders/${order.id}/file`,page_count:order.page_count,copies:order.copies,paper_size:order.paper_size,color_mode:order.color_mode,print_sides:order.print_sides,job_id:job.id}};
}
export async function recordAgentHeartbeat(agentId:string,printerName:string,systemInfo:string,mode:'live'|'sandbox'){
  const db=database();const shop=getCurrentShopId();
  const {data:existing,error:lookup}=await db.from('print_agents').select('shop_id').eq('agent_id',agentId).maybeSingle();
  if(lookup)throw lookup;
  if(existing && existing.shop_id!==shop)throw new HttpError(403,'Agent belongs to another shop.');
  const {error}=await db.from('print_agents').upsert({agent_id:agentId,shop_id:shop,device_name:agentId,printer_name:printerName,system_info:systemInfo,mode,status:'ONLINE',last_heartbeat:new Date().toISOString(),updated_at:new Date().toISOString()});
  if(error)throw error;
  const {error:printerError}=await db.from('printers').upsert({shop_id:shop,agent_id:agentId,name:printerName,system_identifier:printerName,status:'UNKNOWN',last_seen:new Date().toISOString()},{onConflict:'shop_id,system_identifier'});
  if(printerError)throw printerError;
}
export async function getPrintAgentInfo(agentId=process.env.PRINT_AGENT_ID||'agent-main-pc'):Promise<PrintAgentInfo|null>{
  const {data,error}=await database().from('print_agents').select('*').eq('agent_id',agentId).eq('shop_id',getCurrentShopId()).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  return {...data,status:Date.now()-Date.parse(data.last_heartbeat)>90000?'OFFLINE':data.status};
}
export async function cleanupOldOrders(retentionDays=3){
  if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>30)throw new HttpError(400,'Retention must be 1–30 days.');
  const db=database(),shop=getCurrentShopId();let deletedCount=0;
  const {data:files,error}=await db.rpc('claim_retention_files',{p_shop_id:shop,p_days:retentionDays});
  if(error)throw error;
  for(const file of files||[]){
    if(!file.storage_path.startsWith(shop+'/orders/'))throw new Error('Invalid retained file path');
    const {error:se}=await db.storage.from('shop-documents').remove([file.storage_path]);if(se)throw se;
    const {error:de}=await db.from('uploaded_files').update({deleted_at:new Date().toISOString()}).eq('id',file.id).eq('shop_id',shop);if(de)throw de;
    deletedCount++;
  }
  return {deletedCount};
}
