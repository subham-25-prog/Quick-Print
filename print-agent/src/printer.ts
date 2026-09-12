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
