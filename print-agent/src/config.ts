import * as dotenv from 'dotenv';
import * as path from 'node:path';
dotenv.config({path:path.resolve(process.cwd(),'.env')});
export interface AgentConfig{backendUrl:string;agentSecret:string;agentId:string;printerName:string;pollIntervalMs:number;heartbeatIntervalMs:number;downloadDir:string;simulatePrint:boolean;mode:'live'|'sandbox';stateDir:string;}
export function loadConfig():AgentConfig{
  const backendUrl=process.env.BACKEND_URL||'';
  const u=new URL(backendUrl);
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('BACKEND_URL must use HTTPS');
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('BACKEND_URL must be the canonical origin');
  const agentSecret=process.env.PRINT_AGENT_SECRET||'',agentId=process.env.AGENT_ID||'',mode=process.env.AGENT_MODE;
  if(agentSecret.length<32||!agentId||!['live','sandbox'].includes(mode||''))throw new Error('Agent ID, 32-character secret and AGENT_MODE are required');
  const simulatePrint=process.argv.includes('--simulate')||process.env.SIMULATE_PRINT==='true';
  if(simulatePrint&&mode!=='sandbox')throw new Error('Simulation requires sandbox mode and cannot claim live payments');
  if(!simulatePrint&&mode!=='live')throw new Error('Sandbox jobs must use simulation');
  const printerName=process.env.PRINTER_NAME||'';
  if(!simulatePrint&&!printerName)throw new Error('Select PRINTER_NAME explicitly before starting the live agent');
  function duration(value:string|undefined,fallback:number){const n=Number(value||fallback);if(!Number.isSafeInteger(n)||n<1000||n>60000)throw new Error('Invalid interval');return n;}
  return {backendUrl:u.origin,agentSecret,agentId,printerName,mode:mode as 'live'|'sandbox',simulatePrint,
    pollIntervalMs:duration(process.env.POLL_INTERVAL_MS,5000),heartbeatIntervalMs:duration(process.env.HEARTBEAT_INTERVAL_MS,15000),
    downloadDir:path.resolve(process.env.DOWNLOAD_DIR||'./temp_jobs'),stateDir:path.resolve(process.env.STATE_DIR||'./state')};
}
