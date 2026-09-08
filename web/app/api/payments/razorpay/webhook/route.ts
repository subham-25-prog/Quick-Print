import { NextRequest, NextResponse } from 'next/server';
import { GET as baseGet, POST as basePost, HEAD as baseHead } from '../../webhook/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return baseGet();
}

export async function HEAD() {
  return baseHead();
}

export async function POST(req: NextRequest) {
  return basePost(req);
}
