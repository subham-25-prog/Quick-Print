import axios, { AxiosInstance } from 'axios';
import { writeFile } from 'node:fs/promises';
import { AgentConfig } from './config';

export interface ClaimedJob {
  job_id: string;
  claim_token: string;
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
  is_test: boolean;
}

export type PrintOutcome = 'SUBMITTED' | 'FAILED' | 'REVIEW';

export class ShopApiClient {
  private client: AxiosInstance;

  constructor(private config: AgentConfig) {
    this.client = axios.create({
      baseURL: config.backendUrl,
      timeout: 30000,
      maxRedirects: 0,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.agentSecret}`,
        'x-agent-id': config.agentId,
      },
    });
  }

  async sendHeartbeat(printerName: string): Promise<boolean> {
    await this.client.post('/api/agent/heartbeat', {
      printerName,
      systemInfo: `Node ${process.version} on ${process.platform}`,
      mode: this.config.mode,
    });
    return true;
  }

  async claimNextJob(): Promise<ClaimedJob | null> {
    const { data } = await this.client.post('/api/agent/jobs', {});
    const job = data.job;
    if (!job) return null;

    if (
      !/^[0-9a-f-]{36}$/i.test(job.job_id) ||
      !/^[0-9a-f-]{36}$/i.test(job.order_id) ||
      !/^[0-9a-f-]{36}$/i.test(job.claim_token) ||
      !Number.isSafeInteger(job.copies) ||
      job.copies < 1 ||
      job.copies > 100 ||
      typeof job.is_test !== 'boolean'
    ) {
      throw new Error('Invalid job contract');
    }

    if (job.is_test !== (this.config.mode === 'sandbox')) {
      throw new Error('Job environment mismatch');
    }

    return job;
  }

  async downloadDocument(job: ClaimedJob, destinationPath: string): Promise<string> {
    // Credential-bearing downloads are confined to this installation. No arbitrary
    // provider URLs or redirect following can leak the agent secret.
    const { data } = await this.client.get(`/api/orders/${job.order_id}/file`, {
      responseType: 'arraybuffer',
      maxContentLength: 4194304,
      headers: { 'x-claim-token': job.claim_token },
    });

    const buffer = Buffer.from(data);
    if (!buffer.length || buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Invalid downloaded PDF');
    }

    await writeFile(destinationPath, buffer, { flag: 'wx' });
    return destinationPath;
  }

  async startJob(job: ClaimedJob): Promise<void> {
    await this.client.post('/api/agent/start', {
      jobId: job.job_id,
      claimToken: job.claim_token,
    });
  }

  async reportJobCompletion(job: ClaimedJob, outcome: PrintOutcome): Promise<void> {
    await this.client.post('/api/agent/complete', {
      jobId: job.job_id,
      claimToken: job.claim_token,
      outcome,
    });
  }
}
