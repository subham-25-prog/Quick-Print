import * as dotenv from 'dotenv';
import * as path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AgentConfig {
  backendUrl: string;
  agentSecret: string;
  agentId: string;
  printerName: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  downloadDir: string;
  mode: 'live';
  stateDir: string;
}

export function loadConfig(): AgentConfig {
  const backendUrl = process.env.BACKEND_URL || '';
  const u = new URL(backendUrl);

  const isHttpLocal =
    u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);

  if (u.protocol !== 'https:' && !isHttpLocal) {
    throw new Error('BACKEND_URL must use HTTPS');
  }
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new Error('BACKEND_URL must be the canonical origin');
  }

  const agentSecret = process.env.PRINT_AGENT_SECRET || '';
  const agentId = process.env.AGENT_ID || process.env.PRINT_AGENT_ID || 'counter-01';
  if (agentSecret.length < 32 || !agentId || process.env.AGENT_MODE !== 'live') {
    throw new Error('Agent ID, 32-character secret and AGENT_MODE=live are required');
  }
  if (process.env.SIMULATE_PRINT === 'true' || process.argv.includes('--simulate')) {
    throw new Error('Simulation is not available in the production print agent');
  }

  // An empty preference is allowed for first-run discovery. The worker will not
  // claim a job until the dashboard has confirmed a physical printer selection.
  const printerName = process.env.PRINTER_NAME?.trim() || '';

  function parseDuration(value: string | undefined, fallback: number): number {
    const n = Number(value || fallback);
    if (!Number.isSafeInteger(n) || n < 1000 || n > 60000) {
      throw new Error('Invalid interval');
    }
    return n;
  }

  return {
    backendUrl: u.origin,
    agentSecret,
    agentId,
    printerName,
    mode: 'live',
    pollIntervalMs: parseDuration(process.env.POLL_INTERVAL_MS, 5000),
    heartbeatIntervalMs: parseDuration(process.env.HEARTBEAT_INTERVAL_MS, 5000),
    downloadDir: path.resolve(process.env.DOWNLOAD_DIR || './temp_jobs'),
    stateDir: path.resolve(process.env.STATE_DIR || './state'),
  };
}
