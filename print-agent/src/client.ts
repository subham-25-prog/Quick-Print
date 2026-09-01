import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig } from './config';
import { logger } from './logger';

export interface ClaimedJob {
  job_id: string;
  order_id: string;
  order_number: string;
  file_name: string;
  file_type: string;
  download_url: string;
  page_count: number;
  copies: number;
  paper_size: string;
  color_mode: string;
  print_sides: string;
}

export class ShopApiClient {
  private client: AxiosInstance;
  private config: AgentConfig;
  private lastErrorTime: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.backendUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.agentSecret}`,
        'x-agent-secret': config.agentSecret,
      },
    });
  }

  /**
   * Send heartbeat to shop backend
   */
  async sendHeartbeat(printerName: string): Promise<boolean> {
    try {
      await this.client.post('/api/agent/heartbeat', {
        agentId: this.config.agentId,
        printerName: printerName || 'Windows Default Printer',
        systemInfo: `Node ${process.version} on ${process.platform}`,
      });
      return true;
    } catch (err) {
      if (Date.now() - this.lastErrorTime > 10000) {
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.error || err.message;
          const status = err.response?.status ? ` [HTTP ${err.response.status}]` : '';
          logger.error(`Heartbeat failed${status}: ${detail} (Backend URL: ${this.config.backendUrl})`);
        } else {
          logger.error('Heartbeat failed:', err instanceof Error ? err.message : err);
        }
        this.lastErrorTime = Date.now();
      }
      return false;
    }
  }

  /**
   * Poll and atomically claim next approved print job
   */
  async claimNextJob(): Promise<ClaimedJob | null> {
    try {
      const response = await this.client.post('/api/agent/jobs', {
        agentId: this.config.agentId,
      });

      if (response.data?.success && response.data?.job) {
        const raw = response.data.job;
        const orderIdStr = String(raw.order_id || raw.orderId || raw.id || '');
        const orderNumStr = String(raw.order_number || raw.orderNumber || orderIdStr || 'QP-0000');
        const fileNameStr = String(raw.file_name || raw.fileName || raw.filename || 'document.pdf');
        const fileTypeStr = String(raw.file_type || raw.fileType || 'application/pdf');
        const downloadUrlStr = String(raw.download_url || raw.downloadUrl || `/api/orders/${orderIdStr}/file`);

        const normalizedJob: ClaimedJob = {
          job_id: String(raw.job_id || raw.jobId || `job-${orderIdStr}`),
          order_id: orderIdStr,
          order_number: orderNumStr,
          file_name: fileNameStr,
          file_type: fileTypeStr,
          download_url: downloadUrlStr,
          page_count: Math.max(1, parseInt(String(raw.page_count || raw.pageCount || 1), 10) || 1),
          copies: Math.max(1, parseInt(String(raw.copies || 1), 10) || 1),
          paper_size: String(raw.paper_size || raw.paperSize || 'A4'),
          color_mode: String(raw.color_mode || raw.colorMode || 'BW'),
          print_sides: String(raw.print_sides || raw.printSides || 'SINGLE'),
        };

        return normalizedJob;
      }
      return null;
    } catch (err) {
      if (Date.now() - this.lastErrorTime > 10000) {
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.error || err.message;
          const status = err.response?.status ? ` [HTTP ${err.response.status}]` : '';
          logger.error(`Connection notice${status}: ${detail}`);
        } else {
          logger.error('Error claiming job:', err instanceof Error ? err.message : err);
        }
        this.lastErrorTime = Date.now();
      }
      return null;
    }
  }

  /**
   * Download job document to local disk
   */
  async downloadDocument(job: ClaimedJob, destinationPath: string): Promise<string> {
    const urlsToTry: string[] = [];

    if (job.download_url) {
      let mainUrl = job.download_url;
      if (!mainUrl.startsWith('http://') && !mainUrl.startsWith('https://')) {
        mainUrl = `${this.config.backendUrl.replace(/\/+$/, '')}/${mainUrl.replace(/^\/+/, '')}`;
      }
      urlsToTry.push(mainUrl);
    }

    const fallbackUrl = `${this.config.backendUrl.replace(/\/+$/, '')}/api/orders/${job.order_id}/file`;
    if (!urlsToTry.includes(fallbackUrl)) {
      urlsToTry.push(fallbackUrl);
    }

    let lastError: any = null;

    for (const url of urlsToTry) {
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'arraybuffer',
          headers: {
            Authorization: `Bearer ${this.config.agentSecret}`,
            'x-agent-secret': this.config.agentSecret,
          },
          timeout: 60000,
        });

        if (response.data && response.data.byteLength > 0) {
          await fs.promises.writeFile(destinationPath, Buffer.from(response.data));
          return destinationPath;
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error(`Failed to download document for job ${job.order_id}`);
  }

  /**
   * Report print completion or error
   */
  async reportJobCompletion(orderId: string, success: boolean, errorMessage?: string): Promise<void> {
    try {
      await this.client.post('/api/agent/complete', {
        orderId,
        success,
        errorMessage,
      });
    } catch (err) {
      logger.error(`Failed to report job status for ${orderId}:`, err instanceof Error ? err.message : err);
    }
  }
}
