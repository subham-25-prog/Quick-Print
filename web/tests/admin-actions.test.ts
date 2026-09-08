import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), order: vi.fn() }));
vi.mock('@/lib/db', () => ({ database: () => ({ rpc: mocks.rpc }), getOrderById: mocks.order }));
vi.mock('@/lib/admin-auth', () => ({ isAdminRequest: () => true, adminUnauthorizedResponse: vi.fn() }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => '00000000-0000-4000-8000-000000000001' }));
import { POST } from '@/app/api/admin/actions/route';
const id = '00000000-0000-4000-8000-000000000003';
const request = (action: string) => new NextRequest('https://quickprint.test/api/admin/actions', { method: 'POST', headers: { origin: 'https://quickprint.test', 'content-type': 'application/json' }, body: JSON.stringify({ orderId: id, action }) });
beforeEach(() => { mocks.rpc.mockReset(); mocks.order.mockReset().mockResolvedValue({ id }); });
test.each(['VERIFY_PAYMENT', 'APPROVE_PRINT', 'MARK_PRINTED', 'REJECT', 'CANCEL'])('admin cannot override verified state with %s', async action => {
  expect((await POST(request(action))).status).toBe(409);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test('failed safe-retry RPC cannot report success', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'Already dispatched' } });
  expect((await POST(request('RETRY_PRINT'))).status).toBe(409);
});
test('safe retry succeeds only after the database accepts it', async () => {
  mocks.rpc.mockResolvedValue({ error: null });
  expect((await POST(request('RETRY_PRINT'))).status).toBe(200);
});
