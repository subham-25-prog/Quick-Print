import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoredShopName,
  publishShopNameUpdate,
  SHOP_NAME_EVENT,
  SHOP_PRICING_STORAGE_KEY,
} from '@/lib/shop-sync';
import { shopConfig } from '@/lib/config';

describe('shop-sync utility', () => {
  let mockStore: Record<string, string> = {};
  const listeners: Record<string, ((e: any) => void)[]> = {};

  beforeEach(() => {
    mockStore = {};
    listeners[SHOP_NAME_EVENT] = [];

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => mockStore[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
    };

    const mockWindow = {
      addEventListener: vi.fn((event: string, cb: any) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: any) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== cb);
        }
      }),
      dispatchEvent: vi.fn((event: any) => {
        const type = event.type;
        if (listeners[type]) {
          listeners[type].forEach((cb) => cb(event));
        }
        return true;
      }),
    };

    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('CustomEvent', class {
      type: string;
      detail: any;
      constructor(type: string, opts?: any) {
        this.type = type;
        this.detail = opts?.detail;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns default shopConfig.name when localStorage is empty', () => {
    expect(getStoredShopName()).toBe(shopConfig.name);
  });

  it('reads shop_name from cached pricing in localStorage', () => {
    localStorage.setItem(
      SHOP_PRICING_STORAGE_KEY,
      JSON.stringify({ shop_name: 'Metro Xerox Center' })
    );
    expect(getStoredShopName()).toBe('Metro Xerox Center');
  });

  it('publishes shop name update to localStorage and window CustomEvent on 1 click', () => {
    let eventReceived: string | null = null;
    const handler = (e: any) => {
      eventReceived = e.detail;
    };
    window.addEventListener(SHOP_NAME_EVENT, handler);

    publishShopNameUpdate('Speedy Prints & Scans', { a4_bw_per_page: 2 });

    expect(eventReceived).toBe('Speedy Prints & Scans');
    expect(getStoredShopName()).toBe('Speedy Prints & Scans');

    const storedRaw = localStorage.getItem(SHOP_PRICING_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.shop_name).toBe('Speedy Prints & Scans');
    expect(parsed.a4_bw_per_page).toBe(2);

    window.removeEventListener(SHOP_NAME_EVENT, handler);
  });

  it('falls back to default if blank or empty name is published', () => {
    publishShopNameUpdate('   ');
    expect(getStoredShopName()).toBe(shopConfig.name);
  });
});
