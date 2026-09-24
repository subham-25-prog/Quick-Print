import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { print, getDefaultPrinter } from 'pdf-to-printer';
import { ClaimedJob } from './client';

const execute = promisify(execFile);

export interface DetectedPrinter {
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';
}

interface PrintQueueJob {
  id: number;
  name: string;
}

export function parsePrintQueueJobs(raw: unknown, printerName: string): PrintQueueJob[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const prefix = `${printerName},`.toLocaleLowerCase();
  return list.flatMap((job) => {
    const name = typeof job?.Name === 'string' ? job.Name : '';
    const id = Number(job?.JobId);
    return name.toLocaleLowerCase().startsWith(prefix) && Number.isSafeInteger(id) && id > 0
      ? [{ id, name }]
      : [];
  });
}

const QUEUE_POLL_INTERVAL_MS = 1000;
const QUEUE_OBSERVATION_TIMEOUT_MS = 15000;
const MIN_QUEUE_COMPLETION_TIMEOUT_MS = 60000;
const MAX_QUEUE_COMPLETION_TIMEOUT_MS = 15 * 60 * 1000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function parseDetectedPrinters(raw: unknown): DetectedPrinter[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const virtual = /OneNote|Shared Fax|XPS Document Writer|Microsoft Print to PDF|Root Print Queue|^Fax$/i;
  return list.filter((p) => p?.Name && !virtual.test(p.Name) &&
    !virtual.test(p.DriverName || '') && !/^(nul:|PORTPROMPT:|SHRFAX:|FILE:)/i.test(p.PortName || ''))
    .map((p) => ({
      name: String(p.Name).trim(),
      status: p.WorkOffline || [6, 7].includes(p.PrinterStatus) ? 'OFFLINE' :
        printerHasBlockingError(p) ? 'ERROR' : 'ONLINE',
    }));
}

export function printerHasBlockingError(
  printer:
    | {
        WorkOffline?: boolean;
        PrinterStatus?: number;
        DetectedErrorState?: number;
      }
    | undefined
): boolean {
  // Microsoft Win32_Printer: DetectedErrorState=2 means NO ERROR, not failure.
  return (
    !printer ||
    Boolean(printer.WorkOffline) ||
    [6, 7].includes(printer.PrinterStatus || 0) ||
    [1, 4, 6, 7, 8, 9, 10, 11].includes(printer.DetectedErrorState || 0)
  );
}

export class WindowsPrinterService {
  constructor(
    private configuredPrinter: string,
    private simulation = false
  ) {}

  setConfiguredPrinter(printerName: string): void {
    this.configuredPrinter = printerName;
  }

  getConfiguredPrinter(): string {
    return this.configuredPrinter;
  }

  async getInstalledPrinters(): Promise<string[]> {
    return (await this.getDetectedPrinters()).map((p) => p.name);
  }

  async getDetectedPrinters(): Promise<DetectedPrinter[]> {
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execute(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '$ErrorActionPreference = "Stop"; Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,WorkOffline,PrinterStatus,DetectedErrorState | ConvertTo-Json -Compress',
          ],
          { windowsHide: true, timeout: 10000 }
        );
        return parseDetectedPrinters(JSON.parse(stdout.trim() || '[]'));
      } catch {
        // A failed scan is not an empty inventory or proof of a connection.
        throw new Error('Windows printer discovery failed');
      }
    }
    return [];
  }

  async getDefaultPrinterName(): Promise<string> {
    return process.platform === 'win32' ? (await getDefaultPrinter())?.name || '' : '';
  }

  async ensureReady(): Promise<void> {
    if (this.simulation) return;
    if (process.platform !== 'win32') {
      throw new Error('Live printing requires Windows');
    }

    const { stdout } = await execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Printer | Select-Object Name,WorkOffline,PrinterStatus,DetectedErrorState | ConvertTo-Json -Compress',
      ],
      { windowsHide: true, timeout: 10000 }
    );

    const parsed = JSON.parse(stdout || '[]');
    const printers = Array.isArray(parsed) ? parsed : [parsed];
    const printer = printers.find((p) => p.Name === this.configuredPrinter);

    if (printerHasBlockingError(printer)) {
      throw new Error('Configured printer is missing, offline, or reporting an error');
    }
  }

  private async queuedJobIds(): Promise<Set<number>> {
    const { stdout } = await execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference = "Stop"; Get-CimInstance Win32_PrintJob | Select-Object Name,JobId | ConvertTo-Json -Compress',
      ],
      { windowsHide: true, timeout: 10000 }
    );
    const jobs = parsePrintQueueJobs(JSON.parse(stdout.trim() || '[]'), this.configuredPrinter);
    return new Set(jobs.map((job) => job.id));
  }

  private async waitForQueueCompletion(existingJobIds: Set<number>, job: ClaimedJob): Promise<void> {
    const pages = Math.max(1, job.page_count * job.copies);
    const completionTimeout = Math.min(
      MAX_QUEUE_COMPLETION_TIMEOUT_MS,
      Math.max(MIN_QUEUE_COMPLETION_TIMEOUT_MS, pages * 8000)
    );
    const startedAt = Date.now();
    const observedJobIds = new Set<number>();

    while (Date.now() - startedAt < completionTimeout) {
      const currentJobIds = await this.queuedJobIds();
      for (const id of currentJobIds) {
        if (!existingJobIds.has(id)) observedJobIds.add(id);
      }

      if (observedJobIds.size > 0) {
        const isStillQueued = [...observedJobIds].some((id) => currentJobIds.has(id));
        if (!isStillQueued) return;
      } else if (Date.now() - startedAt >= QUEUE_OBSERVATION_TIMEOUT_MS) {
        // Different drivers have different queue behavior. Without observing
        // the job, completion is not something the agent can honestly claim.
        throw new Error('Could not verify this job in the Windows print queue. Please check the printer.');
      }

      await delay(QUEUE_POLL_INTERVAL_MS);
    }

    throw new Error('The Windows print queue did not finish this document in time. Please check the printer.');
  }

  async printDocument(filePath: string, job: ClaimedJob): Promise<void> {
    if (this.simulation) {
      if (!job.is_test) throw new Error('Cannot simulate a live payment');
      return;
    }

    if (job.is_test) {
      throw new Error('Cannot send test payment to a physical printer');
    }

    const data = await readFile(filePath);
    if (data.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Only validated PDFs can be printed');
    }

    // One engine, one invocation. An error may follow an accepted spool job;
    // the worker records REVIEW and never tries a second engine automatically.
    const mappedPaperSize =
      job.paper_size === 'LEGAL'
        ? 'legal'
        : job.paper_size === 'PHOTO'
          ? 'A4'
          : job.paper_size;

    const existingJobIds = await this.queuedJobIds();
    await print(filePath, {
      printer: this.configuredPrinter,
      copies: job.copies,
      monochrome: job.color_mode === 'BW',
      paperSize: mappedPaperSize,
      side: job.print_sides === 'DOUBLE' ? 'duplexlong' : 'simplex',
      scale: 'fit',
      silent: false,
    });
    await this.waitForQueueCompletion(existingJobIds, job);
  }
}
