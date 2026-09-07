import { PhonePeProvider } from './phonepe';
import { database } from '../db';
import { getCurrentShopId } from '../shop';
import { HttpError } from '../http';
export function configuredProvider(){
  if(process.env.PAYMENT_PROVIDER!=='phonepe')throw new HttpError(503,'Online payment is unavailable. Please contact the shopkeeper.');
  const fields=['PHONEPE_MERCHANT_ID','PHONEPE_CLIENT_ID','PHONEPE_CLIENT_VERSION','PHONEPE_CLIENT_SECRET','PHONEPE_WEBHOOK_USERNAME','PHONEPE_WEBHOOK_PASSWORD'] as const;
  for(const f of fields)if(!process.env[f])throw new HttpError(503,'Online payment setup is incomplete.');
  const mode=process.env.PAYMENT_ENVIRONMENT;
  if(mode!=='live'&&mode!=='sandbox')throw new HttpError(503,'Payment environment is not configured.');
  const p=new PhonePeProvider(process.env.PHONEPE_MERCHANT_ID!,mode,process.env.PHONEPE_CLIENT_ID!,process.env.PHONEPE_CLIENT_VERSION!,process.env.PHONEPE_CLIENT_SECRET!,process.env.PHONEPE_WEBHOOK_USERNAME!,process.env.PHONEPE_WEBHOOK_PASSWORD!);
  return p;
}
export async function paymentProvider(){
  const p=configuredProvider();
  const {data,error}=await database().from('payment_configs').select('*').eq('shop_id',getCurrentShopId()).maybeSingle();
  if(error)throw error;
  if(!data?.enabled||data.provider!==p.name||data.merchant_id!==p.merchantId||data.environment!==p.environment||data.credential_fingerprint!==p.fingerprint)throw new HttpError(503,'The shop merchant configuration has not been activated.');
  return p;
}
