import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterAll, expect, test } from 'vitest';

let db: PGlite;
const shop='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const user='10000000-0000-4000-8000-000000000001';
let payment: string;
let order: string;
let job: {id:string;claim_token:string};
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(id UUID,bucket_id TEXT); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS UUID LANGUAGE sql AS 'SELECT gen_random_uuid()';`);
  // PGlite uses PostgreSQL; uuid-ossp alone is shimmed with core gen_random_uuid.
  for(const file of JSON.parse(readFileSync(resolve('../supabase/migration-order.json'),'utf8'))) {
    const sql=readFileSync(resolve('../supabase',file),'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g,'');
    await db.exec(sql);
  }
  await db.exec(`INSERT INTO shops(id,name,slug) VALUES('${other}','Other','other');
    INSERT INTO auth.users VALUES('${user}'); INSERT INTO shop_members VALUES('${shop}','${user}','OWNER',now());
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    INSERT INTO print_agents(agent_id,shop_id,device_name,printer_name,mode) VALUES('agent-one','${shop}','one','Printer','live'),('agent-two','${other}','two','Printer','live');`);
});
afterAll(async()=>db?.close());
test('Storage restrictive policy defeats permissive legacy policies for customer documents',async()=>{
  await db.exec("INSERT INTO storage.objects VALUES(gen_random_uuid(),'shop-documents'); GRANT USAGE ON SCHEMA storage TO anon; GRANT SELECT ON storage.objects TO anon; CREATE POLICY legacy_all ON storage.objects FOR SELECT TO anon USING(true); SET ROLE anon;");
  expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0);
  await db.exec('RESET ROLE;');
});
test('migration has RLS on all application tables',async()=>{
  const result=await db.query<{relrowsecurity:boolean}>(`SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`);
  expect(result.rows.every(r=>r.relrowsecurity)).toBe(true);
});
test('unpaid order insert is rejected',async()=>{
  await expect(db.exec(`INSERT INTO orders(id,shop_id,order_number,file_name,storage_path,file_type,per_page_rate,print_subtotal,total_amount,pricing_snapshot,payment_status,order_status) VALUES(gen_random_uuid(),'${shop}','forged','x','x','application/pdf',1,1,1,'{}','PAID','CONFIRMED')`)).rejects.toThrow('verified payment required');
});
test('payment amount, merchant, currency, shop and transaction validated; success creates one order and job',async()=>{
  const f=await db.query<{id:string}>(`INSERT INTO uploaded_files(shop_id,owner_hash,storage_path,file_name,file_size_bytes,page_count,sha256) VALUES('${shop}','owner','${shop}/orders/test.pdf','test.pdf',100,3,'hash') RETURNING id`);
  const p=await db.query<{id:string}>(`INSERT INTO payments(shop_id,uploaded_file_id,owner_hash,provider,payment_reference,amount,currency,merchant_id,environment,credential_fingerprint,draft_order) VALUES($1,$2,'owner','phonepe','ref-test',12,'INR','merchant','live','fingerprint',$3::jsonb) RETURNING id`,[shop,f.rows[0].id,JSON.stringify({total_amount:12,currency:'INR',paper_size:'A4',color_mode:'BW',print_sides:'SINGLE',copies:2,add_ons:{},per_page_rate:2,print_subtotal:12,addons_subtotal:0,pricing_snapshot:{}})]);
  payment=p.rows[0].id;
  const args=[shop,payment,'phonepe','merchant','ref-test','txn-test',1200,'INR','live','fingerprint'];
  for(const [index,bad] of [[0,other],[2,'mock'],[3,'wrong'],[4,'other'],[6,1],[7,'USD'],[8,'sandbox'],[9,'other']] as const){
    const values=[...args];values[index]=bad;
    await expect(db.query('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',values)).rejects.toThrow('payment verification mismatch');
  }
  const result=await db.query<{id:string}>('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',args);
  order=result.rows[0].id;
  await db.query('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);
  expect((await db.query('SELECT * FROM print_jobs')).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM orders')).rows).toHaveLength(1);
});
test('wrong-shop claims empty; overlapping workers get only one claim; fence token required',async()=>{
  expect((await db.query(`SELECT * FROM claim_print_job('${other}','agent-two')`)).rows).toHaveLength(0);
  const results=await Promise.all([db.query<{id:string;claim_token:string}>(`SELECT * FROM claim_print_job('${shop}','agent-one')`),db.query(`SELECT * FROM claim_print_job('${shop}','agent-one')`)]);
  expect(results.map(r=>r.rows.length).sort()).toEqual([0,1]);
  job=results[0].rows[0];
  const staleToken=job.claim_token;
  await db.query("UPDATE print_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
  job=(await db.query<{id:string;claim_token:string}>(`SELECT * FROM claim_print_job('${shop}','agent-one')`)).rows[0];
  expect(job.claim_token).not.toBe(staleToken);
  await expect(db.query('SELECT start_print_job($1,$2,$3,$4)',[shop,'agent-one',job.id,staleToken])).rejects.toThrow();
  await expect(db.query(`SELECT start_print_job($1,$2,$3,$4)`,[other,'agent-two',job.id,job.claim_token])).rejects.toThrow();
  await expect(db.query(`SELECT start_print_job($1,$2,$3,$4)`,[shop,'agent-one',job.id,other])).rejects.toThrow();
  await db.query(`SELECT start_print_job($1,$2,$3,$4)`,[shop,'agent-one',job.id,job.claim_token]);
  await expect(db.query(`SELECT start_print_job($1,$2,$3,$4)`,[shop,'agent-one',job.id,job.claim_token])).rejects.toThrow();
});
test('acknowledgements idempotent; submitted job never reissued or regressed by callback',async()=>{
  const args=[shop,'agent-one',job.id,job.claim_token,'SUBMITTED'];
  await db.query('SELECT finish_print_job($1,$2,$3,$4,$5)',args);
  await db.query('SELECT finish_print_job($1,$2,$3,$4,$5)',args);
  await db.query('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[shop,payment,'phonepe','merchant','ref-test','txn-test',1200,'INR','live','fingerprint']);
  expect((await db.query<{order_status:string}>('SELECT order_status FROM orders WHERE id=$1',[order])).rows[0].order_status).toBe('SUBMITTED');
  expect((await db.query(`SELECT * FROM claim_print_job('${shop}','agent-one')`)).rows).toHaveLength(0);
  await expect(db.query('SELECT retry_safe_print($1,$2)',[shop,order])).rejects.toThrow();
});
test('RLS staff of another shop cannot read; browser cannot write payments/jobs or execute privileged functions',async()=>{
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  expect((await db.query('SELECT * FROM orders')).rows).toHaveLength(1);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false);`);
  expect((await db.query('SELECT * FROM orders')).rows).toHaveLength(0);
  await expect(db.exec(`UPDATE payments SET status='SUCCESS'`)).rejects.toThrow('permission denied');
  await expect(db.exec(`INSERT INTO print_jobs(order_id,shop_id) VALUES('${order}','${other}')`)).rejects.toThrow('permission denied');
  await expect(db.exec(`SELECT * FROM claim_print_job('${shop}','agent-one')`)).rejects.toThrow('permission denied');
  await db.exec('RESET ROLE; SET ROLE anon;');
  await expect(db.exec('SELECT * FROM orders')).rejects.toThrow('permission denied');
  await db.exec('RESET ROLE;');
});
test('rate limit is persistent and atomic',async()=>{
  const result=await Promise.all(Array.from({length:4},()=>db.query<{allowed:boolean}>("SELECT consume_rate_limit('test',2,60) AS allowed")));
  expect(result.filter(r=>r.rows[0].allowed)).toHaveLength(2);
});
test('retention claims are retryable and block new checkout on a removed document',async()=>{
  const f=(await db.query<{id:string}>(`INSERT INTO uploaded_files(shop_id,owner_hash,storage_path,file_name,file_size_bytes,page_count,sha256,created_at) VALUES('${shop}','owner','${shop}/orders/retention.pdf','x.pdf',100,1,'hash',now()-interval '4 days') RETURNING id`)).rows[0];
  expect((await db.query('SELECT * FROM claim_retention_files($1,3)',[shop])).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM claim_retention_files($1,3)',[shop])).rows).toHaveLength(1);
  await expect(db.query("INSERT INTO payments(shop_id,uploaded_file_id,owner_hash,provider,payment_reference,amount) VALUES($1,$2,'owner','phonepe','deleted-file',1)",[shop,f.id])).rejects.toThrow('upload unavailable');
});
test('dashboard aggregates real data and agent shop binding is immutable',async()=>{
  const result=await db.query<{stats:{today_orders:number;today_revenue:number}}>('SELECT shop_dashboard_stats($1) AS stats',[shop]);
  expect(result.rows[0].stats.today_orders).toBe(1);expect(result.rows[0].stats.today_revenue).toBe(12);
  await expect(db.query("UPDATE print_agents SET shop_id=$1 WHERE agent_id='agent-one'",[other])).rejects.toThrow('immutable');
});
test('late success on a retried payment creates one job; second payment is held for review',async()=>{
  const f=(await db.query<{id:string}>(`INSERT INTO uploaded_files(shop_id,owner_hash,storage_path,file_name,file_size_bytes,page_count,sha256) VALUES('${shop}','owner','${shop}/orders/late.pdf','late.pdf',100,1,'hash') RETURNING id`)).rows[0];
  const draft=JSON.stringify({total_amount:2,currency:'INR',paper_size:'A4',color_mode:'BW',print_sides:'SINGLE',copies:1,add_ons:{},per_page_rate:2,print_subtotal:2,addons_subtotal:0,pricing_snapshot:{}});
  const attempts:string[]=[];
  for(const [ref,status] of [['late-first','FAILED'],['late-second','PENDING']]){
    const p=await db.query<{id:string}>("INSERT INTO payments(shop_id,uploaded_file_id,owner_hash,provider,payment_reference,amount,currency,merchant_id,environment,credential_fingerprint,draft_order,status) VALUES($1,$2,'owner','phonepe',$3,2,'INR','merchant','live','fingerprint',$4::jsonb,$5) RETURNING id",[shop,f.id,ref,draft,status]);
    attempts.push(p.rows[0].id);
  }
  const first=await db.query<{id:string}>('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',[shop,attempts[0],'phonepe','merchant','late-first','late-txn-1',200,'INR','live','fingerprint']);
  expect(first.rows[0].id).toBeTruthy();
  const second=await db.query<{id:string|null}>('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',[shop,attempts[1],'phonepe','merchant','late-second','late-txn-2',200,'INR','live','fingerprint']);
  expect(second.rows[0].id).toBeNull();
  expect((await db.query('SELECT * FROM orders WHERE uploaded_file_id=$1',[f.id])).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM print_jobs WHERE order_id=$1',[first.rows[0].id])).rows).toHaveLength(1);
  expect((await db.query<{review_required:boolean}>('SELECT review_required FROM payments WHERE id=$1',[attempts[1]])).rows[0].review_required).toBe(true);
});
test('delete_orders RPC clears completed orders including SUBMITTED and cleans up cascade relations',async()=>{
  const delRes=await db.query<{deleted_count:number}>("SELECT * FROM delete_orders($1, NULL, 'COMPLETED')",[shop]);
  expect(delRes.rows[0].deleted_count).toBeGreaterThanOrEqual(1);
  expect((await db.query('SELECT * FROM orders WHERE id=$1',[order])).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM payments WHERE id=$1',[payment])).rows).toHaveLength(0);
});
test('delete_orders RPC cleans up unlinked cash payments',async()=>{
  const f=(await db.query<{id:string}>(`INSERT INTO uploaded_files(shop_id,owner_hash,storage_path,file_name,file_size_bytes,page_count,sha256) VALUES('${shop}','owner_cash','${shop}/orders/cash_standalone.pdf','cash_standalone.pdf',100,1,'hash_cash') RETURNING id`)).rows[0];
  const cashP=(await db.query<{id:string}>(`INSERT INTO payments(shop_id,uploaded_file_id,owner_hash,provider,payment_reference,amount,currency,merchant_id,environment,credential_fingerprint,draft_order,status) VALUES($1,$2,'owner_cash','cash','ref-cash-test',10,'INR','cash','sandbox','cash','{}'::jsonb,'PENDING') RETURNING id`,[shop,f.id])).rows[0];
  const delRes=await db.query<{deleted_count:number}>("SELECT * FROM delete_orders($1, $2, 'SELECTED')",[shop,[cashP.id]]);
  expect(delRes.rows[0].deleted_count).toBe(1);
  expect((await db.query('SELECT * FROM payments WHERE id=$1',[cashP.id])).rows).toHaveLength(0);
});
