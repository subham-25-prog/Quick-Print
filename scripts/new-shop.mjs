import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),get=k=>args[args.indexOf('--'+k)+1];
const slug=args.includes('--slug')?get('slug'):'',name=args.includes('--name')?get('name'):'',url=args.includes('--url')?get('url'):'';
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60||!name||name.length>100||[...name].some(c=>c.charCodeAt(0)<32))throw new Error('Usage: node scripts/new-shop.mjs --slug abc-xerox --name "ABC Xerox" --url https://shop.example');
const origin=new URL(url);
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Use a stable HTTPS origin without paths or credentials.');
const dir=resolve(root,'generated',slug);
await mkdir(resolve(root,'generated'),{recursive:true});
await mkdir(dir); // Deliberately refuses overwriting an existing shop installation.
const shop=randomUUID(),agent=slug+'-counter-01',agentSecret=randomBytes(32).toString('hex');
const env={
  QUICKPRINT_SHOP_ID:shop,NEXT_PUBLIC_APP_URL:origin.origin,NEXT_PUBLIC_SHOP_NAME:name,
  SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',ADMIN_PIN:randomBytes(18).toString('base64url'),
  ADMIN_SESSION_SECRET:randomBytes(32).toString('hex'),ORDER_ACCESS_SECRET:randomBytes(32).toString('hex'),
  PRINT_AGENT_ID:agent,PRINT_AGENT_SECRET:agentSecret,CRON_SECRET:randomBytes(32).toString('hex'),
  DOCUMENT_RETENTION_DAYS:'3',PAYMENT_PROVIDER:'phonepe',PAYMENT_ENVIRONMENT:'sandbox',
  PHONEPE_MERCHANT_ID:'',PHONEPE_CLIENT_ID:'',PHONEPE_CLIENT_VERSION:'',PHONEPE_CLIENT_SECRET:'',
  PHONEPE_WEBHOOK_USERNAME:slug,PHONEPE_WEBHOOK_PASSWORD:randomBytes(32).toString('hex')
};
const dotenv=data=>Object.entries(data).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n';
await writeFile(resolve(dir,'.env.production.local'),dotenv(env),{flag:'wx',mode:0o600});
await writeFile(resolve(dir,'print-agent.env'),dotenv({BACKEND_URL:origin.origin,AGENT_ID:agent,PRINT_AGENT_SECRET:agentSecret,AGENT_MODE:'sandbox',SIMULATE_PRINT:'true',PRINTER_NAME:'',POLL_INTERVAL_MS:'5000',HEARTBEAT_INTERVAL_MS:'15000',DOWNLOAD_DIR:'./temp_jobs',STATE_DIR:'./state'}),{flag:'wx',mode:0o600});
const pricing=JSON.parse(await readFile(resolve(root,'web/public/config/pricing_config.json'),'utf8'));
pricing.shop_name=name;pricing.shop_phone='';pricing.shop_address='';
delete pricing.shop_upi_id;delete pricing.shop_upi_name;
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql="BEGIN;\nINSERT INTO public.shops(id,name,slug) VALUES("+[shop,name,slug].map(quote).join(',')+");\nINSERT INTO public.shop_settings(id,shop_id,pricing) VALUES("+[shop,shop,JSON.stringify(pricing)].map(quote).join(',')+"::jsonb);\nCOMMIT;\n";
await writeFile(resolve(dir,'shop.sql'),sql,{flag:'wx'});
console.log('Created installation package: '+dir+'\nFill cloud/merchant credentials privately. Follow docs/NEW_SHOP_INSTALLATION.md. Nothing was deployed or activated.');
