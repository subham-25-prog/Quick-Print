import {NextRequest,NextResponse} from 'next/server';
import {database,getOrderById} from '@/lib/db';
import {isAdminRequest} from '@/lib/admin-auth';
import {hasOrderAccess} from '@/lib/order-access';
import {agentIdentity} from '@/lib/security';
import {getCurrentShopId} from '@/lib/shop';
import {apiError,HttpError} from '@/lib/http';
import {uuid} from '@/lib/validation';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const id=uuid((await params).id),db=database(),shop=getCurrentShopId();
    let allowed=isAdminRequest(req)||hasOrderAccess(req,id);
    if(!allowed){
      const agent=agentIdentity(req);
      const {data:job,error}=await db.from('print_jobs').select('id').eq('order_id',id).eq('shop_id',shop).eq('claimed_by',agent).eq('claim_token',uuid(req.headers.get('x-claim-token'))).eq('status','CLAIMED').gt('lease_until',new Date().toISOString()).maybeSingle();
      if(error)throw error;allowed=Boolean(job);
    }
    if(!allowed)throw new HttpError(404,'Document not found.');
    const order=await getOrderById(id);if(!order)throw new HttpError(404,'Document not found.');
    const {data:file,error}=await db.from('uploaded_files').select('storage_path').eq('id',order.uploaded_file_id).eq('shop_id',shop).is('deleted_at',null).maybeSingle();
    if(error)throw error;if(!file||!file.storage_path.startsWith(`${shop}/orders/`))throw new HttpError(404,'Document has expired.');
    const {data,error:se}=await db.storage.from('shop-documents').download(file.storage_path);if(se||!data)throw new HttpError(404,'Document unavailable.');
    return new NextResponse(await data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="document.pdf"','Cache-Control':'private, no-store'}});
  }catch(e){return apiError(e);}
}
