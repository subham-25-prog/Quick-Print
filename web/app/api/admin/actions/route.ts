import {NextRequest,NextResponse} from 'next/server';
import {database,getOrderById} from '@/lib/db';
import {isAdminRequest,adminUnauthorizedResponse} from '@/lib/admin-auth';
import {apiError,HttpError,readJson,requireSameOrigin} from '@/lib/http';
import {getCurrentShopId} from '@/lib/shop';
import {uuid} from '@/lib/validation';
export async function POST(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{
    requireSameOrigin(req);const body=await readJson(req),id=uuid(body.orderId);
    if(body.action!=='RETRY_PRINT')throw new HttpError(409,'Payment and print status are controlled by verification and the print agent.');
    if(!await getOrderById(id))throw new HttpError(404,'Order not found.');
    const {error}=await database().rpc('retry_safe_print',{p_shop_id:getCurrentShopId(),p_order_id:id});
    if(error)throw new HttpError(409,'Only a failure before dispatch can be retried. Check uncertain jobs at the printer.');
    return NextResponse.json({success:true,order:await getOrderById(id)});
  }catch(e){return apiError(e);}
}
