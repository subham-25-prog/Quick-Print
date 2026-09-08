import {NextRequest,NextResponse} from 'next/server';
import {database} from '@/lib/db';
import {isAdminRequest,adminUnauthorizedResponse} from '@/lib/admin-auth';
import {getCurrentShopId} from '@/lib/shop';
export async function GET(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{
    const shopId = getCurrentShopId();
    const {data:shop,error}=await database().from('shops').select('id, name').eq('id',shopId).single();
    if(error)throw error;
    const {data:settings}=await database().from('shop_settings').select('pricing').eq('shop_id',shopId).maybeSingle();
    const shopName = settings?.pricing?.shop_name || shop?.name || process.env.NEXT_PUBLIC_SHOP_NAME || 'QuickPrint';
    return NextResponse.json({connected:true,mode:'SUPABASE',message:'Database connected.', shopName});
  }catch{return NextResponse.json({connected:false,mode:'UNAVAILABLE',message:'Database unavailable. Checkout fails closed.'});}
}
