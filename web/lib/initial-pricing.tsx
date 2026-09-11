'use client';

import { createContext, useContext } from 'react';
import { defaultPricingConfig } from '@/lib/config';
import type { PricingConfig } from '@/types';

const InitialPricingContext = createContext<PricingConfig>(defaultPricingConfig);

export const InitialPricingProvider = InitialPricingContext.Provider;

export function useInitialPricing() {
  return useContext(InitialPricingContext);
}
