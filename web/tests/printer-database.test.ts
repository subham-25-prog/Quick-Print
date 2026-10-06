import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), upsert: vi.fn(), remove: vi.fn(), update: vi.fn(), settings: null as any, agent: null as any, printersData: null as any }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => 'shop-one' }));
import { claimNextPrintJob, getShopPrinters, recordAgentHeartbeat, setActivePrinter } from '@/lib/db';

beforeEach(() => {
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.remove.mockReset();
  mocks.update.mockReset();
  mocks.settings = null;
  mocks.agent = null;
  mocks.printersData = [
    { id: 'real', name: 'Office Printer', status: 'ONLINE' },
    { id: 'virtual', name: 'Microsoft Print to PDF' }
  ];
  mocks.from.mockReset().mockImplementation((table: string) => {
    const data = table === 'printers'
      ? mocks.printersData
      : table === 'shop_settings' ? mocks.settings : mocks.agent;
    const chain: any = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      upsert: (rows: unknown, options: unknown) => mocks.upsert(table, rows, options),
      delete: mocks.remove,
      update: (patch: unknown) => { mocks.update(table, patch); return chain; },
      in: () => chain,
    };
    return chain;
  });
});

test('empty scan retires missing devices without inventing the configured printer', async () => {
  await recordAgentHeartbeat('agent', 'Missing Printer', 'Windows', 'live', []);
  expect(mocks.upsert.mock.calls.filter(([table]) => table === 'printers')).toHaveLength(0);
  expect(mocks.update).toHaveBeenCalledWith('printers', expect.objectContaining({ status: 'OFFLINE' }));
});

test('heartbeat keeps reported availability and does not fake selection acknowledgement', async () => {
  mocks.settings = { pricing: { selected_printer: 'Second Printer' } };
  const result = await recordAgentHeartbeat('agent', 'Office Printer', 'Windows', 'live', ['Office Printer'], [
    { name: 'Office Printer', status: 'OFFLINE' },
  ]);
  expect(result.activePrinter).toBe('Second Printer');
  expect(mocks.upsert).toHaveBeenCalledWith('print_agents', expect.objectContaining({ printer_name: 'Office Printer' }), undefined);
  expect(mocks.upsert).toHaveBeenCalledWith('printers', [expect.objectContaining({ status: 'OFFLINE' })], expect.anything());
});

test('stale devices are offline and a selection stays pending until an agent reports it', async () => {
  mocks.printersData = [
    { id: 'real', name: 'Office Printer', status: 'ONLINE' },
    { id: 'p2', name: 'Second Printer', status: 'OFFLINE' },
    { id: 'virtual', name: 'Microsoft Print to PDF' }
  ];
  mocks.settings = { pricing: { selected_printer: 'Second Printer' } };
  mocks.agent = { printer_name: 'Office Printer', status: 'ONLINE', last_heartbeat: new Date().toISOString(), mode: 'live' };
  const result = await getShopPrinters();
  expect(result.selectionPending).toBe(true);
  expect(result.printers.find((p) => p.name === 'Office Printer')?.status).toBe('OFFLINE');
  expect(result.printers.find((p) => p.name === 'Second Printer')?.status).toBe('OFFLINE');
  mocks.agent.printer_name = 'Second Printer';
  expect((await getShopPrinters()).selectionPending).toBe(false);
});

test('unconnected printer from foreign settings is never shown in the list', async () => {
  mocks.printersData = [{ id: 'real', name: 'Office Printer', status: 'ONLINE' }];
  mocks.settings = { pricing: { selected_printer: 'Foreign Shop Printer' } };
  const result = await getShopPrinters();
  expect(result.printers.find((p) => p.name === 'Foreign Shop Printer')).toBeUndefined();
  expect(result.printers.map((p) => p.name)).toEqual(['Office Printer']);
});

test('saving a selection never rewrites the agent reported printer', async () => {
  await expect(setActivePrinter('Second Printer')).resolves.toBe('Second Printer');
  expect(mocks.update).not.toHaveBeenCalled();
  await expect(setActivePrinter('Sandbox simulation')).rejects.toThrow('physical printer');
});

test('queue stays paused until the agent confirms a newly selected default printer', async () => {
  mocks.settings = { pricing: { selected_printer: 'Photo Printer' } };
  mocks.agent = {
    printer_name: 'Office Printer',
    status: 'ONLINE',
    last_heartbeat: new Date().toISOString(),
  };

  await expect(claimNextPrintJob('agent')).resolves.toEqual({ success: true, job: null });
  expect(mocks.rpc).not.toHaveBeenCalled();
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
