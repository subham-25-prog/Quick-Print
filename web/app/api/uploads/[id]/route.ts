import {NextRequest,NextResponse} from 'next/server';
import {database} from '@/lib/db';
import {getCurrentShopId} from '@/lib/shop';
import {hasOrderAccess} from '@/lib/order-access';
import {uuid} from '@/lib/validation';
import {apiError,HttpError} from '@/lib/http';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const id=uuid((await params).id);
    if(!hasOrderAccess(req,id))throw new HttpError(404,'Document link is invalid or expired.');
    const db=database(),shop=getCurrentShopId();
    const {data:f,error}=await db.from('uploaded_files').select('storage_path,expires_at').eq('id',id).eq('shop_id',shop).is('deleted_at',null).is('deletion_claimed_at',null).maybeSingle();
    if(error)throw error;if(!f||Date.parse(f.expires_at)<Date.now())throw new HttpError(404,'Document not found.');
    const {data,error:se}=await db.storage.from('shop-documents').download(f.storage_path);if(se||!data)throw new HttpError(404,'Document not found.');
    return new NextResponse(await data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'inline; filename="preview.pdf"'}});
  }catch(e){return apiError(e);}
}
