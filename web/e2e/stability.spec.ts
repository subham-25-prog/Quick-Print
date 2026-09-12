import { expect, test } from '@playwright/test';
import pricing from '../public/config/pricing_config.json';

const id = '00000000-0000-4000-8000-000000000003';
const order = {
  id, order_number: 'QP-STABILITY', payment_status: 'PAID', order_status: 'CONFIRMED',
  file_name: 'document.pdf', page_count: 1, copies: 1, paper_size: 'A4', color_mode: 'BW',
  print_sides: 'SINGLE', total_amount: 2.5, add_ons: {}, created_at: new Date().toISOString(),
};

test('invalid cached pricing cannot crash checkout or override the server', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let refreshes = 0;
  let ready = true;
  await page.route('**/api/admin/pricing*', route => {
    refreshes++;
    return route.fulfill({ json: ready ? { pricing, checkoutEnabled: true } : { checkoutEnabled: true } });
  });
  await page.route('**/api/upload', route => route.fulfill({ json: { success: true, fileInfo: {
    uploadId: id, uploadToken: 'a'.repeat(64), fileName: 'document.pdf', fileType: 'application/pdf', pageCount: 1, fileSizeBytes: 100,
  } } }));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'document.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 fixture') });
  const preview = page.getByRole('button', { name: 'Preview', exact: false });
  await expect(preview).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {
    key: 'quickprint_live_pricing', newValue: JSON.stringify({ custom_papers: 'broken', custom_addons: 123 }),
  })));
  await expect.poll(() => refreshes).toBeGreaterThanOrEqual(2);
  await expect(preview).toBeEnabled();
  ready = false;
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'quickprint_live_pricing', newValue: '{}' })));
  await expect(preview).toBeDisabled();
  expect(errors).toEqual([]);
});

test('missing status tokens show a useful error without sending requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/orders/*', route => { requests++; return route.fulfill({ status: 401 }); });
  await page.route('**/api/payments/*', route => { requests++; return route.fulfill({ status: 401 }); });
  await page.goto('/status/' + id);
  await expect(page.getByText('This order link is missing an access token.')).toBeVisible();
  await page.goto('/payment/' + id);
  await expect(page.getByText('This payment link is missing an access token.')).toBeVisible();
  expect(requests).toBe(0);
});

test('order promotion switches to the new ID and its matching access token', async ({ page }) => {
  const nextId = '00000000-0000-4000-8000-000000000004';
  await page.route('**/api/orders/' + id, route => route.fulfill({ json: {
    order: { ...order, id: nextId }, orderAccessToken: 'promoted-token', job: { status: 'PENDING' }, agentOnline: false,
  } }));
  let nextToken = '';
  await page.route('**/api/orders/' + nextId, route => {
    nextToken = route.request().headers()['x-order-access-token'];
    return route.fulfill({ json: { order: { ...order, id: nextId }, job: { status: 'PENDING' }, agentOnline: false } });
  });
  await page.goto('/status/' + id + '?access_token=original-token');
  await expect(page).toHaveURL(new RegExp(nextId + '\\?access_token=promoted-token'));
  await expect.poll(() => nextToken).toBe('promoted-token');
  await expect(page.getByText('QP-STABILITY', { exact: true })).toBeVisible();
});

test('status recovers from a failed request and shows retries and failures accurately', async ({ page }) => {
  let status = 'SUBMITTED';
  let calls = 0;
  await page.route('**/api/orders/' + id, route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, json: { error: 'Temporary outage' } });
    return route.fulfill({ json: { order: { ...order, order_status: status === 'PENDING' ? 'CONFIRMED' : status }, job: { status }, agentOnline: false } });
  });
  await page.goto('/status/' + id + '?access_token=test-token');
  await expect(page.getByText('Temporary outage')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Document Printed & Ready!' })).toBeVisible();
  status = 'PENDING';
  await expect(page.getByRole('heading', { name: 'Preparing Document Pages' })).toBeVisible({ timeout: 8000 });
  status = 'FAILED';
  await expect(page.getByRole('heading', { name: 'Printer Attention Needed' })).toBeVisible();
  await expect(page.getByText('Temporary outage')).toHaveCount(0);
});

test('a rejected cash verification never displays a paid or printing order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const pending = { ...order, payment_method: 'CASH', payment_status: 'AWAITING_VERIFICATION', order_status: 'PAYMENT_VERIFICATION_PENDING' };
  await page.route('**/api/admin/auth', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/admin/db-status', route => route.fulfill({ json: { connected: true, agentOnline: false } }));
  await page.route('**/api/admin/pricing*', route => route.fulfill({ json: { pricing } }));
  await page.route('**/api/orders', route => route.fulfill({ json: { orders: [pending] } }));
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/cash-action', async route => {
    await hold;
    return route.fulfill({ status: 503, json: { error: 'Cash verification unavailable' } });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Verify Cash & Print', exact: true }).click();
  try {
    await expect(page.getByRole('button', { name: 'Verifying...', exact: true })).toBeDisabled();
    await expect(page.getByText('PAYMENT VERIFICATION PENDING', { exact: true })).toBeVisible();
    await expect(page.getByText('PRINTING', { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByText('Cash verification unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify Cash & Print', exact: true })).toBeEnabled();
});
