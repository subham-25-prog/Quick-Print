import * as http from 'node:http';
import { AgentConfig } from './config';

export class AgentHealthServer {
  private lastHeartbeat = 0;
  private printers: string[] = [];
  private activePrinter = '';

  constructor(private config: AgentConfig) {}

  updatePrinters(printers: string[], active: string) {
    this.printers = printers;
    this.activePrinter = active;
  }

  recordHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  start(port = 9191) {
    http
      .createServer((req, res) => {
        if (!['127.0.0.1:9191', 'localhost:9191'].includes(req.headers.host || '')) {
          res.writeHead(403).end();
          return;
        }

        const isOnline = Date.now() - this.lastHeartbeat < 90000;
        const state = {
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          lastHeartbeat: this.lastHeartbeat || null,
          agentId: this.config.agentId,
          mode: this.config.mode,
          simulation: this.config.simulatePrint,
          activePrinter: this.activePrinter,
          printers: this.printers,
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify(state, null, 2));
      })
      .listen(port, '127.0.0.1');
  }
}
