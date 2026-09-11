'use client';

import { useState, useEffect } from 'react';
import { shopConfig } from '@/lib/config';
import { useInitialPricing } from '@/lib/initial-pricing';

export const SHOP_NAME_EVENT = 'quickprint_shop_name_updated';
export const SHOP_PRICING_STORAGE_KEY = 'quickprint_live_pricing';
export const SHOP_BROADCAST_CHANNEL = 'quickprint_shop_broadcast_channel';

/**
 * Sanitizes any raw shop name, ensuring empty or legacy 'QuickPrint' names
 * are cleanly replaced with the configured brand name (Cyber Cafe).
 */
export function cleanShopName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return shopConfig.name;
  const trimmed = raw.trim();
  if (!trimmed || /quickprint/i.test(trimmed)) {
    return shopConfig.name;
  }
  return trimmed;
}

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
      if (parsed?.shop_name && typeof parsed.shop_name === 'string') {
        const cleaned = cleanShopName(parsed.shop_name);
        if (cleaned !== parsed.shop_name) {
          try {
            localStorage.setItem(SHOP_PRICING_STORAGE_KEY, JSON.stringify({ ...parsed, shop_name: cleaned }));
          } catch {}
        }
        return cleaned;
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

  const trimmed = cleanShopName(newShopName);

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
  const initialPricing = useInitialPricing();
  const [shopName, setShopName] = useState<string>(() => cleanShopName(initialPricing.shop_name));

  useEffect(() => {
    // The parent already supplies pricing; update if explicit name changed
    if (explicitShopName !== undefined) {
      return;
    }
    // The server snapshot is newer than browser storage. Never replace it with
    // a cached name on mount; continue accepting live updates below.
    setShopName(cleanShopName(initialPricing.shop_name));

    // 1. In-tab custom event listener
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail && typeof customEvent.detail === 'string') {
        setShopName(cleanShopName(customEvent.detail));
      }
    };
    window.addEventListener(SHOP_NAME_EVENT, handleCustomEvent);

    // 2. Cross-tab storage listener
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SHOP_PRICING_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.shop_name && typeof parsed.shop_name === 'string') {
            setShopName(cleanShopName(parsed.shop_name));
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
          if (event.data?.type === 'SHOP_NAME_UPDATED' && typeof event.data?.shopName === 'string') {
            setShopName(cleanShopName(event.data.shopName));
          }
        };
      }
    } catch {}

    // 4. Initial fetch fallback if we're still on default
    let isMounted = true;
    const controller = new AbortController();
    fetch('/api/admin/pricing', { cache: 'no-store', signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && typeof data?.pricing?.shop_name === 'string') {
          const serverName = cleanShopName(data.pricing.shop_name);
          setShopName(serverName);
          try {
            const cached = localStorage.getItem(SHOP_PRICING_STORAGE_KEY);
            const parsed = cached ? JSON.parse(cached) : {};
            localStorage.setItem(SHOP_PRICING_STORAGE_KEY, JSON.stringify({ ...parsed, ...data.pricing, shop_name: serverName }));
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      controller.abort();
      window.removeEventListener(SHOP_NAME_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        channel.close();
      }
    };
  }, [explicitShopName, initialPricing.shop_name]);

  return explicitShopName !== undefined ? cleanShopName(explicitShopName) : shopName;
}
