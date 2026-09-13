import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: true }));
vi.mock('@/lib/db', () => ({ database: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/admin-auth', () => ({ isAdminRequest: () => mocks.admin, adminUnauthorizedResponse: () => new Response(null, {status:401}) }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => '00000000-0000-4000-8000-000000000001' }));
import { POST } from '@/app/api/admin/cash-action/route';
const id = '00000000-0000-4000-8000-000000000003';
const request = (action?: string, origin = 'https://shop.test') => new NextRequest('https://shop.test/api/admin/cash-action', {
  method:'POST', headers:{'content-type':'application/json', origin}, body:JSON.stringify({orderId:id,action}),
});
beforeEach(() => { mocks.admin = true; mocks.rpc.mockReset().mockResolvedValue({data:id,error:null}); });
test.each([undefined, '', 'accept', 'UNKNOWN'])('invalid cash action %s never defaults to acceptance', async action => {
  expect((await POST(request(action))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test('cash action requires admin and same origin', async () => {
  mocks.admin = false;
  expect((await POST(request('ACCEPT'))).status).toBe(401);
  mocks.admin = true;
  expect((await POST(request('ACCEPT', 'https://other.test'))).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test.each(['ACCEPT','REJECT'])('cash %s uses only the guarded transaction', async action => {
  expect((await POST(request(action))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('resolve_cash_payment', {
    p_shop_id:'00000000-0000-4000-8000-000000000001',p_reference:id,p_action:action,
  });
});
test('missing migration or rejected state fails without an unsafe fallback', async () => {
  mocks.rpc.mockResolvedValue({error:{code:'PGRST202'},data:null});
  expect((await POST(request('ACCEPT'))).status).toBe(409);
});
test('review case cannot report queued success', async () => {
  mocks.rpc.mockResolvedValue({error:null,data:null});
  expect((await POST(request('ACCEPT'))).status).toBe(409);
});
