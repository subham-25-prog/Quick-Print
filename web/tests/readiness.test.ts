import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ provider: vi.fn(), pricing: vi.fn() }));
vi.mock('@/lib/db', () => ({ getActivePricing: mocks.pricing, updatePricing: vi.fn() }));
vi.mock('@/lib/payments', () => ({ paymentProvider: mocks.provider }));
import { GET } from '@/app/api/admin/pricing/route';

beforeEach(() => {
  mocks.provider.mockReset();
  mocks.pricing.mockReset().mockResolvedValue({ form_fields: { allowUpiPayment: true } });
});
test('pricing remains readable but checkout closes when merchant setup fails', async () => {
  mocks.provider.mockRejectedValue(new Error('Merchant not activated'));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ checkoutEnabled: false, pricing: { form_fields: { allowUpiPayment: true } } });
});
test('only configured and enabled payments make checkout available', async () => {
  mocks.provider.mockResolvedValue({});
  expect(await (await GET()).json()).toMatchObject({ checkoutEnabled: true });
  mocks.pricing.mockResolvedValue({ form_fields: { allowUpiPayment: false } });
  expect(await (await GET()).json()).toMatchObject({ checkoutEnabled: false });
});
test('cash payment enables checkout even if online payment is disabled or unavailable', async () => {
  // Cash enabled, online disabled
  mocks.pricing.mockResolvedValue({ form_fields: { allowUpiPayment: false, allowCashPayment: true } });
  expect(await (await GET()).json()).toMatchObject({ checkoutEnabled: true, cashEnabled: true, onlineEnabled: false });

  // Cash enabled, online provider fails
  mocks.pricing.mockResolvedValue({ form_fields: { allowUpiPayment: true, allowCashPayment: true } });
  mocks.provider.mockRejectedValue(new Error('Provider down'));
  expect(await (await GET()).json()).toMatchObject({ checkoutEnabled: true, cashEnabled: true, onlineEnabled: false });

  // Cash disabled, online disabled
  mocks.pricing.mockResolvedValue({ form_fields: { allowUpiPayment: false, allowCashPayment: false } });
  expect(await (await GET()).json()).toMatchObject({ checkoutEnabled: false, cashEnabled: false, onlineEnabled: false });
});
