import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return adminUnauthorizedResponse();
  }

  try {
    const zipPath = path.join(process.cwd(), 'public', 'downloads', 'quickprint-agent.zip');
    
    if (!fs.existsSync(zipPath)) {
      return NextResponse.json({ error: 'Agent template zip not found on server' }, { status: 404 });
    }

    const zip = new AdmZip(zipPath);

    // Get the base URL from the incoming request so it maps to their live site correctly
    const backendUrl = req.nextUrl.origin;
    const printAgentSecret = process.env.PRINT_AGENT_SECRET || '';

    // Create the content for the .env file
    const envContent = `BACKEND_URL="${backendUrl}"
PRINT_AGENT_SECRET="${printAgentSecret}"
AGENT_MODE="live"
`;

    // Add or replace the .env file in the zip archive
    zip.addFile('.env', Buffer.from(envContent, 'utf8'));

    // Get the zip buffer
    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="quickprint-agent.zip"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Error generating agent zip:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
