import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AgentConfig {
  backendUrl: string;
  agentSecret: string;
  agentId: string;
  printerName: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  downloadDir: string;
  simulatePrint: boolean;
}

export function loadConfig(): AgentConfig {
  const backendUrl = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const agentSecret = process.env.PRINT_AGENT_SECRET || 'qp_sec_dev_local_12345678';
  const agentId = process.env.AGENT_ID || 'agent-main-pc';
  const printerName = process.env.PRINTER_NAME || '';
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
  const heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10);
  const downloadDir = path.resolve(process.cwd(), process.env.DOWNLOAD_DIR || './temp_jobs');
  const simulatePrint = process.argv.includes('--simulate') || process.env.SIMULATE_PRINT === 'true';

  return {
    backendUrl,
    agentSecret,
    agentId,
    printerName,
    pollIntervalMs,
    heartbeatIntervalMs,
    downloadDir,
    simulatePrint,
  };
}
