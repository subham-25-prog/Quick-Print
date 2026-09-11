import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ provider: vi.fn(), cleanup: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/db', () => ({ database: () => ({ from: mocks.from }), cleanupOldOrders: mocks.cleanup }));
vi.mock('@/lib/payments', () => ({ paymentProvider: mocks.provider }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => 'shop-test' }));
import { GET } from '@/app/api/maintenance/route';
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's'.repeat(32));
  mocks.provider.mockReset(); mocks.cleanup.mockReset().mockResolvedValue({ deletedCount: 2 });
  mocks.from.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    for (const key of ['select','eq','is','lte','order','delete']) q[key] = () => q;
    q.limit = () => Promise.resolve({ data: [], error: null });
    q.lt = () => Promise.resolve({ error: null });
    return q;
  });
});
test('fresh installation runs retention without gateway credentials when nothing needs reconciliation', async () => {
  const response = await GET(new NextRequest('https://shop.test/api/maintenance', { headers: { authorization: `Bearer ${'s'.repeat(32)}` } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ checked: 0, failed: 0, deletedCount: 2 });
  expect(mocks.provider).not.toHaveBeenCalled();
});
test('unauthenticated maintenance performs no cleanup', async () => {
  expect((await GET(new NextRequest('https://shop.test/api/maintenance'))).status).toBe(401);
  expect(mocks.cleanup).not.toHaveBeenCalled();
});
