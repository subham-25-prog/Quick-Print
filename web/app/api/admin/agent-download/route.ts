import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { isAdminRequest, adminUnauthorizedResponse } from '@/lib/admin-auth';
import { appOrigin } from '@/lib/security';

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

    // Never trust an incoming Host header for a credential-bearing agent package.
    const backendUrl = appOrigin();
    const printAgentSecret = process.env.PRINT_AGENT_SECRET || '';

    const printAgentId = process.env.PRINT_AGENT_ID || 'agent-main-pc';

    // Create the content for the .env file
    const envContent = `BACKEND_URL="${backendUrl}"
PRINT_AGENT_SECRET="${printAgentSecret}"
AGENT_ID="${printAgentId}"
AGENT_MODE="live"
PRINTER_NAME=""
POLL_INTERVAL_MS="1500"
HEARTBEAT_INTERVAL_MS="1500"
`;

    // Add or replace the .env file in the zip archive
    zip.addFile('.env', Buffer.from(envContent, 'utf8'));

    // Browsers cannot execute downloaded files. Include a single installer so
    // the shop user only needs to extract the zip and run it once; it installs
    // dependencies, registers quickprint://, enables logon startup and launches
    // the already-configured agent.
    for (const fileName of ['install_agent.cmd', 'install_agent.ps1']) {
      const installerPath = path.join(process.cwd(), 'public', 'downloads', fileName);
      if (!fs.existsSync(installerPath)) {
        throw new Error(`Agent installer file is missing: ${fileName}`);
      }
      zip.addFile(fileName, fs.readFileSync(installerPath));
    }

    // Get the zip buffer
    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer as unknown as BodyInit, {
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
