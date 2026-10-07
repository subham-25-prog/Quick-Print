import { expect,test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {getJpegDimensions,getPdfPageCount,getPngDimensions,isValidFileType} from '@/lib/pdf';
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
test('image dimensions are bounded before decoding',()=>{
  const png=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(png);
  png.writeUInt32BE(4000,16); png.writeUInt32BE(3000,20);
  expect(getPngDimensions(png)).toEqual({width:4000,height:3000});

  const jpeg=Buffer.from([0xff,0xd8,0xff,0xc0,0,8,8,0,16,0,32,0]);
  expect(getJpegDimensions(jpeg)).toEqual({width:32,height:16});

  png.writeUInt32BE(65535,16); png.writeUInt32BE(65535,20);
  expect(()=>getPngDimensions(png)).toThrow('too large');
  expect(()=>getJpegDimensions(Buffer.from([0xff,0xd8,0xff,0xc0,0,8,8,0xff,0xff,0xff,0xff,0]))).toThrow('too large');
});
test('tampered quantities and unsupported print settings rejected',()=>{
  for(const copies of [-1,0,0.5,Infinity,101,'2']) expect(()=>printOptions({copies},defaultPricingConfig)).toThrow();
  expect(()=>printOptions({paperSize:'bad'},defaultPricingConfig)).toThrow();
  expect(()=>printOptions({advancedConfig:{watermark:'INVALID'}},defaultPricingConfig)).toThrow();
  expect(printOptions({advancedConfig:{watermark:'DRAFT'}},defaultPricingConfig).advancedConfig?.watermark).toBe('DRAFT');
});
