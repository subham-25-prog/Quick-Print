import { beforeEach, expect, test, vi } from 'vitest';
import AdmZip from 'adm-zip';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  isAdminRequest: () => true,
  adminUnauthorizedResponse: () => new Response('unauthorized', { status: 401 }),
}));

import { GET } from '@/app/api/admin/agent-download/route';

beforeEach(() => {
  vi.stubEnv('PRINT_AGENT_SECRET', 'a'.repeat(40));
  vi.stubEnv('PRINT_AGENT_ID', 'agent-main-pc');
  vi.stubEnv('APP_URL', 'https://shop.example');
});

test('agent download includes configured credentials and the one-step installer', async () => {
  const response = await GET(new NextRequest('https://shop.example/api/admin/agent-download'));

  expect(response.status).toBe(200);
  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const env = zip.readAsText('.env');

  expect(env).toContain('BACKEND_URL="https://shop.example"');
  expect(env).toContain('PRINT_AGENT_SECRET="' + 'a'.repeat(40) + '"');
  expect(zip.readAsText('install_agent.cmd')).toContain('install_agent.ps1');
  expect(zip.readAsText('install_agent.ps1')).toContain('install_service.ps1');
});
