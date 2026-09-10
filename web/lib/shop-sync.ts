'use client';

import { useState, useEffect } from 'react';
import { shopConfig } from '@/lib/config';

export const SHOP_NAME_EVENT = 'quickprint_shop_name_updated';
export const SHOP_PRICING_STORAGE_KEY = 'quickprint_live_pricing';
export const SHOP_BROADCAST_CHANNEL = 'quickprint_shop_broadcast_channel';

/**
 * Retrieves the currently saved shop name from localStorage,
 * falling back to the configured default shop name.
 */
export function getStoredShopName(): string {
  if (typeof window === 'undefined') {
    return shopConfig.name;
  }
  try {
    const cached = localStorage.getItem(SHOP_PRICING_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.shop_name && typeof parsed.shop_name === 'string' && parsed.shop_name.trim()) {
        return parsed.shop_name.trim();
      }
    }
  } catch {}
  return shopConfig.name;
}

/**
 * Broadcasts an update to all open tabs, windows, and components with 1 click.
 */
export function publishShopNameUpdate(newShopName: string, fullPricing?: any): void {
  if (typeof window === 'undefined') return;

  const trimmed = newShopName.trim() || shopConfig.name;

  // 1. Update localStorage
  try {
    if (fullPricing && typeof fullPricing === 'object') {
      localStorage.setItem(SHOP_PRICING_STORAGE_KEY, JSON.stringify({ ...fullPricing, shop_name: trimmed }));
    } else {
      const cached = localStorage.getItem(SHOP_PRICING_STORAGE_KEY);
      const parsed = cached ? JSON.parse(cached) : {};
      localStorage.setItem(SHOP_PRICING_STORAGE_KEY, JSON.stringify({ ...parsed, shop_name: trimmed }));
    }
  } catch {}

  // 2. Dispatch in-window custom event
  try {
    window.dispatchEvent(new CustomEvent(SHOP_NAME_EVENT, { detail: trimmed }));
  } catch {}

  // 3. Broadcast to all other browser tabs via BroadcastChannel
  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(SHOP_BROADCAST_CHANNEL);
      channel.postMessage({ type: 'SHOP_NAME_UPDATED', shopName: trimmed });
      channel.close();
    }
  } catch {}
}

/**
 * React hook that provides the reactive shop name, automatically listening to
 * in-window events, localStorage changes, and BroadcastChannel updates.
 */
export function useShopName(explicitShopName?: string): string {
  const [shopName, setShopName] = useState<string>(() => {
    if (explicitShopName && explicitShopName.trim()) {
      return explicitShopName.trim();
    }
    return getStoredShopName();
  });

  // Sync if explicitShopName prop changes
  useEffect(() => {
    if (explicitShopName && explicitShopName.trim()) {
      setShopName(explicitShopName.trim());
    }
  }, [explicitShopName]);

  useEffect(() => {
    // 1. In-tab custom event listener
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail && typeof customEvent.detail === 'string') {
        setShopName(customEvent.detail.trim());
      }
    };
    window.addEventListener(SHOP_NAME_EVENT, handleCustomEvent);

    // 2. Cross-tab storage listener
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SHOP_PRICING_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.shop_name && typeof parsed.shop_name === 'string') {
            setShopName(parsed.shop_name.trim());
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. BroadcastChannel listener
    let channel: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(SHOP_BROADCAST_CHANNEL);
        channel.onmessage = (event) => {
          if (event.data?.type === 'SHOP_NAME_UPDATED' && event.data?.shopName) {
            setShopName(event.data.shopName.trim());
          }
        };
      }
    } catch {}

    // 4. Initial fetch fallback if we're still on default
    let isMounted = true;
    fetch('/api/admin/pricing', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data?.pricing?.shop_name) {
          const serverName = data.pricing.shop_name.trim();
          setShopName((prev) => (prev === shopConfig.name ? serverName : prev));
          try {
            const cached = localStorage.getItem(SHOP_PRICING_STORAGE_KEY);
            if (!cached) {
              localStorage.setItem(SHOP_PRICING_STORAGE_KEY, JSON.stringify(data.pricing));
            }
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      window.removeEventListener(SHOP_NAME_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        channel.close();
      }
    };
  }, []);

  return shopName;
}
