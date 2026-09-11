import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {defaultPricingConfig} from '@/lib/config';
const mocks=vi.hoisted(()=>({insert:vi.fn(),from:vi.fn(),rate:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/db',()=>({database:()=>({from:mocks.from,rpc:mocks.rpc}),getActivePricing:async()=>({...defaultPricingConfig,a4_bw_per_page:2,form_fields:{minOrderAmount:1}}),getAllOrders:vi.fn(),claimNextPrintJob:vi.fn()}));
vi.mock('@/lib/security',async importOriginal=>({...await importOriginal<any>(),rateLimit:mocks.rate}));
vi.mock('@/lib/payments',()=>({paymentProvider:async()=>({name:'direct_upi',merchantId:'shop@upi',environment:'live',fingerprint:'fp'})}));
vi.mock('@/lib/payments/service',()=>({openPayment:async(p:any)=>({paymentId:p.id,status:p.status})}));
import {POST,GET} from '@/app/api/orders/route';
import {POST as jobs} from '@/app/api/agent/jobs/route';
import {POST as upload} from '@/app/api/upload/route';
const id='00000000-0000-4000-8000-000000000003';
beforeEach(()=>{
  vi.stubEnv('QUICKPRINT_SHOP_ID','00000000-0000-4000-8000-000000000001');
  mocks.insert.mockReset();mocks.rate.mockReset();mocks.rpc.mockReset().mockResolvedValue({data:id,error:null});
  mocks.from.mockReset().mockImplementation((table:string)=>{
    const chain:any={select:()=>chain,eq:()=>chain,is:()=>chain,in:()=>chain,update:()=>chain,
      maybeSingle:async()=>({data:table==='uploaded_files'?{id,page_count:3,expires_at:new Date(Date.now()+60000).toISOString()}:null,error:null}),
      insert:(record:any)=>{mocks.insert(table,record);return {select:()=>({single:async()=>({data:record,error:null})})};}};
    return chain;
  });
});
afterEach(()=>vi.unstubAllEnvs());
function checkout(patch:object={}){
  return new NextRequest('https://shop.test/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:id,uploadToken:'a'.repeat(64),idempotencyKey:id,paperSize:'A4',colorMode:'BW',printSides:'SINGLE',copies:2,...patch})});
}
test('browser paid flag, total and page count never create an order or control price',async()=>{
  const res=await POST(checkout({payment_status:'PAID',status:'SUCCESS',totalAmount:0.01,pageCount:1}));
  expect(res.status).toBe(201);
  expect(mocks.insert).toHaveBeenCalledOnce();
  const [table,p]=mocks.insert.mock.calls[0];expect(table).toBe('payments');expect(p.amount).toBe(12);expect(p.status).toBe('PENDING');expect(p.order_id).toBeUndefined();
});
test.each([{copies:-1},{copies:0.5},{paperSize:'../../x'},{paymentMethod:'CRYPTO'},{uploadToken:'wrong'}])('tampered checkout fails without writes: %j',async patch=>{
  const res=await POST(checkout(patch));expect(res.status).toBeGreaterThanOrEqual(400);expect(mocks.insert).not.toHaveBeenCalled();
});
test('cash payment creates pending order awaiting shopkeeper verification',async()=>{
  const res=await POST(checkout({paymentMethod:'CASH'}));
  expect(res.status).toBe(201);
  const data=await res.json();
  expect(data.paymentMethod).toBe('CASH');
  expect(data.status).toBe('PENDING');
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});
test('anonymous dashboard and invalid agent are denied before database access',async()=>{
  expect((await GET(new NextRequest('https://shop.test/api/orders'))).status).toBe(401);
  expect((await jobs(new NextRequest('https://shop.test/api/agent/jobs'))).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});
test('database rate-limiter failure cannot fall back to accepting checkout',async()=>{
  mocks.rate.mockRejectedValueOnce(new Error('offline'));expect((await POST(checkout())).status).toBe(503);expect(mocks.insert).not.toHaveBeenCalled();
});
test('cross-origin checkout and oversized upload rejected without writes',async()=>{
  const req=checkout();req.headers.set('origin','https://attacker.test');expect((await POST(req)).status).toBe(403);
  expect((await upload(new NextRequest('https://shop.test/api/upload',{method:'POST',headers:{'content-length':'5000000'}}))).status).toBe(413);
  expect(mocks.insert).not.toHaveBeenCalled();
});
test('HTML disguised as PDF is rejected',async()=>{
  const body=new FormData();body.set('file',new File(['<script>alert(1)</script>'],'x.pdf',{type:'application/pdf'}));
  expect((await upload(new NextRequest('https://shop.test/api/upload',{method:'POST',body}))).status).toBe(400);
  expect(mocks.insert).not.toHaveBeenCalled();
});
