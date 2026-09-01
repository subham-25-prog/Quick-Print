import * as http from 'http';
import { AgentConfig } from './config';
import { logger } from './logger';

export interface AgentHealthState {
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ERROR';
  uptimeSeconds: number;
  backendUrl: string;
  agentId: string;
  activePrinter: string;
  detectedPrinters: string[];
  lastHeartbeat: string;
  totalJobsProcessed: number;
  totalJobsFailed: number;
  recentJobs: { orderNumber: string; fileName: string; status: 'SUCCESS' | 'FAILED'; timestamp: string; error?: string }[];
}

export class AgentHealthServer {
  private config: AgentConfig;
  private state: AgentHealthState;
  private server: http.Server | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = {
      status: 'ONLINE',
      uptimeSeconds: 0,
      backendUrl: config.backendUrl,
      agentId: config.agentId,
      activePrinter: config.printerName || 'Default Windows Printer',
      detectedPrinters: [],
      lastHeartbeat: new Date().toISOString(),
      totalJobsProcessed: 0,
      totalJobsFailed: 0,
      recentJobs: [],
    };
  }

  updatePrinters(printers: string[], activePrinter: string) {
    this.state.detectedPrinters = printers;
    if (activePrinter) this.state.activePrinter = activePrinter;
  }

  recordHeartbeat() {
    this.state.lastHeartbeat = new Date().toISOString();
  }

  recordJobSuccess(orderNumber: string, fileName: string) {
    this.state.totalJobsProcessed += 1;
    this.state.recentJobs.unshift({
      orderNumber,
      fileName,
      status: 'SUCCESS',
      timestamp: new Date().toLocaleTimeString(),
    });
    if (this.state.recentJobs.length > 20) this.state.recentJobs.pop();
  }

  recordJobFailure(orderNumber: string, fileName: string, errorMsg: string) {
    this.state.totalJobsFailed += 1;
    this.state.recentJobs.unshift({
      orderNumber,
      fileName,
      status: 'FAILED',
      timestamp: new Date().toLocaleTimeString(),
      error: errorMsg,
    });
    if (this.state.recentJobs.length > 20) this.state.recentJobs.pop();
  }

  start(port = 9191) {
    const startTime = Date.now();

    this.server = http.createServer((req, res) => {
      this.state.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      if (req.url === '/health' || req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(this.state, null, 2));
        return;
      }

      // Serve shopkeeper dashboard HTML
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QuickPrint Agent Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 16px; padding: 24px; border: 1px solid #334155; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 800; color: #38bdf8; display: flex; items-center; gap: 8px; }
    .badge { padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 800; background: #065f46; color: #34d399; border: 1px solid #059669; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat-box { background: #0f172a; padding: 16px; border-radius: 12px; border: 1px solid #334155; }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700; }
    .stat-val { font-size: 22px; font-weight: 800; color: #f8fafc; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-size: 11px; text-transform: uppercase; }
    .status-pass { color: #34d399; font-weight: 700; }
    .status-fail { color: #f87171; font-weight: 700; }
    .refresh-btn { background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .refresh-btn:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="title">⚡ QuickPrint Local Print Agent</div>
        <div class="badge">● ${this.state.status}</div>
      </div>

      <div class="grid">
        <div class="stat-box">
          <div class="stat-label">Target Windows Printer</div>
          <div class="stat-val" style="font-size: 16px; color: #38bdf8;">${this.state.activePrinter}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Jobs Processed</div>
          <div class="stat-val" style="color: #34d399;">${this.state.totalJobsProcessed}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Failed Jobs</div>
          <div class="stat-val" style="color: ${this.state.totalJobsFailed > 0 ? '#f87171' : '#94a3b8'};">${this.state.totalJobsFailed}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Agent Uptime</div>
          <div class="stat-val" style="font-size: 16px;">${Math.floor(this.state.uptimeSeconds / 60)}m ${this.state.uptimeSeconds % 60}s</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0; font-size:16px; color:#f8fafc;">Recent Print Jobs Stream</h3>
        <button class="refresh-btn" onclick="location.reload()">Refresh</button>
      </div>

      ${
        this.state.recentJobs.length === 0
          ? '<p style="color:#94a3b8; font-size:13px; margin-top:16px;">No print jobs processed in this session yet. Agent is listening for incoming customer prints...</p>'
          : `<table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Order #</th>
                <th>Document File</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${this.state.recentJobs
                .map(
                  (j) => `<tr>
                <td>${j.timestamp}</td>
                <td style="font-family:monospace; font-weight:bold; color:#38bdf8;">${j.orderNumber}</td>
                <td>${j.fileName}</td>
                <td class="${j.status === 'SUCCESS' ? 'status-pass' : 'status-fail'}">${j.status}${j.error ? ' (' + j.error + ')' : ''}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>`
      }
    </div>

    <div style="text-align:center; color:#64748b; font-size:12px; margin-top:20px;">
      Connected to Backend: <code>${this.state.backendUrl}</code> | Agent ID: <code>${this.state.agentId}</code>
    </div>
  </div>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    this.server.listen(port, () => {
      logger.info(`Agent Local Dashboard & Health Server running at http://localhost:${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
