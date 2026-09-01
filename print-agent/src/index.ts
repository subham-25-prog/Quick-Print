import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';
import { logger } from './logger';
import { ShopApiClient } from './client';
import { WindowsPrinterService } from './printer';
import { AgentHealthServer } from './server';

async function main() {
  const config = loadConfig();
  const client = new ShopApiClient(config);
  const printer = new WindowsPrinterService(config.printerName, config.simulatePrint);
  const healthServer = new AgentHealthServer(config);

  // Start local HTTP dashboard on port 9191
  healthServer.start(9191);

  const defaultPrinter = await printer.getDefaultPrinterName();
  const activePrinter = config.printerName || defaultPrinter || '(None Detected)';

  console.log('\n======================================================');
  console.log('       QuickPrint Windows Local Print Agent           ');
  console.log('======================================================');
  logger.info(`Backend URL:        ${config.backendUrl}`);
  logger.info(`Agent ID:           ${config.agentId}`);
  logger.info(`Target Printer:     ${activePrinter} ${config.printerName ? '(Configured in .env)' : '(Auto-detected Windows Default)'}`);
  logger.info(`Simulation Mode:    ${config.simulatePrint ? 'ENABLED (Dry run)' : 'DISABLED (Real printer)'}`);
  logger.info(`Polling Interval:   ${config.pollIntervalMs} ms`);
  logger.info(`Health Dashboard:   http://localhost:9191`);
  console.log('======================================================\n');

  // Ensure download temp folder exists
  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  // Check installed printers
  const printers = await printer.getInstalledPrinters();
  healthServer.updatePrinters(printers, activePrinter);
  if (printers.length > 0) {
    logger.info(`Detected Windows Printers: ${printers.join(', ')}`);
  }

  // Heartbeat helper
  const doHeartbeat = async () => {
    try {
      await client.sendHeartbeat(activePrinter);
      healthServer.recordHeartbeat();
    } catch (err) {
      logger.warn('Heartbeat notice:', err instanceof Error ? err.message : err);
    }
  };

  await doHeartbeat();
  setInterval(doHeartbeat, config.heartbeatIntervalMs);

  let isProcessing = false;
  let currentJobOrderNum = '';
  let currentJobFileName = '';

  // Main polling loop
  const pollJobs = async () => {
    if (isProcessing) return;

    try {
      // 1. Claim next approved job atomically
      const job = await client.claimNextJob();
      if (!job) return;

      const safeOrderNum = job.order_number || job.order_id || 'UNKNOWN';
      const safeFileName = job.file_name || (job as any).filename || 'document.pdf';

      isProcessing = true;
      currentJobOrderNum = safeOrderNum;
      currentJobFileName = safeFileName;

      logger.job(safeOrderNum, `Claimed job! File: ${safeFileName} (${job.page_count || 1} pages, ${job.copies || 1} copies)`);

      // 2. Download document
      const fileExt = String(safeFileName).includes('.') ? String(safeFileName).split('.').pop() || 'pdf' : 'pdf';
      const localFilePath = path.join(
        config.downloadDir,
        `job_${safeOrderNum}_${Date.now()}.${fileExt}`
      );

      logger.job(job.order_number, `Downloading document from server...`);
      await client.downloadDocument(job, localFilePath);

      // Verify file downloaded properly
      const fileSize = fs.existsSync(localFilePath) ? fs.statSync(localFilePath).size : 0;
      if (fileSize === 0) {
        throw new Error(`Downloaded document is empty (0 bytes). Order file missing on server.`);
      }

      // Check magic bytes to resolve accurate extension
      let actualFilePath = localFilePath;
      try {
        const header = fs.readFileSync(localFilePath).slice(0, 5).toString();
        if (header === '%PDF-' && !localFilePath.endsWith('.pdf')) {
          actualFilePath = localFilePath.replace(/\.[^/.]+$/, '.pdf');
          fs.renameSync(localFilePath, actualFilePath);
        }
      } catch {}

      logger.job(safeOrderNum, `Downloaded: ${actualFilePath} (${fileSize} bytes)`);

      // 3. Send to Windows Print Spooler
      logger.job(safeOrderNum, `Dispatching to physical printer (${config.printerName || 'Default'})...`);
      await printer.printDocument(actualFilePath, job);

      // 4. Mark job as printed in shop backend
      await client.reportJobCompletion(job.order_id, true);
      healthServer.recordJobSuccess(safeOrderNum, safeFileName);
      logger.success(`[JOB:${safeOrderNum}] Successfully printed and marked as PRINTED!`);

      // 5. Clean up local temp file after 25 second delay
      setTimeout(() => {
        try {
          if (fs.existsSync(actualFilePath)) {
            fs.unlinkSync(actualFilePath);
            logger.info(`[CLEANUP] Deleted temporary spooler file: ${path.basename(actualFilePath)}`);
          }
        } catch (cleanErr) {}
      }, 25000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Error processing print job:', errorMsg);
      if (currentJobOrderNum) {
        healthServer.recordJobFailure(currentJobOrderNum, currentJobFileName, errorMsg);
      }
    } finally {
      isProcessing = false;
      currentJobOrderNum = '';
      currentJobFileName = '';
    }
  };

  logger.info('Print Agent is listening for approved print jobs...');
  setInterval(pollJobs, config.pollIntervalMs);
}

main().catch((err) => {
  logger.error('Fatal Print Agent error:', err);
  process.exit(1);
});
