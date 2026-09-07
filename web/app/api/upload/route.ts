import { NextRequest,NextResponse } from 'next/server';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {database} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {getPdfPageCount,isValidFileType} from '@/lib/pdf';
import {apiError,HttpError,requireSameOrigin,readBytes} from '@/lib/http';
import {createOrderAccessToken} from '@/lib/order-access';
import {rateLimit,hash} from '@/lib/security';
export async function POST(req:NextRequest){
  try{
    requireSameOrigin(req);await rateLimit(req,'upload',10);
    if(Number(req.headers.get('content-length'))>4300000)throw new HttpError(413,'Upload must be at most 4 MB.');
    const type=req.headers.get('content-type')||'';
    if(!type.startsWith('multipart/form-data'))throw new HttpError(415,'A multipart upload is required.');
    let form:FormData;
    try{form=await new Response(new Uint8Array(await readBytes(req,4300000)),{headers:{'Content-Type':type}}).formData();}
    catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid upload.');}
    const file=form.get('file');
    if(!(file instanceof File)||file.size<1||file.size>4194304||file.name.length>200||!isValidFileType(file.type,file.name))throw new HttpError(400,'Upload a PDF, JPG, or PNG up to 4 MB.');
    const raw=Buffer.from(await file.arrayBuffer());let buffer=raw;
    const ext=file.name.split('.').pop()?.toLowerCase();
    const pdf=raw.subarray(0,5).toString()==='%PDF-';
    const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=raw[0]===255&&raw[1]===216&&raw[2]===255;
    if(file.type&&!(pdf&&file.type==='application/pdf'||png&&file.type==='image/png'||jpg&&['image/jpeg','image/jpg'].includes(file.type)))throw new HttpError(400,'File MIME type does not match its contents.');
    if(png&&(raw.length<24||raw.readUInt32BE(16)*raw.readUInt32BE(20)>40000000))throw new HttpError(422,'Image dimensions are too large.');
    if(!(pdf&&ext==='pdf'||png&&ext==='png'||jpg&&['jpg','jpeg'].includes(ext||'')))throw new HttpError(400,'File contents do not match the extension.');
    if(!pdf){
      try{
        const doc=await PDFDocument.create();const page=doc.addPage([595.28,841.89]);
        const img=png?await doc.embedPng(raw):await doc.embedJpg(raw);
        if(img.width*img.height>40000000)throw new Error('Image too large');
        const size=img.scaleToFit(555.28,801.89);
        page.drawImage(img,{x:(595.28-size.width)/2,y:(841.89-size.height)/2,...size});
        buffer=Buffer.from(await doc.save());
      }catch{throw new HttpError(422,'This image could not be processed. Try a smaller image.');}
    }
    let pageCount:number;
    try{pageCount=await getPdfPageCount(buffer);}catch(e){throw new HttpError(422,(e as Error).message);}
    if(buffer.length>4194304)throw new HttpError(413,'The converted document exceeds 4 MB.');
    const db=database(),shop=getCurrentShopId(),id=randomUUID(),uploadToken=randomBytes(32).toString('hex');
    const storagePath=`${shop}/orders/${id}.pdf`;
    const previewToken=createOrderAccessToken(id,900);if(!previewToken)throw new HttpError(503,'Upload access security is not configured.');
    const {data:bucket,error:be}=await db.storage.getBucket('shop-documents');
    if(be||!bucket||bucket.public)throw new HttpError(503,'Private document storage is unavailable.');
    const {error:ue}=await db.storage.from('shop-documents').upload(storagePath,buffer,{contentType:'application/pdf',upsert:false});
    if(ue)throw ue;
    const {error}=await db.from('uploaded_files').insert({id,shop_id:shop,owner_hash:hash(uploadToken),storage_path:storagePath,file_name:file.name,file_size_bytes:buffer.length,page_count:pageCount,sha256:createHash('sha256').update(buffer).digest('hex')});
    if(error){await db.storage.from('shop-documents').remove([storagePath]);throw error;}
    return NextResponse.json({success:true,fileInfo:{uploadId:id,uploadToken,fileName:file.name,fileType:'application/pdf',fileSizeBytes:buffer.length,pageCount,storagePath,
      signedUrl:`/api/uploads/${id}?access_token=${encodeURIComponent(previewToken)}`}});
  }catch(e){return apiError(e);}
}
