import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
const mocks = vi.hoisted(() => ({ store: new Map<string, Blob>(), records: [] as Record<string, unknown>[],
  upload: vi.fn(), download: vi.fn(), remove: vi.fn(), insert: vi.fn(), rate: vi.fn(), bucket: vi.fn() }));
vi.mock('@/lib/db', () => ({ database: () => ({
  storage: { getBucket: mocks.bucket, from: () => ({upload:mocks.upload,download:mocks.download,remove:mocks.remove}) },
  from: () => ({insert:mocks.insert}),
}) }));
vi.mock('@/lib/security', async original => ({...await original<object>(),rateLimit:mocks.rate}));
import { POST } from '@/app/api/upload/route';
const id = '00000000-0000-4000-8000-000000000009';
beforeEach(() => {
  vi.stubEnv('QUICKPRINT_SHOP_ID','00000000-0000-4000-8000-000000000001');
  vi.stubEnv('ORDER_ACCESS_SECRET','test-upload-signing-secret-32-characters');
  mocks.store.clear(); mocks.records.length=0; mocks.rate.mockReset();
  mocks.bucket.mockReset().mockResolvedValue({data:{public:false,file_size_limit:104857600},error:null});
  mocks.upload.mockReset().mockImplementation(async (path:string, bytes:Uint8Array, options:{upsert:boolean}) => {
    if (mocks.store.has(path) && !options.upsert) return {error:{message:'Exists'}};
    mocks.store.set(path,new Blob([new Uint8Array(bytes)])); return {error:null};
  });
  mocks.download.mockReset().mockImplementation(async (path:string) => ({data:mocks.store.get(path),error:null}));
  mocks.remove.mockReset().mockImplementation(async (paths:string[]) => {paths.forEach(p=>mocks.store.delete(p)); return {error:null};});
  mocks.insert.mockReset().mockImplementation(async (record:Record<string,unknown>) => {mocks.records.push(record);return {error:null};});
});
afterEach(()=>vi.unstubAllEnvs());
async function pdf() {const doc=await PDFDocument.create();doc.addPage();return doc.save();}
function request(form:FormData) {return new NextRequest('https://shop.test/api/upload',{method:'POST',body:form});}
function chunk(bytes:Uint8Array, index:number, size:number, token='a'.repeat(64), indexText=String(index)) {
  const form=new FormData(); form.set('file',new File([new Uint8Array(bytes)],'test.pdf',{type:'application/pdf'}));
  for(const [key,value] of Object.entries({chunkIndex:indexText,totalChunks:'2',uploadId:id,uploadToken:token,fileName:'test.pdf',fileSizeBytes:String(size)})) form.set(key,value);
  return request(form);
}
test('normal multipart PDF still stores a private document and returns access',async()=>{
  const bytes=await pdf(); const form=new FormData();form.set('file',new File([new Uint8Array(bytes)],'test.pdf',{type:'application/pdf'}));
  const response=await POST(request(form));expect(response.status).toBe(200);
  const {fileInfo}=await response.json();expect(fileInfo.pageCount).toBe(1);expect(fileInfo.uploadToken).toHaveLength(64);
  expect(mocks.store.has(fileInfo.storagePath)).toBe(true);expect(mocks.records).toHaveLength(1);
});
test('two chunks finalize with a server-generated ID and cannot overwrite a known victim path',async()=>{
  const bytes=await pdf(),split=Math.floor(bytes.length/2),victim=`orders/${id}.pdf`;
  mocks.store.set(victim,new Blob(['victim']));
  expect((await POST(chunk(bytes.slice(0,split),0,bytes.length))).status).toBe(200);
  const response=await POST(chunk(bytes.slice(split),1,bytes.length));expect(response.status).toBe(200);
  const {fileInfo}=await response.json();expect(fileInfo.uploadId).not.toBe(id);expect(fileInfo.pageCount).toBe(1);
  expect(await mocks.store.get(victim)!.text()).toBe('victim');
  expect([...mocks.store.keys()].filter(p=>p.includes('/chunks/'))).toHaveLength(0);
});
test('a 110-page PDF can be reassembled from chunks and retains its actual page count', async () => {
  const document = await PDFDocument.create();
  for (let page = 0; page < 110; page++) document.addPage();
  const bytes = await document.save();
  const split = Math.floor(bytes.length / 2);

  expect((await POST(chunk(bytes.slice(0, split), 0, bytes.length))).status).toBe(200);
  const response = await POST(chunk(bytes.slice(split), 1, bytes.length));
  expect(response.status).toBe(200);
  expect((await response.json()).fileInfo.pageCount).toBe(110);
});
test('knowing upload ID with wrong owner token cannot read or delete its chunks',async()=>{
  const bytes=await pdf(),split=Math.floor(bytes.length/2);
  await POST(chunk(bytes.slice(0,split),0,bytes.length));
  const ownerPath=[...mocks.store.keys()][0];
  expect((await POST(chunk(bytes.slice(split),1,bytes.length,'b'.repeat(64)))).status).toBe(500);
  expect(mocks.download).not.toHaveBeenCalledWith(ownerPath);
  expect(mocks.store.has(ownerPath)).toBe(true);expect(mocks.remove).not.toHaveBeenCalled();
  expect((await POST(chunk(bytes.slice(split),1,bytes.length))).status).toBe(200);
});
test('insert failure cleans up only the newly created document',async()=>{
  const bytes=await pdf(),split=Math.floor(bytes.length/2),victim=`orders/${id}.pdf`;
  mocks.store.set(victim,new Blob(['victim']));
  await POST(chunk(bytes.slice(0,split),0,bytes.length));
  mocks.insert.mockResolvedValue({error:{message:'Database unavailable'}});
  expect((await POST(chunk(bytes.slice(split),1,bytes.length))).status).toBe(500);
  expect(await mocks.store.get(victim)!.text()).toBe('victim');
  expect(mocks.remove.mock.calls.flat(2)).not.toContain(victim);
});
test.each(['1junk','0.5','-1'])('invalid chunk index %s is rejected before storage',async index=>{
  expect((await POST(chunk(new Uint8Array([1]),1,2,'a'.repeat(64),index))).status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled();
});
test('oversized declared total is rejected before storage',async()=>{
  expect((await POST(chunk(new Uint8Array([1]),0,101*1024*1024))).status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
});
test('assembled bytes exceeding declared size cannot be parsed or finalized',async()=>{
  const bytes=await pdf(),split=Math.floor(bytes.length/2);
  await POST(chunk(bytes.slice(0,split),0,bytes.length-1));
  expect((await POST(chunk(bytes.slice(split),1,bytes.length-1))).status).toBe(413);
  expect(mocks.insert).not.toHaveBeenCalled();
});
