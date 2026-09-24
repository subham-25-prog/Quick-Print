import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { print, getDefaultPrinter, getPrinters } from 'pdf-to-printer';
import { ClaimedJob } from './client';

const execute = promisify(execFile);

export interface DetectedPrinter {
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';
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

export function parsePdfToPrinterList(raw: Array<{ name?: string; deviceId?: string }>): DetectedPrinter[] {
  const list = Array.isArray(raw) ? raw : [];
  const virtual = /OneNote|Shared Fax|XPS Document Writer|Microsoft Print to PDF|Root Print Queue|^Fax$/i;
  return list
    .filter((p) => (p?.name || p?.deviceId) && !virtual.test(p.name || p.deviceId || ''))
    .map((p) => ({
      name: String(p.name || p.deviceId).trim(),
      status: 'ONLINE' as const,
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
  private cachedPrinters: DetectedPrinter[] = [];
  private lastScanTime = 0;

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
    if (process.platform !== 'win32') return [];

    const now = Date.now();
    // Cache valid scan for 30s to avoid spamming Windows spooler/WMI on every 5s heartbeat
    if (this.cachedPrinters.length > 0 && now - this.lastScanTime < 30000) {
      return this.cachedPrinters;
    }

    // 1. Fast native Get-Printer (takes 100-300ms)
    try {
      const { stdout } = await execute(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ErrorActionPreference = "Stop"; Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus | ConvertTo-Json -Compress',
        ],
        { windowsHide: true, timeout: 5000 }
      );
      const parsed = JSON.parse(stdout.trim() || '[]');
      const printers = parseDetectedPrinters(parsed);
      if (printers.length > 0) {
        this.cachedPrinters = printers;
        this.lastScanTime = now;
        return printers;
      }
    } catch {
      // Fall through to fast pdf-to-printer fallback
    }

    // 2. Fast pdf-to-printer native fallback (~100ms)
    try {
      const pList = await getPrinters();
      const printers = parsePdfToPrinterList(pList);
      if (printers.length > 0) {
        this.cachedPrinters = printers;
        this.lastScanTime = now;
        return printers;
      }
    } catch {
      // Fall through to WMI or cached inventory
    }

    // 3. Fallback to WMI if available
    try {
      const { stdout } = await execute(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_Printer | Select-Object Name,PortName,DriverName,WorkOffline,PrinterStatus,DetectedErrorState | ConvertTo-Json -Compress',
        ],
        { windowsHide: true, timeout: 6000 }
      );
      const printers = parseDetectedPrinters(JSON.parse(stdout.trim() || '[]'));
      if (printers.length > 0) {
        this.cachedPrinters = printers;
        this.lastScanTime = now;
        return printers;
      }
    } catch {
      // Return cached list rather than throwing
      if (this.cachedPrinters.length > 0) {
        return this.cachedPrinters;
      }
    }

    if (this.cachedPrinters.length > 0) {
      return this.cachedPrinters;
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
    if (!this.configuredPrinter) {
      throw new Error('No printer configured');
    }

    // Check specific printer directly by name (fast, ~50ms)
    try {
      const escaped = this.configuredPrinter.replace(/'/g, "''");
      const { stdout } = await execute(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-Printer -Name '${escaped}' -ErrorAction SilentlyContinue | Select-Object Name,PrinterStatus | ConvertTo-Json -Compress`,
        ],
        { windowsHide: true, timeout: 4000 }
      );
      if (stdout.trim()) {
        const p = JSON.parse(stdout.trim());
        if ([6, 7].includes(p.PrinterStatus)) {
          throw new Error('Configured printer is offline or reporting an error');
        }
        return;
      }
    } catch (e: unknown) {
      if ((e as Error)?.message?.includes('offline')) throw e;
    }

    // Fallback: check if printer exists in our cached list
    const found = this.cachedPrinters.find(
      (p) => p.name.toLowerCase() === this.configuredPrinter.toLowerCase()
    );
    if (found && found.status === 'OFFLINE') {
      throw new Error('Configured printer is offline or reporting an error');
    }
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

    await print(filePath, {
      printer: this.configuredPrinter,
      copies: job.copies,
      monochrome: job.color_mode === 'BW',
      paperSize: mappedPaperSize,
      side: job.print_sides === 'DOUBLE' ? 'duplexlong' : 'simplex',
      scale: 'fit',
      silent: false,
    });
  }
}
