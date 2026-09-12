import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {Journal,acquireLock} from '../../print-agent/src/journal';
import {AgentWorker} from '../../print-agent/src/worker';
import {ClaimedJob} from '../../print-agent/src/client';
import {printerHasBlockingError,WindowsPrinterService,parseDetectedPrinters} from '../../print-agent/src/printer';
let dir:string;
test('Windows no-error code 2 is ready; actual offline/jam/paper errors block',()=>{
  expect(printerHasBlockingError({PrinterStatus:3,DetectedErrorState:2})).toBe(false);
  for(const code of [4,6,7,8,9,10,11])expect(printerHasBlockingError({DetectedErrorState:code})).toBe(true);
  expect(printerHasBlockingError({WorkOffline:true})).toBe(true);
  expect(printerHasBlockingError(undefined)).toBe(true);
});
test('simulation cannot accept live jobs and physical driver cannot accept sandbox jobs',async()=>{
  await expect(new WindowsPrinterService('',true).printDocument('unused',{is_test:false} as ClaimedJob)).rejects.toThrow();
  await expect(new WindowsPrinterService('',false).printDocument('unused',{is_test:true} as ClaimedJob)).rejects.toThrow();
});
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'quickprint-agent-test-'));});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const job={job_id:'job1',claim_token:'claim1',order_id:'order1',is_test:true} as ClaimedJob;
test('only one local agent process can own a state directory',()=>{
  const path=join(dir,'agent.lock'),release=acquireLock(path);
  expect(()=>acquireLock(path)).toThrow('already running');
  release();const second=acquireLock(path);second();
});
function fixture(){const client={claimNextJob:vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),downloadDocument:vi.fn().mockResolvedValue(''),startJob:vi.fn().mockResolvedValue(undefined),reportJobCompletion:vi.fn().mockResolvedValue(undefined)};
  const printer={ensureReady:vi.fn().mockResolvedValue(undefined),printDocument:vi.fn().mockResolvedValue(undefined)};
  return{client,printer,journal:new Journal(join(dir,'journal.jsonl'))};}
test('overlapping polling performs one dispatch',async()=>{const f=fixture();const w=new AgentWorker(f.client,f.printer,f.journal,dir);await Promise.all([w.tick(),w.tick(),w.tick()]);expect(f.printer.printDocument).toHaveBeenCalledTimes(1);});
test('completion network failure and restart retry ACK without reprinting',async()=>{
  const f=fixture();f.client.reportJobCompletion.mockRejectedValueOnce(new Error('offline'));
  await expect(new AgentWorker(f.client,f.printer,f.journal,dir).tick()).rejects.toThrow();
  const next=new AgentWorker(f.client,f.printer,new Journal(join(dir,'journal.jsonl')),dir);await next.tick();
  expect(f.printer.printDocument).toHaveBeenCalledTimes(1);expect(f.client.reportJobCompletion).toHaveBeenLastCalledWith(job,'SUBMITTED');
});
test('printer error after dispatch becomes REVIEW and never automatic retry',async()=>{const f=fixture();f.printer.printDocument.mockRejectedValue(new Error('unknown spool outcome'));const w=new AgentWorker(f.client,f.printer,f.journal,dir);await w.tick();await w.tick();expect(f.client.reportJobCompletion).toHaveBeenCalledWith(job,'REVIEW');expect(f.printer.printDocument).toHaveBeenCalledTimes(1);});
test('crash at dispatch boundary becomes REVIEW',async()=>{const f=fixture();f.journal.append({job,state:'STARTING'});f.client.claimNextJob.mockReset().mockResolvedValue(null);await new AgentWorker(f.client,f.printer,new Journal(join(dir,'journal.jsonl')),dir).tick();expect(f.printer.printDocument).not.toHaveBeenCalled();expect(f.client.reportJobCompletion).toHaveBeenCalledWith(job,'REVIEW');});
test('offline printer does not claim; bad download never starts',async()=>{const f=fixture();f.printer.ensureReady.mockRejectedValueOnce(new Error('offline'));const w=new AgentWorker(f.client,f.printer,f.journal,dir);await expect(w.tick()).rejects.toThrow();expect(f.client.claimNextJob).not.toHaveBeenCalled();f.client.downloadDocument.mockRejectedValue(new Error('expired'));await w.tick();expect(f.client.startJob).not.toHaveBeenCalled();expect(f.client.reportJobCompletion).toHaveBeenCalledWith(job,'FAILED');});

test('printer service reports installed printers and supports dynamic switching',async()=>{
  const service = new WindowsPrinterService('Printer A', true);
  expect(service.getConfiguredPrinter()).toBe('Printer A');
  service.setConfiguredPrinter('Printer B');
  expect(service.getConfiguredPrinter()).toBe('Printer B');

});

test('printer discovery filters virtual queues and preserves offline and error states', () => {
  expect(parseDetectedPrinters([
    {Name:'HP LaserJet', WorkOffline:true},
    {Name:'Canon', PrinterStatus:3, DetectedErrorState:2},
    {Name:'Epson', DetectedErrorState:7},
    {Name:'Microsoft Print to PDF', PortName:'PORTPROMPT:'},
  ])).toEqual([
    {name:'HP LaserJet',status:'OFFLINE'},
    {name:'Canon',status:'ONLINE'},
    {name:'Epson',status:'ERROR'},
  ]);
  expect(parseDetectedPrinters(null)).toEqual([]);
  expect(parseDetectedPrinters({Name:'Single Printer', PrinterStatus:3})).toEqual([{name:'Single Printer',status:'ONLINE'}]);
});

