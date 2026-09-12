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
  health.start();

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
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  let heartbeatAt = 0;
  let backoffMs = config.pollIntervalMs;

  while (!stopping) {
    try {
      if (Date.now() - heartbeatAt >= config.heartbeatIntervalMs) {
        const detected = await printer.getDetectedPrinters();
        const installed = detected.map((p) => p.name);
        // Choose an initial device only when no explicit choice exists. Never
        // silently reroute an unavailable selected printer to another device.
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
      }

      try {
        await worker.tick();
      } catch {
        console.error(JSON.stringify({ event: 'printer_unavailable' }));
      }
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

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  releaseLock();
  process.exit(0);
}

main().catch(() => {
  console.error(
    'Agent could not start. Check configuration, printer selection and the state directory.'
  );
  process.exit(1);
});
