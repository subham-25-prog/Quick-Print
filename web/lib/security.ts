import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from './db';
import { getCurrentShopId } from './shop';
import { HttpError } from './http';
export function hash(value:string){return createHash('sha256').update(value).digest('hex');}
export function equalSecret(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);}
export function appOrigin(){
  const origin=process.env.NEXT_PUBLIC_APP_URL;
  if(!origin)throw new HttpError(503,'The shop URL is not configured.');
  const u=new URL(origin);
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&u.hostname==='localhost')))throw new Error('Invalid application URL');
  return u.origin;
}
export async function rateLimit(req:Request,scope:string,limit:number,seconds=60){
  const ip=process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for')||'unknown' : 'local';
  const key=hash(`${getCurrentShopId()}:${scope}:${ip}`);
  const {data,error}=await database().rpc('consume_rate_limit',{p_key:key,p_limit:limit,p_seconds:seconds});
  if(error)throw error;
  if(data!==true)throw new HttpError(429,'Too many requests. Please wait a minute and retry.');
}
export function agentIdentity(req:Request){
  const expectedId=process.env.PRINT_AGENT_ID||'';
  const expected=process.env.PRINT_AGENT_SECRET||'';
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  const id=req.headers.get('x-agent-id')||'';
  if(!expectedId||expected.length<32||id!==expectedId||!equalSecret(expected,token))throw new HttpError(401,'Invalid agent credentials.');
  return id;
}
