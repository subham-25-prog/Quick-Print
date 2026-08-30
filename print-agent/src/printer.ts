import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
import { ClaimedJob } from './client';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class WindowsPrinterService {
  private configuredPrinter: string;
  private isSimulation: boolean;
  private sumatraExePath: string;

  constructor(printerName: string, isSimulation = false) {
    this.configuredPrinter = printerName;
    this.isSimulation = isSimulation;
    this.sumatraExePath = path.resolve(
      __dirname,
      '../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe'
    );
  }

  /**
   * Get list of available Windows printers
   */
  async getInstalledPrinters(): Promise<string[]> {
    if (process.platform !== 'win32') {
      return ['Virtual Mock Printer'];
    }

    try {
      const { stdout } = await execAsync(
        'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"'
      );
      return stdout
        .split('\r\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    } catch (err) {
      logger.warn('Could not query Windows printer list via PowerShell:', err);
      return [];
    }
  }

  /**
   * Print PDF using SumatraPDF (Fast, non-blocking 600 DPI vector spooler)
   */
  private async printWithSumatra(filePath: string, job: ClaimedJob): Promise<boolean> {
    if (!fs.existsSync(this.sumatraExePath)) {
      return false;
    }

    try {
      const args: string[] = [];
      if (this.configuredPrinter) {
        args.push('-print-to', this.configuredPrinter);
      } else {
        args.push('-print-to-default');
      }

      args.push('-silent');

      const settings: string[] = ['fit'];
      if (job.copies && job.copies > 1) {
        settings.push(`${job.copies}x`);
      }
      if (job.color_mode === 'BW') {
        settings.push('monochrome');
      }

      args.push('-print-settings', settings.join(','));
      args.push(filePath);

      logger.info(`Dispatching with SumatraPDF: ${path.basename(filePath)} -> [${this.configuredPrinter || 'Default'}]`);
      await execFileAsync(this.sumatraExePath, args, { timeout: 10000 });
      return true;
    } catch (err) {
      logger.warn('SumatraPDF notice:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Print Image using Windows Native GDI+ (.NET System.Drawing)
   */
  private async printWithNativeGdi(filePath: string, copies = 1): Promise<boolean> {
    try {
      const targetPrinter = this.configuredPrinter || (await this.getDefaultPrinterName());
      const safeFilePath = filePath.replace(/'/g, "''");
      const safePrinterName = targetPrinter.replace(/'/g, "''");

      const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$imagePath = '${safeFilePath}'
$printerName = '${safePrinterName}'
$copies = ${copies}

if (-not (Test-Path $imagePath)) { exit 1 }

$image = [System.Drawing.Image]::FromFile($imagePath)
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = $printerName
$pd.PrinterSettings.Copies = $copies

foreach ($paper in $pd.PrinterSettings.PaperSizes) {
    if ($paper.PaperName -match "A4") {
        $pd.DefaultPageSettings.PaperSize = $paper
        break
    }
}

$pd.add_PrintPage({
    param($sender, [System.Drawing.Printing.PrintPageEventArgs]$ev)
    $marginBounds = $ev.MarginBounds
    $ratioX = [double]$marginBounds.Width / $image.Width
    $ratioY = [double]$marginBounds.Height / $image.Height
    $ratio = [Math]::Min($ratioX, $ratioY)

    $newWidth = [int]($image.Width * $ratio)
    $newHeight = [int]($image.Height * $ratio)

    $posX = $marginBounds.Left + [int](($marginBounds.Width - $newWidth) / 2)
    $posY = $marginBounds.Top + [int](($marginBounds.Height - $newHeight) / 2)

    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $ev.Graphics.DrawImage($image, $posX, $posY, $newWidth, $newHeight)
    $ev.HasMorePages = $false
})

$pd.Print()
$image.Dispose()
`;

      logger.info(`Dispatching via Native Windows GDI+ to [${targetPrinter}]: ${path.basename(filePath)}`);
      await execAsync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { timeout: 15000 });
      return true;
    } catch (err) {
      logger.warn('Native GDI+ print notice:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Get Default Windows Printer Name
   */
  async getDefaultPrinterName(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        'powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name"'
      );
      return stdout.trim();
    } catch {
      return '';
    }
  }

  /**
   * Send document to Windows print spooler
   */
  async printDocument(filePath: string, job: ClaimedJob): Promise<void> {
    if (this.isSimulation) {
      logger.info(`[SIMULATION] Simulating physical print for Order #${job.order_number}: ${filePath}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'].includes(ext);

    // 1. For images: Use Native GDI+
    if (isImage) {
      const gdiSuccess = await this.printWithNativeGdi(filePath, job.copies || 1);
      if (gdiSuccess) {
        logger.info(`Successfully dispatched Order #${job.order_number} to printer via Native GDI+ Engine`);
        return;
      }
    } else {
      // 2. For PDFs: Use SumatraPDF
      const sumatraSuccess = await this.printWithSumatra(filePath, job);
      if (sumatraSuccess) {
        logger.info(`Successfully dispatched Order #${job.order_number} to printer via SumatraPDF`);
        return;
      }
    }

    // 3. Fallback: Native Shell Print
    if (process.platform === 'win32') {
      try {
        const safePath = filePath.replace(/'/g, "''");
        const psCommand = this.configuredPrinter
          ? `Start-Process -FilePath '${safePath}' -Verb PrintTo -ArgumentList '"${this.configuredPrinter.replace(/'/g, "''")}"'`
          : `Start-Process -FilePath '${safePath}' -Verb Print`;
        await execAsync(`powershell.exe -NoProfile -Command "${psCommand}"`, { timeout: 10000 });
        return;
      } catch (shellErr) {
        logger.warn('Shell print fallback notice:', shellErr instanceof Error ? shellErr.message : shellErr);
      }
    }

    logger.info(`[COMPLETED] Order #${job.order_number} processed for printing.`);
  }
}
