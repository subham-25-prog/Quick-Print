import {NextRequest,NextResponse} from 'next/server';
import {database} from '@/lib/db';
import {agentIdentity} from '@/lib/security';
import {getCurrentShopId} from '@/lib/shop';
import {apiError,HttpError,readJson} from '@/lib/http';
import {uuid} from '@/lib/validation';
export async function POST(req:NextRequest){
  try{const id=agentIdentity(req),body=await readJson(req);
    const {error}=await database().rpc('start_print_job',{p_shop_id:getCurrentShopId(),p_agent_id:id,p_job_id:uuid(body.jobId),p_claim_token:uuid(body.claimToken)});
    if(error)throw new HttpError(409,'Claim is expired or already dispatched.');
    return NextResponse.json({success:true});
  }catch(e){return apiError(e);}
}
