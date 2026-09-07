import {NextRequest,NextResponse} from 'next/server';
import {recordAgentHeartbeat,getPrintAgentInfo} from '@/lib/db';
import {agentIdentity} from '@/lib/security';
import {isAdminRequest,adminUnauthorizedResponse} from '@/lib/admin-auth';
import {apiError,HttpError,readJson} from '@/lib/http';
import {textField} from '@/lib/validation';
export async function GET(req:NextRequest){if(!isAdminRequest(req))return adminUnauthorizedResponse();try{return NextResponse.json({agent:await getPrintAgentInfo()});}catch(e){return apiError(e);}}
export async function POST(req:NextRequest){
  try{const id=agentIdentity(req),body=await readJson(req);
    const mode=body.mode;if(mode!=='live'&&mode!=='sandbox')throw new HttpError(400,'Agent mode is required.');
    if(mode!==process.env.PAYMENT_ENVIRONMENT)throw new HttpError(409,'Agent and payment environment must match.');
    await recordAgentHeartbeat(id,textField(body.printerName,200)||'Unavailable',textField(body.systemInfo,200),mode);
    return NextResponse.json({success:true});
  }catch(e){return apiError(e);}
}
