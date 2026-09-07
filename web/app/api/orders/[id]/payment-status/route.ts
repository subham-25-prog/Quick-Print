import {NextRequest,NextResponse} from 'next/server';
import {getOrderById} from '@/lib/db';
import {hasOrderAccess} from '@/lib/order-access';
import {apiError,HttpError} from '@/lib/http';
import {uuid} from '@/lib/validation';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{const id=uuid((await params).id);if(!hasOrderAccess(req,id))throw new HttpError(404,'Order not found.');
    const order=await getOrderById(id);if(!order)throw new HttpError(404,'Order not found.');
    return NextResponse.json({status:order.payment_status==='PAID'?'SUCCESS':'PENDING',orderId:id});
  }catch(e){return apiError(e);}
}
