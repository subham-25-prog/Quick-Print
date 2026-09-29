import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getShopPrinters, recordAgentHeartbeat, setActivePrinter, deleteShopPrinter } from '@/lib/db';
import { WindowsPrinterService } from '../../print-agent/src/printer';
import { AgentWorker } from '../../print-agent/src/worker';
import { Journal } from '../../print-agent/src/journal';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  settings: null as any,
  agent: null as any,
  printersData: [] as any[],
}));

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/shop', () => ({ getCurrentShopId: () => 'shop-alpha' }));

describe('Printer Flow & Lifecycle Requirements', () => {
  beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.delete.mockReset().mockResolvedValue({ error: null });
    mocks.update.mockReset().mockResolvedValue({ error: null });
    mocks.settings = null;
    mocks.agent = null;
    mocks.printersData = [];

    mocks.from.mockImplementation((table: string) => {
      const data =
        table === 'printers'
          ? mocks.printersData
          : table === 'shop_settings'
            ? mocks.settings
            : mocks.agent;

      const chain: any = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        order: () => chain,
        limit: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data, error: null }),
        single: async () => ({ data, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
        upsert: (rows: unknown, options: unknown) => {
          mocks.upsert(table, rows, options);
          return Promise.resolve({ error: null });
        },
        delete: () => {
          mocks.delete(table);
          return chain;
        },
        update: (patch: unknown) => {
          mocks.update(table, patch);
          return chain;
        },
      };
      return chain;
    });
  });

  // Case 1: Empty Case
  test('1. Empty Case: No printer connected shows honest empty state with zero fallback or demo printers', async () => {
    // No printers detected, agent has empty scan
    mocks.printersData = [];
    mocks.settings = { pricing: { shop_name: 'Alpha Shop', selected_printer: null } };
    mocks.agent = {
      printer_name: 'Unavailable',
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      mode: 'live',
    };

    const result = await getShopPrinters();
    expect(result.printers).toHaveLength(0);
    expect(result.activePrinter).toBeNull();
    expect(result.selectionPending).toBe(false);

    // Even if shop settings had a stale or demo printer name configured, it is NEVER synthesized into printers list
    mocks.settings = { pricing: { shop_name: 'Alpha Shop', selected_printer: 'HP LaserJet 1020 Demo' } };
    const resultWithStaleSettings = await getShopPrinters();
    expect(resultWithStaleSettings.printers).toHaveLength(0);
    expect(resultWithStaleSettings.activePrinter).toBeNull();
  });

  // Case 2: Newly Connected Case
  test('2. Newly Connected Case: First detected printer is recorded as ONLINE and becomes active default', async () => {
    const nowIso = new Date().toISOString();
    // Agent sends heartbeat with newly connected printer
    await recordAgentHeartbeat(
      'agent-alpha',
      'Canon LBP2900',
      'Windows 11',
      'live',
      ['Canon LBP2900'],
      [{ id: 'CANON-USB-01', name: 'Canon LBP2900', status: 'ONLINE' }]
    );

    expect(mocks.upsert).toHaveBeenCalledWith(
      'printers',
      [
        expect.objectContaining({
          shop_id: 'shop-alpha',
          name: 'Canon LBP2900',
          system_identifier: 'CANON-USB-01',
          status: 'ONLINE',
        }),
      ],
      expect.anything()
    );

    // Now populate database with newly connected printer
    mocks.printersData = [
      {
        id: 'p-1',
        name: 'Canon LBP2900',
        status: 'ONLINE',
        last_seen: nowIso,
        system_identifier: 'CANON-USB-01',
      },
    ];
    mocks.agent = {
      printer_name: 'Canon LBP2900',
      status: 'ONLINE',
      last_heartbeat: nowIso,
      mode: 'live',
    };

    const result = await getShopPrinters();
    expect(result.printers).toHaveLength(1);
    expect(result.printers[0]).toEqual(
      expect.objectContaining({
        name: 'Canon LBP2900',
        status: 'ONLINE',
        is_selected: true,
      })
    );
    expect(result.activePrinter).toBe('Canon LBP2900');
  });

  // Case 3: Multiple Printer Case
  test('3. Multiple Printer Case: Multiple detected printers can be selected as default, saving choice for shop', async () => {
    const nowIso = new Date().toISOString();
    mocks.printersData = [
      { id: 'p-1', name: 'Canon LBP2900', status: 'ONLINE', last_seen: nowIso },
      { id: 'p-2', name: 'Epson L3150', status: 'ONLINE', last_seen: nowIso },
    ];
    mocks.agent = {
      printer_name: 'Canon LBP2900',
      status: 'ONLINE',
      last_heartbeat: nowIso,
      mode: 'live',
    };

    // Before explicit selection, Canon is active from agent
    let res = await getShopPrinters();
    expect(res.printers).toHaveLength(2);
    expect(res.activePrinter).toBe('Canon LBP2900');

    // Shopkeeper sets Epson L3150 as default
    await setActivePrinter('Epson L3150');
    expect(mocks.upsert).toHaveBeenCalledWith(
      'shop_settings',
      expect.objectContaining({
        pricing: expect.objectContaining({ selected_printer: 'Epson L3150' }),
      }),
      expect.anything()
    );

    // Update settings mock to reflect save
    mocks.settings = { pricing: { selected_printer: 'Epson L3150' } };
    res = await getShopPrinters();
    expect(res.activePrinter).toBe('Epson L3150');
    expect(res.printers.find((p) => p.name === 'Epson L3150')?.is_selected).toBe(true);
    expect(res.printers.find((p) => p.name === 'Canon LBP2900')?.is_selected).toBe(false);
  });

  // Case 4: Disconnected Case
  test('4. Disconnected Case: Default printer going offline is marked OFFLINE and agent refuses to claim or send to another printer', async () => {
    const nowIso = new Date().toISOString();
    // Default printer is Epson L3150, but it is now OFFLINE
    mocks.settings = { pricing: { selected_printer: 'Epson L3150' } };
    mocks.printersData = [
      { id: 'p-1', name: 'Canon LBP2900', status: 'ONLINE', last_seen: nowIso },
      { id: 'p-2', name: 'Epson L3150', status: 'OFFLINE', last_seen: new Date(Date.now() - 150000).toISOString() },
    ];
    mocks.agent = {
      printer_name: 'Epson L3150',
      status: 'ONLINE',
      last_heartbeat: nowIso,
      mode: 'live',
    };

    const res = await getShopPrinters();
    const epson = res.printers.find((p) => p.name === 'Epson L3150');
    expect(epson?.status).toBe('OFFLINE');
    expect(epson?.is_selected).toBe(true);

    // Agent behavior: ensureReady throws error if configured printer is offline
    const service = new WindowsPrinterService('Epson L3150', false);
    // Mock cached printers on the service where Epson is OFFLINE
    (service as any).cachedPrinters = [
      { name: 'Canon LBP2900', status: 'ONLINE' },
      { name: 'Epson L3150', status: 'OFFLINE' },
    ];

    await expect(service.ensureReady()).rejects.toThrow('offline');

    // Worker test: AgentWorker refuses to claim or print when ensureReady fails
    const mockClient = {
      claimNextJob: vi.fn(),
      downloadDocument: vi.fn(),
      startJob: vi.fn(),
      reportJobCompletion: vi.fn(),
    };
    const mockPrinter = {
      ensureReady: vi.fn().mockRejectedValue(new Error('Configured printer is offline')),
      printDocument: vi.fn(),
    };
    const tempDir = mkdtempSync(join(tmpdir(), 'qp-test-'));
    const journal = new Journal(join(tempDir, 'journal.jsonl'));
    const worker = new AgentWorker(mockClient, mockPrinter, journal, tempDir);

    await expect(worker.tick()).rejects.toThrow('Configured printer is offline');
    expect(mockClient.claimNextJob).not.toHaveBeenCalled();
    expect(mockPrinter.printDocument).not.toHaveBeenCalled();
  });

  // Case 5: Previously Connected Case
  test('5. Previously Connected Case: Disconnected devices remain in list as OFFLINE until forgotten', async () => {
    const nowIso = new Date().toISOString();
    // Shop had Canon LBP2900 connected previously, but it is now unplugged and missing from scan
    mocks.printersData = [
      { id: 'p-1', name: 'Canon LBP2900', status: 'OFFLINE', last_seen: new Date(Date.now() - 200000).toISOString() },
    ];
    mocks.agent = {
      printer_name: 'Unavailable',
      status: 'ONLINE',
      last_heartbeat: nowIso,
      mode: 'live',
    };

    // Even though agent currently reports no active physical printer, the previously connected printer is kept as OFFLINE
    let res = await getShopPrinters();
    expect(res.printers).toHaveLength(1);
    expect(res.printers[0].name).toBe('Canon LBP2900');
    expect(res.printers[0].status).toBe('OFFLINE');

    // Shopkeeper clicks "Forget printer"
    await deleteShopPrinter('Canon LBP2900');
    expect(mocks.delete).toHaveBeenCalledWith('printers');

    // Once deleted from database, list becomes completely empty
    mocks.printersData = [];
    res = await getShopPrinters();
    expect(res.printers).toHaveLength(0);
    expect(res.activePrinter).toBeNull();
  });
});
