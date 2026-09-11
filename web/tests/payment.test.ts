import {expect,test,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {PhonePeProvider} from '@/lib/payments/phonepe';
import {assertVerified,PaymentContext} from '@/lib/payments/provider';
function fixture(state='COMPLETED'){
  const transport=vi.fn();const provider=new PhonePeProvider('merchant','sandbox','client','1','secret','webhook-user','webhook-pass',transport);
  const p:PaymentContext={id:'payment',provider:'phonepe',shop_id:'shop',payment_reference:'ref',amount:12,currency:'INR',merchant_id:'merchant',environment:'sandbox',credential_fingerprint:provider.fingerprint,provider_link_id:'provider-order'};
  const response={orderId:'provider-order',state,amount:1200,metaInfo:{udf1:'shop',udf2:'payment',udf3:'merchant',udf4:provider.fingerprint},paymentDetails:[{state,amount:1200,transactionId:'txn'}]};
  transport.mockResolvedValueOnce(Response.json({access_token:'token',expires_at:Date.now()/1000+3600})).mockResolvedValueOnce(Response.json(response));
  return{provider,p,response,transport};
}
test('authenticated provider status verifies success',async()=>{const f=fixture();const r=await f.provider.verifyPayment(f.p);expect(r.state).toBe('SUCCESS');expect(f.transport.mock.calls[1][0]).toContain('/checkout/v2/order/ref/status');});
test.each(['PENDING','FAILED'])('%s never verifies payment',async state=>{const f=fixture(state);await expect(f.provider.verifyPayment(f.p)).rejects.toThrow();});
test.each(['amount','merchant','shop','order','currency','transaction'])('%s mismatch rejects success',async field=>{
  const f=fixture();
  if(field==='amount')f.response.amount=1;
  if(field==='merchant')f.response.metaInfo.udf3='other';
  if(field==='shop')f.response.metaInfo.udf1='other';
  if(field==='order')f.response.orderId='other';
  if(field==='currency')f.p.currency='USD';
  if(field==='transaction')f.response.paymentDetails[0].transactionId='';
  f.transport.mockReset().mockResolvedValueOnce(Response.json({access_token:'token',expires_at:Date.now()/1000+3600})).mockResolvedValueOnce(Response.json(f.response));
  await expect(f.provider.verifyPayment(f.p)).rejects.toThrow();
});
test('forged and wrong-merchant webhook rejected; valid notification carries no paid status',async()=>{
  const f=fixture();
  const payload={event:'checkout.order.completed',payload:{merchantId:'merchant',merchantOrderId:'ref',state:'COMPLETED'}};
  await expect(f.provider.handleWebhook(new Request('https://test',{method:'POST',body:JSON.stringify(payload)}))).rejects.toThrow();
  const authorization=createHash('sha256').update('webhook-user:webhook-pass').digest('hex');
  const e=await f.provider.handleWebhook(new Request('https://test',{method:'POST',headers:{authorization},body:JSON.stringify(payload)}));
  expect(e).not.toHaveProperty('state');expect(e.reference).toBe('ref');
  payload.payload.merchantId='other';await expect(f.provider.handleWebhook(new Request('https://test',{method:'POST',headers:{authorization},body:JSON.stringify(payload)}))).rejects.toThrow();
});
test('untrusted browser-like success does not satisfy normalized proof',()=>{const f=fixture();expect(()=>assertVerified(f.p,{state:'SUCCESS'} as never)).toThrow();});
test('whitespace and tab padded provider metadata is correctly trimmed and accepted',async()=>{
  const f=fixture();
  f.response.metaInfo.udf3='\tmerchant\n';
  f.response.metaInfo.udf1='  shop ';
  f.response.merchantId='  merchant ';
  f.transport.mockReset().mockResolvedValueOnce(Response.json({access_token:'token',expires_at:Date.now()/1000+3600})).mockResolvedValueOnce(Response.json(f.response));
  const r=await f.provider.verifyPayment(f.p);
  expect(r.state).toBe('SUCCESS');
});
test('production configuration never selects mock provider',async()=>{vi.stubEnv('PAYMENT_PROVIDER','mock');const{paymentProvider}=await import('@/lib/payments');await expect(paymentProvider()).rejects.toThrow('unavailable');vi.unstubAllEnvs();});

test('DirectUpiProvider formats standard NPCI UPI URI and generates dynamic QR code', async () => {
  const { DirectUpiProvider } = await import('@/lib/payments/direct-upi');
  const provider = new DirectUpiProvider('shop@upi', 'Test Shop');
  const uri = provider.generateUpiUri({
    upiId: 'shop@upi',
    payeeName: 'Test Shop',
    amount: 25.5,
    orderReference: 'QP-99999',
    note: 'Print Order QP-99999',
  });
  expect(uri).toContain('upi://pay?');
  expect(uri).toContain('pa=shop%40upi');
  expect(uri).toContain('pn=Test+Shop');
  expect(uri).toContain('am=25.50');
  expect(uri).toContain('cu=INR');
  expect(uri).toContain('tr=QP-99999');

  const qrDataUrl = await provider.generateDynamicQrDataUrl(uri);
  expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

  const payment = await provider.createPayment(
    {
      id: 'pay-1',
      provider: 'direct_upi',
      shop_id: 'shop-1',
      payment_reference: 'QP-99999',
      amount: 25.5,
      currency: 'INR',
      merchant_id: 'shop@upi',
      environment: 'live',
      credential_fingerprint: provider.fingerprint,
      provider_link_id: 'QP-99999',
    },
    'https://example.com/return'
  );
  expect(payment.upiUri).toBe(uri);
  expect(payment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(payment.providerOrderId).toBe('QP-99999');
});

test('DirectUpiProvider rejects verification without backend proof', async () => {
  const { DirectUpiProvider } = await import('@/lib/payments/direct-upi');
  const provider = new DirectUpiProvider();
  const p: PaymentContext = {
    id: 'pay-1',
    provider: 'direct_upi',
    shop_id: 'shop-1',
    payment_reference: 'QP-99999',
    amount: 25.5,
    currency: 'INR',
    merchant_id: 'shop@upi',
    environment: 'production',
    credential_fingerprint: provider.fingerprint,
    provider_link_id: 'QP-99999',
  };
  await expect(provider.verifyPayment(p)).rejects.toThrow('Payment verification mismatch');
});
