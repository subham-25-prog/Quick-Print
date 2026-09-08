import * as fs from 'node:fs';
import { ClaimedJob, PrintOutcome } from './client';

export interface Entry {
  job: ClaimedJob;
  state: 'STARTING' | 'REPORT' | 'ACK';
  outcome?: PrintOutcome;
}

export class Journal {
  private entries = new Map<string, Entry>();

  constructor(private file: string) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split('\n').filter(Boolean)) {
        const entry = JSON.parse(line) as Entry;
        if (!entry.job?.job_id || !['STARTING', 'REPORT', 'ACK'].includes(entry.state)) {
          throw new Error('Invalid journal; stop for recovery');
        }
        this.entries.set(entry.job.job_id, entry);
      }
    }
  }

  append(entry: Entry) {
    const fd = fs.openSync(this.file, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(entry) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.entries.set(entry.job.job_id, entry);
  }

  pending(): Entry[] {
    return [...this.entries.values()].filter((e) => e.state !== 'ACK');
  }

  dispatched(id: string): boolean {
    const entry = this.entries.get(id);
    return Boolean(entry && entry.outcome !== 'FAILED');
  }
}

export function acquireLock(file: string): () => void {
  // Serialize stale-lock replacement. A crash during acquisition leaves this
  // guard for explicit recovery instead of allowing two concurrent replacements.
  const guard = `${file}.acquiring`;
  fs.mkdirSync(guard);

  try {
    if (fs.existsSync(file)) {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) {
        throw new Error('Invalid agent lock');
      }

      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
          alive = false;
        } else {
          throw e;
        }
      }

      if (alive) {
        throw new Error('Agent already running');
      }

      fs.unlinkSync(file);
    }

    const fd = fs.openSync(file, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.fsyncSync(fd);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        fs.closeSync(fd);
        fs.unlinkSync(file);
      }
    };
  } finally {
    fs.rmdirSync(guard);
  }
}
