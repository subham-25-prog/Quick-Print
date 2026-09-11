import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { createAdminSession, isAdminSecurityConfigured, verifyAdminPin } from '@/lib/admin-auth';
import { agentIdentity } from '@/lib/security';

beforeEach(() => vi.stubEnv('QUICKPRINT_SHOP_ID', '00000000-0000-4000-8000-000000000001'));
afterEach(() => vi.unstubAllEnvs());

test('production admin access fails closed when credentials are missing or too short', () => {
  vi.stubEnv('NODE_ENV', 'production');
  for (const secret of ['', 'short']) {
    vi.stubEnv('ADMIN_SESSION_SECRET', secret);
    vi.stubEnv('ADMIN_PIN', '');
    expect(isAdminSecurityConfigured()).toBe(false);
    expect(verifyAdminPin('123456')).toBe(false);
    expect(createAdminSession()).toBeNull();
  }
});

test('configured production admin credentials still work', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-secret-that-is-long-enough');
  vi.stubEnv('ADMIN_PIN', '975310');
  expect(isAdminSecurityConfigured()).toBe(true);
  expect(verifyAdminPin('975310')).toBe(true);
  expect(createAdminSession()).not.toBeNull();
});

test('agent authentication requires an explicitly configured secret', () => {
  vi.stubEnv('PRINT_AGENT_SECRET', '');
  expect(() => agentIdentity(new Request('https://shop.test', {
    headers: { 'x-agent-id': 'agent-main-pc', authorization: 'Bearer unconfigured' },
  }))).toThrow('Invalid agent credentials');
});
