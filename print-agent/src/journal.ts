import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ClaimedJob, PrintOutcome } from './client';

export interface Entry {
  job: ClaimedJob;
  state: 'STARTING' | 'REPORT' | 'ACK';
  outcome?: PrintOutcome;
}

export class Journal {
  private entries = new Map<string, Entry>();
  private appendsSinceCompaction = 0;

  // Keep recovery fast and disk consumption bounded on agents that stay up for
  // months. An entry has at most three state transitions, so this threshold is
  // deliberately high enough to avoid doing maintenance during normal work.
  private static readonly COMPACT_AFTER_APPENDS = 250;

  constructor(private file: string) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const hasTornTail = content.length > 0 && !content.endsWith('\n');

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line) continue;

        try {
          const entry = JSON.parse(line) as Entry;
          if (!entry.job?.job_id || !['STARTING', 'REPORT', 'ACK'].includes(entry.state)) {
            throw new Error('Invalid entry');
          }
          this.entries.set(entry.job.job_id, entry);
        } catch {
          // append() fsyncs before any server transition or print side effect.
          // A truncated final write is therefore safe to ignore, while damage
          // to an earlier complete record still stops the agent for recovery.
          if (hasTornTail && index === lines.length - 1) {
            console.warn(JSON.stringify({ event: 'journal_torn_tail_ignored' }));
            break;
          }
          throw new Error('Invalid journal; stop for recovery');
        }
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
    this.appendsSinceCompaction++;
    if (this.appendsSinceCompaction >= Journal.COMPACT_AFTER_APPENDS) {
      this.compact();
    }
  }

  pending(): Entry[] {
    return [...this.entries.values()].filter((e) => e.state !== 'ACK');
  }

  dispatched(id: string): boolean {
    const entry = this.entries.get(id);
    return Boolean(entry && entry.outcome !== 'FAILED');
  }

  private compact() {
    const temporaryFile = `${this.file}.compact`;
    const pending = this.pending();
    const fd = fs.openSync(temporaryFile, 'w');
    try {
      for (const entry of pending) {
        fs.writeSync(fd, JSON.stringify(entry) + '\n');
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    try {
      fs.renameSync(temporaryFile, this.file);
      this.entries = new Map(pending.map((entry) => [entry.job.job_id, entry]));
      this.appendsSinceCompaction = 0;
      console.log(JSON.stringify({ event: 'journal_compacted', pending: pending.length }));
    } catch (error) {
      // The original journal remains authoritative when replacement fails.
      // A later append may retry compaction; do not interrupt printing.
      fs.unlinkSync(temporaryFile);
      console.error(JSON.stringify({
        event: 'journal_compaction_failed',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
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
        } else if (
          (e as NodeJS.ErrnoException).code === 'EPERM' &&
          isDefinitelyNotNodeProcess(pid)
        ) {
          // Windows may recycle a dead agent's PID for a protected system
          // process. process.kill(pid, 0) then reports EPERM even though the
          // process cannot possibly own this Node agent lock.
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
        // Do not remove a replacement lock if an operator has recovered the
        // state directory while this process was still winding down.
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === String(process.pid)) {
          fs.unlinkSync(file);
        }
      }
    };
  } finally {
    fs.rmdirSync(guard);
  }
}

function isDefinitelyNotNodeProcess(pid: number): boolean {
  if (process.platform !== 'win32') return false;

  try {
    const output = execFileSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true }
    ).trim();
    // tasklist emits one quoted CSV record, such as
    // "svchost.exe","4892",... . Treat only a known non-Node executable as
    // stale; an unknown result remains protected by the existing EPERM error.
    const imageName = /^"([^"]+)"/.exec(output)?.[1]?.toLowerCase();
    return Boolean(imageName && imageName !== 'node.exe' && imageName !== 'node');
  } catch {
    return false;
  }
}
