import { cache } from 'react';
import { getActivePricing } from '@/lib/db';
import { defaultPricingConfig } from '@/lib/config';

// Share one request snapshot between metadata and the rendered page.
export const getInitialPricing = cache(async () => {
  try {
    return await getActivePricing();
  } catch {
    // Keep the storefront accessible while its readiness check handles outages.
    return defaultPricingConfig;
  }
});
