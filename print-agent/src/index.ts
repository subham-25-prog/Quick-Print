import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from './config';
import { ShopApiClient } from './client';
import { WindowsPrinterService } from './printer';
import { AgentHealthServer } from './server';
import { Journal, acquireLock } from './journal';
import { AgentWorker } from './worker';

async function main() {
  const config = loadConfig();

  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.mkdirSync(config.downloadDir, { recursive: true });

  const releaseLock = acquireLock(path.join(config.stateDir, 'agent.lock'));
  process.once('exit', releaseLock);

  const client = new ShopApiClient(config);
  const printer = new WindowsPrinterService(config.printerName, config.simulatePrint);
  const health = new AgentHealthServer(config);
  await health.start();

  const journal = new Journal(path.join(config.stateDir, 'dispatch.jsonl'));
  const worker = new AgentWorker(client, printer, journal, config.downloadDir);

  console.log(
    JSON.stringify({
      event: 'agent_started',
      agentId: config.agentId,
      mode: config.mode,
      simulation: config.simulatePrint,
    })
  );

  let stopping = false;
  let wakeDelay: (() => void) | undefined;
  const requestStop = () => {
    if (stopping) return;
    stopping = true;
    wakeDelay?.();
  };
  process.on('SIGINT', requestStop);
  process.on('SIGTERM', requestStop);

  let heartbeatAt = 0;
  let backoffMs = config.pollIntervalMs;

  while (!stopping) {
    // 1. Heartbeat & Discovery (isolated so any network/WMI delay never blocks print queue processing)
    if (Date.now() - heartbeatAt >= config.heartbeatIntervalMs) {
      try {
        const detected = await printer.getDetectedPrinters();
        const installed = detected.map((p) => p.name);
        if (!printer.getConfiguredPrinter()) {
          const defaultName = await printer.getDefaultPrinterName();
          const initial = detected.find((p) => p.name === defaultName && p.status === 'ONLINE')
            || detected.find((p) => p.status === 'ONLINE');
          if (initial) printer.setConfiguredPrinter(initial.name);
        }
        const activeName = printer.getConfiguredPrinter() || 'Unavailable';
        const hb = await client.sendHeartbeat(activeName, installed, detected);
        if (hb.activePrinter && !/^(Unavailable|Sandbox simulation)$/i.test(hb.activePrinter) && hb.activePrinter !== printer.getConfiguredPrinter()) {
          printer.setConfiguredPrinter(hb.activePrinter);
          config.printerName = hb.activePrinter;
          console.log(
            JSON.stringify({
              event: 'active_printer_updated',
              printer: hb.activePrinter,
            })
          );
        }
        health.updatePrinters(installed, printer.getConfiguredPrinter());
        health.recordHeartbeat();
        heartbeatAt = Date.now();
      } catch (hbErr: unknown) {
        console.error(
          JSON.stringify({
            event: 'heartbeat_deferred',
            message: (hbErr as Error)?.message || String(hbErr),
          })
        );
      }
    }

    // 2. Immediate Print Job Polling & Processing
    try {
      await worker.tick();
      backoffMs = config.pollIntervalMs;
    } catch (err: unknown) {
      // Axios errors may contain Authorization headers: never serialize them.
      const error = err as {
        message?: string;
        code?: string;
        response?: { status?: number; data?: unknown };
      };
      const responseData =
        typeof error?.response?.data === 'string'
          ? error.response.data
          : (error?.response?.data as { error?: string })?.error;
      console.error(
        JSON.stringify({
          event: 'agent_unavailable',
          retryInMs: backoffMs,
          status: error?.response?.status,
          code: error?.code,
          message: error?.message,
          error: responseData,
        })
      );
      backoffMs = Math.min(60000, backoffMs * 2);
    }

    if (!stopping) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wakeDelay = undefined;
          resolve();
        }, backoffMs);
        wakeDelay = () => {
          clearTimeout(timer);
          wakeDelay = undefined;
          resolve();
        };
      });
    }
  }

  try {
    await health.stop();
  } finally {
    process.off('SIGINT', requestStop);
    process.off('SIGTERM', requestStop);
    releaseLock();
  }
}

main().catch((err) => {
  console.error(
    `Agent could not start: ${err?.message || err}. Check configuration, printer selection and the state directory.`
  );
  process.exit(1);
});
