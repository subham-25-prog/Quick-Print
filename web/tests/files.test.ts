import { expect,test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {getPdfPageCount,isValidFileType} from '@/lib/pdf';
import {printOptions} from '@/lib/validation';
import {defaultPricingConfig} from '@/lib/config';
test('counts actual PDF pages and rejects malformed/encrypted files',async()=>{
  const pdf=await PDFDocument.create();for(let i=0;i<7;i++)pdf.addPage();
  expect(await getPdfPageCount(await pdf.save())).toBe(7);
  await expect(getPdfPageCount(Buffer.from('%PDF-1.7\nbroken'))).rejects.toThrow('malformed');
  await expect(getPdfPageCount(Buffer.from('%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj'))).rejects.toThrow();
});
test('extension and MIME must both be allowed',()=>{
  expect(isValidFileType('application/pdf','run.exe')).toBe(false);
  expect(isValidFileType('text/html','file.pdf')).toBe(false);
});
test('tampered quantities and unsupported print settings rejected',()=>{
  for(const copies of [-1,0,0.5,Infinity,101,'2']) expect(()=>printOptions({copies},defaultPricingConfig)).toThrow();
  expect(()=>printOptions({paperSize:'bad'},defaultPricingConfig)).toThrow();
  expect(()=>printOptions({advancedConfig:{watermark:'DRAFT'}},defaultPricingConfig)).toThrow();
});
