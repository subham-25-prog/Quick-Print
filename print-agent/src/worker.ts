import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ShopApiClient, ClaimedJob } from './client';
import { Journal } from './journal';

export class AgentWorker {
  private busy = false;

  constructor(
    private client: Pick<
      ShopApiClient,
      'claimNextJob' | 'downloadDocument' | 'startJob' | 'reportJobCompletion'
    >,
    private printer: {
      ensureReady(): Promise<void>;
      printDocument(file: string, job: ClaimedJob): Promise<void>;
    },
    private journal: Journal,
    private tempDir: string
  ) {}

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      // Restart after STARTING is ambiguous. Report REVIEW; never dispatch again.
      for (const entry of this.journal.pending()) {
        const outcome = entry.outcome || 'REVIEW';
        await this.client.reportJobCompletion(entry.job, outcome);
        this.journal.append({ ...entry, state: 'ACK', outcome });
      }

      await this.printer.ensureReady();
      const job = await this.client.claimNextJob();
      if (!job) return;

      if (this.journal.dispatched(job.job_id)) {
        throw new Error('Locally dispatched job returned by server; manual recovery required');
      }

      const tempFile = path.join(this.tempDir, `${randomUUID()}.pdf`);
      let started = false;

      try {
        await this.client.downloadDocument(job, tempFile);
        await this.printer.ensureReady();

        // fsync BEFORE the server dispatch transition and any physical side effect.
        this.journal.append({ job, state: 'STARTING' });
        started = true;

        await this.client.startJob(job);
        await this.printer.printDocument(tempFile, job);
        this.journal.append({ job, state: 'REPORT', outcome: 'SUBMITTED' });
      } catch {
        this.journal.append({ job, state: 'REPORT', outcome: started ? 'REVIEW' : 'FAILED' });
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }

      const entry = this.journal.pending().find((e) => e.job.job_id === job.job_id)!;
      await this.client.reportJobCompletion(job, entry.outcome!);
      this.journal.append({ ...entry, state: 'ACK' });

      console.log(
        JSON.stringify({
          event: 'print_result',
          jobId: job.job_id,
          outcome: entry.outcome,
          test: job.is_test,
        })
      );
    } finally {
      this.busy = false;
    }
  }
}
