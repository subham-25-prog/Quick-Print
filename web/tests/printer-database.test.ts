import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => 'shop-one' }));
import { getShopPrinters, recordAgentHeartbeat } from '@/lib/db';

beforeEach(() => {
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.remove.mockReset();
  mocks.from.mockReset().mockImplementation((table: string) => {
    const data = table === 'printers'
      ? [{ id: 'real', name: 'Office Printer', status: 'ONLINE' }, { id: 'virtual', name: 'Microsoft Print to PDF' }]
      : null;
    const chain: any = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      upsert: (rows: unknown, options: unknown) => mocks.upsert(table, rows, options),
      delete: mocks.remove,
    };
    return chain;
  });
});

test('heartbeat sends unique physical printers in one batch', async () => {
  await recordAgentHeartbeat('agent', 'Office Printer', 'Windows', 'live', [
    'Office Printer', ' Office Printer ', 'Second Printer', 'Microsoft Print to PDF',
  ]);
  const calls = mocks.upsert.mock.calls.filter(([table]) => table === 'printers');
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toEqual([
    expect.objectContaining({ name: 'Office Printer', shop_id: 'shop-one' }),
    expect.objectContaining({ name: 'Second Printer', shop_id: 'shop-one' }),
  ]);
});

test('printer persistence errors are reported to the agent', async () => {
  mocks.upsert.mockImplementation(async (table) => ({ error: table === 'printers' ? new Error('offline') : null }));
  await expect(recordAgentHeartbeat('agent', 'Office Printer', 'Windows', 'live')).rejects.toThrow('offline');
});

test('listing filters virtual printers without database deletion or a duplicate printer query', async () => {
  const result = await getShopPrinters();
  expect(result.printers.map((p) => p.name)).toEqual(['Office Printer']);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.filter(([table]) => table === 'printers')).toHaveLength(1);
});
