import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';
import { logger } from './logger';
import { ShopApiClient } from './client';
import { WindowsPrinterService } from './printer';

async function main() {
  const config = loadConfig();
  const client = new ShopApiClient(config);
  const printer = new WindowsPrinterService(config.printerName, config.simulatePrint);

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
  console.log('======================================================\n');

  // Ensure download temp folder exists
  if (!fs.existsSync(config.downloadDir)) {
    fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  // Check installed printers
  const printers = await printer.getInstalledPrinters();
  if (printers.length > 0) {
    logger.info(`Detected Windows Printers: ${printers.join(', ')}`);
  }

  // Initial heartbeat
  await client.sendHeartbeat(config.printerName);

  // Heartbeat timer
  setInterval(async () => {
    await client.sendHeartbeat(config.printerName);
  }, config.heartbeatIntervalMs);

  let isProcessing = false;

  // Main polling loop
  const pollJobs = async () => {
    if (isProcessing) return;

    try {
      // 1. Claim next approved job atomically
      const job = await client.claimNextJob();
      if (!job) return;

      isProcessing = true;
      logger.job(job.order_number, `Claimed job! File: ${job.file_name} (${job.page_count} pages, ${job.copies} copies)`);

      // 2. Download document
      const fileExt = job.file_name.split('.').pop() || 'pdf';
      const localFilePath = path.join(
        config.downloadDir,
        `job_${job.order_number}_${Date.now()}.${fileExt}`
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

      logger.job(job.order_number, `Downloaded: ${actualFilePath} (${fileSize} bytes)`);

      // 3. Send to Windows Print Spooler
      logger.job(job.order_number, `Dispatching to physical printer (${config.printerName || 'Default'})...`);
      await printer.printDocument(actualFilePath, job);

      // 4. Mark job as printed in shop backend
      await client.reportJobCompletion(job.order_id, true);
      logger.success(`[JOB:${job.order_number}] Successfully printed and marked as PRINTED!`);

      // 5. Clean up local temp file after 25 second delay
      setTimeout(() => {
        try {
          if (fs.existsSync(actualFilePath)) {
            fs.unlinkSync(actualFilePath);
            logger.info(`[CLEANUP] Deleted temporary spooler file: ${path.basename(actualFilePath)}`);
          }
        } catch (cleanErr) {
          // Ignore cleanup errors
        }
      }, 25000);
    } catch (err) {
      logger.error('Error processing print job:', err);
    } finally {
      isProcessing = false;
    }
  };

  logger.info('Print Agent is listening for approved print jobs...');
  setInterval(pollJobs, config.pollIntervalMs);
}

main().catch((err) => {
  logger.error('Fatal Print Agent error:', err);
  process.exit(1);
});
