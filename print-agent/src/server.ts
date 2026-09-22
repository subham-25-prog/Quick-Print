import * as http from 'node:http';
import { AgentConfig } from './config';

export class AgentHealthServer {
  private lastHeartbeat = 0;
  private printers: string[] = [];
  private activePrinter = '';
  private server: http.Server | undefined;

  constructor(private config: AgentConfig) {}

  updatePrinters(printers: string[], active: string) {
    this.printers = printers;
    this.activePrinter = active;
  }

  recordHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  async start(port = 9191): Promise<void> {
    if (this.server) throw new Error('Health server already started');

    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const server = http.createServer((req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' }).end();
          return;
        }
        if (!allowedHosts.has(req.headers.host || '')) {
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
      });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });

    server.on('error', (error) => {
      console.error(JSON.stringify({ event: 'health_server_error', message: error.message }));
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
