import { test, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { getPdfPageCount } from '@/lib/pdf';

// Explicit opt-in: isolated, in-memory database; no cloud, payments or printer calls.
test.skipIf(process.env.QUICKPRINT_LOAD_TEST !== '1')('bounded local component load', async () => {
  const results: object[] = [];
  async function measure(name: string, count: number, concurrency: number, work: (i: number) => Promise<void>) {
    let next = 0;
    const latencies: number[] = [];
    const errors: string[] = [];
    let peakRss = process.memoryUsage().rss;
    const started = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < count) {
        const index = next++;
        const start = performance.now();
        try { await work(index); } catch (error) { errors.push(String(error)); }
        latencies.push(performance.now() - start);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }
    }));
    const elapsed = performance.now() - started;
    latencies.sort((a, b) => a - b);
    const percentile = (p: number) => Number(latencies[Math.ceil(latencies.length * p) - 1].toFixed(2));
    const row = { name, count, concurrency, failures: errors.length, elapsedMs: Math.round(elapsed),
      operationsPerSecond: Number((count / elapsed * 1000).toFixed(2)), p50Ms: percentile(.5),
      p95Ms: percentile(.95), p99Ms: percentile(.99), sampledPeakRssMB: Math.round(peakRss / 1048576), errors: errors.slice(0, 3) };
    results.push(row);
    console.log(JSON.stringify(row));
    return errors;
  }
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
      CREATE TABLE storage.objects(id UUID,bucket_id TEXT); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS UUID LANGUAGE sql AS 'SELECT gen_random_uuid()';`);
    for (const file of JSON.parse(readFileSync(resolve('../supabase/migration-order.json'), 'utf8'))) {
      await db.exec(readFileSync(resolve('../supabase', file), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, ''));
    }
    const shop = '00000000-0000-4000-8000-000000000001';
    await db.query(`INSERT INTO print_agents(agent_id,shop_id,device_name,printer_name,mode) VALUES('load-agent',$1,'load','Simulated','live')`, [shop]);
    const draft = JSON.stringify({total_amount:2,currency:'INR',paper_size:'A4',color_mode:'BW',print_sides:'SINGLE',copies:1,add_ons:{},per_page_rate:2,print_subtotal:2,addons_subtotal:0,pricing_snapshot:{}});
    const payments: string[] = [];
    // Fixture creation excluded from measured finalization time.
    for (let i = 0; i < 1000; i++) {
      const file = await db.query<{id:string}>(`INSERT INTO uploaded_files(shop_id,owner_hash,storage_path,file_name,file_size_bytes,page_count,sha256) VALUES($1,'owner',$2,'load.pdf',100,1,'hash') RETURNING id`, [shop, `load/${i}.pdf`]);
      const payment = await db.query<{id:string}>(`INSERT INTO payments(shop_id,uploaded_file_id,owner_hash,provider,payment_reference,amount,currency,merchant_id,environment,credential_fingerprint,draft_order) VALUES($1,$2,'owner','phonepe',$3,2,'INR','merchant','live','fingerprint',$4::jsonb) RETURNING id`, [shop,file.rows[0].id,`load-${i}`,draft]);
      payments.push(payment.rows[0].id);
    }
    const finalize = async (i: number) => {
      const result = await db.query<{id:string}>('SELECT finalize_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id', [shop,payments[i],'phonepe','merchant',`load-${i}`,`txn-${i}`,200,'INR','live','fingerprint']);
      expect(result.rows[0].id).toBeTruthy();
    };
    await measure('Finalize 1000 distinct payments', 1000, 25, finalize);
    await measure('Replay 1000 payment callbacks', 1000, 50, finalize);
    const counts = await db.query<{orders:number;jobs:number}>(`SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM print_jobs) AS jobs`);
    expect(counts.rows[0]).toEqual({orders:1000,jobs:1000});
    const seen = new Set<string>();
    await measure('Claim/start/acknowledge jobs (no physical printing)', 1000, 25, async () => {
      const claim = await db.query<{id:string;claim_token:string}>('SELECT * FROM claim_print_job($1,$2)',[shop,'load-agent']);
      expect(claim.rows).toHaveLength(1);
      const job = claim.rows[0];
      expect(seen.has(job.id)).toBe(false);
      seen.add(job.id);
      await db.query('SELECT start_print_job($1,$2,$3,$4)',[shop,'load-agent',job.id,job.claim_token]);
      await db.query('SELECT finish_print_job($1,$2,$3,$4,$5)',[shop,'load-agent',job.id,job.claim_token,'SUBMITTED']);
    });
    expect(seen.size).toBe(1000);
    expect((await db.query(`SELECT * FROM print_jobs WHERE status <> 'SUBMITTED'`)).rows).toHaveLength(0);
    let allowed = 0;
    await measure('Rate limiter burst: 1000 requests, limit 10', 1000, 100, async () => {
      const response = await db.query<{allowed:boolean}>("SELECT consume_rate_limit('load-burst',10,3600) AS allowed");
      if (response.rows[0].allowed) allowed++;
    });
    expect(allowed).toBe(10);
    for (const pages of [10, 1000]) {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < pages; i++) pdf.addPage();
      const bytes = await pdf.save();
      await getPdfPageCount(bytes); // warm-up
      for (const concurrency of [1, 10, 50]) {
        await measure(`Parse ${pages}-page synthetic PDF (${bytes.length} bytes)`, pages === 10 ? 500 : 100, concurrency, async () => {
          expect(await getPdfPageCount(bytes)).toBe(pages);
        });
      }
    }
  } finally {
    await db.close();
    mkdirSync(resolve('../docs/load-results'), {recursive:true});
    writeFileSync(resolve('../docs/load-results/local-load.json'), JSON.stringify({
      timestamp:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,ramGB:Number((totalmem()/1073741824).toFixed(1)),
      scope:'Local component load. PGlite serializes queries on one embedded connection. No HTTP, cloud storage, merchant API, multi-session database locking, network or physical printing measured. Synthetic PDFs have blank pages, not representative scanned content. RSS sampled at operation completion; not exact peak.',results
    }, null, 2));
  }
  expect(results.every(row => (row as {failures:number}).failures === 0)).toBe(true);
}, 240000);
