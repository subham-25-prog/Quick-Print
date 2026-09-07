import {NextRequest,NextResponse} from 'next/server';
import {database} from '@/lib/db';
import {isAdminRequest,adminUnauthorizedResponse} from '@/lib/admin-auth';
import {getCurrentShopId} from '@/lib/shop';
export async function GET(req:NextRequest){
  if(!isAdminRequest(req))return adminUnauthorizedResponse();
  try{const {error}=await database().from('shops').select('id').eq('id',getCurrentShopId()).single();if(error)throw error;
    return NextResponse.json({connected:true,mode:'SUPABASE',message:'Database connected.'});
  }catch{return NextResponse.json({connected:false,mode:'UNAVAILABLE',message:'Database unavailable. Checkout fails closed.'});}
}
