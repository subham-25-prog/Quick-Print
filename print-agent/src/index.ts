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

  health.updatePrinters(
    await printer.getInstalledPrinters(),
    config.printerName || 'Sandbox simulation'
  );

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
        const installed = await printer.getInstalledPrinters();
        const activeName = printer.getConfiguredPrinter() || config.printerName || 'Sandbox simulation';
        const hb = await client.sendHeartbeat(activeName, installed);
        if (hb.activePrinter && hb.activePrinter !== printer.getConfiguredPrinter()) {
          printer.setConfiguredPrinter(hb.activePrinter);
          config.printerName = hb.activePrinter;
          health.updatePrinters(installed, hb.activePrinter);
          console.log(
            JSON.stringify({
              event: 'active_printer_updated',
              printer: hb.activePrinter,
            })
          );
        }
        health.recordHeartbeat();
        heartbeatAt = Date.now();
      }

      await worker.tick();
      backoffMs = config.pollIntervalMs;
    } catch {
      // Axios errors may contain Authorization headers: never serialize them.
      console.error(JSON.stringify({ event: 'agent_unavailable', retryInMs: backoffMs }));
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
