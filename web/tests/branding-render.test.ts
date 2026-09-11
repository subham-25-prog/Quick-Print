import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InitialPricingProvider } from '@/lib/initial-pricing';
import { useShopName } from '@/lib/shop-sync';
import { defaultPricingConfig } from '@/lib/config';

function Brand({ name }: { name?: string }) {
  return createElement('span', null, useShopName(name));
}

afterEach(() => vi.unstubAllGlobals());

describe('initial brand rendering', () => {
  it('renders the saved name before effects run, even with stale browser storage', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ shop_name: 'Old Shop' }) });
    const html = renderToString(createElement(InitialPricingProvider, {
      value: { ...defaultPricingConfig, shop_name: 'Updated Shop' },
    }, createElement(Brand)));
    expect(html).toBe('<span>Updated Shop</span>');
  });

  it('renders an explicitly supplied name immediately', () => {
    expect(renderToString(createElement(Brand, { name: 'New Shop' })))
      .toBe('<span>New Shop</span>');
  });
});
