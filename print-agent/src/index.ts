import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadConfig} from './config';
import {ShopApiClient} from './client';
import {WindowsPrinterService} from './printer';
import {AgentHealthServer} from './server';
import {Journal,acquireLock} from './journal';
import {AgentWorker} from './worker';
async function main(){
  const config=loadConfig();
  fs.mkdirSync(config.stateDir,{recursive:true});fs.mkdirSync(config.downloadDir,{recursive:true});
  const release=acquireLock(path.join(config.stateDir,'agent.lock'));
  process.once('exit',release);
  const client=new ShopApiClient(config),printer=new WindowsPrinterService(config.printerName,config.simulatePrint);
  const health=new AgentHealthServer(config);health.start();
  const journal=new Journal(path.join(config.stateDir,'dispatch.jsonl'));
  const worker=new AgentWorker(client,printer,journal,config.downloadDir);
  health.updatePrinters(await printer.getInstalledPrinters(),config.printerName||'Sandbox simulation');
  console.log(JSON.stringify({event:'agent_started',agentId:config.agentId,mode:config.mode,simulation:config.simulatePrint}));
  let stopping=false;
  process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
  let heartbeatAt=0,backoff=config.pollIntervalMs;
  while(!stopping){
    try{
      if(Date.now()-heartbeatAt>=config.heartbeatIntervalMs){await client.sendHeartbeat(config.printerName||'Sandbox simulation');health.recordHeartbeat();heartbeatAt=Date.now();}
      await worker.tick();
      backoff=config.pollIntervalMs;
    }catch{
      // Axios errors may contain Authorization headers: never serialize them.
      console.error(JSON.stringify({event:'agent_unavailable',retryInMs:backoff}));
      backoff=Math.min(60000,backoff*2);
    }
    await new Promise(resolve=>setTimeout(resolve,backoff));
  }
  release();process.exit(0);
}
main().catch(()=>{console.error('Agent could not start. Check configuration, printer selection and the state directory.');process.exit(1);});
