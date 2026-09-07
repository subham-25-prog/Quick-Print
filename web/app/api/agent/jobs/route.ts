import {NextRequest,NextResponse} from 'next/server';
import {claimNextPrintJob} from '@/lib/db';
import {agentIdentity} from '@/lib/security';
import {apiError} from '@/lib/http';
export async function POST(req:NextRequest){try{return NextResponse.json(await claimNextPrintJob(agentIdentity(req)));}catch(e){return apiError(e);}}
