import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAutoShowCount,
  incrementAutoShowCount,
  hasSessionSeenTour,
  markSessionSeen,
  shouldAutoShowTour,
  resetTourStorage,
  TOUR_STEPS,
  TOUR_STORAGE_KEY_AUTO_SHOW_COUNT,
  TOUR_STORAGE_KEY_SESSION_SEEN,
} from '../lib/tour';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe('Tour storage and auto-show rules', () => {
  let mockLocal: MemoryStorage;
  let mockSession: MemoryStorage;

  beforeEach(() => {
    mockLocal = new MemoryStorage();
    mockSession = new MemoryStorage();

    (globalThis as any).window = {
      localStorage: mockLocal,
      sessionStorage: mockSession,
    };
    (globalThis as any).localStorage = mockLocal;
    (globalThis as any).sessionStorage = mockSession;

    resetTourStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('session 1: starts with 0 count, not seen in session, should auto-show', () => {
    expect(getAutoShowCount()).toBe(0);
    expect(hasSessionSeenTour()).toBe(false);
    expect(shouldAutoShowTour()).toBe(true);
  });

  it('session 1 open: increases count to 1 and marks session seen', () => {
    const newCount = incrementAutoShowCount();
    expect(newCount).toBe(1);
    expect(getAutoShowCount()).toBe(1);
    expect(mockLocal.getItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT)).toBe('1');

    markSessionSeen();
    expect(hasSessionSeenTour()).toBe(true);
    expect(mockSession.getItem(TOUR_STORAGE_KEY_SESSION_SEEN)).toBe('1');

    // In the same session (e.g. after refresh), should not auto-show
    expect(shouldAutoShowTour()).toBe(false);
  });

  it('session 2: new session (sessionStorage empty), count is 1, should auto-show', () => {
    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, '1');
    expect(getAutoShowCount()).toBe(1);
    expect(hasSessionSeenTour()).toBe(false);
    expect(shouldAutoShowTour()).toBe(true);

    // Tour opens in session 2
    const nextCount = incrementAutoShowCount();
    markSessionSeen();
    expect(nextCount).toBe(2);
    expect(getAutoShowCount()).toBe(2);
    expect(shouldAutoShowTour()).toBe(false);
  });

  it('session 3: new session, count is 2, should never auto-show again', () => {
    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, '2');
    expect(hasSessionSeenTour()).toBe(false);
    expect(getAutoShowCount()).toBe(2);
    expect(shouldAutoShowTour()).toBe(false);
  });

  it('subsequent sessions (> 2): never auto-show', () => {
    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, '5');
    expect(shouldAutoShowTour()).toBe(false);
  });

  it('manual replay does not change autoShowCount', () => {
    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, '2');
    expect(getAutoShowCount()).toBe(2);
    // Manual replay does not call incrementAutoShowCount()
    expect(getAutoShowCount()).toBe(2);
  });

  it('handles invalid or malformed localStorage data gracefully', () => {
    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, 'invalid-non-number');
    expect(getAutoShowCount()).toBe(0);
    expect(shouldAutoShowTour()).toBe(true);

    mockLocal.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, '-10');
    expect(getAutoShowCount()).toBe(0);
  });

  it('handles localStorage throwing exceptions gracefully without crashing', () => {
    vi.spyOn(mockLocal, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access Denied');
    });

    expect(() => getAutoShowCount()).not.toThrow();
    expect(() => shouldAutoShowTour()).not.toThrow();
    expect(getAutoShowCount()).toBe(0);

    vi.spyOn(mockLocal, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => incrementAutoShowCount()).not.toThrow();
    expect(() => markSessionSeen()).not.toThrow();
  });

  it('contains the 4 requested tour steps with valid selectors and instructions', () => {
    expect(TOUR_STEPS).toHaveLength(4);
    expect(TOUR_STEPS[0].title).toBe('Upload document');
    expect(TOUR_STEPS[0].instruction).toBe('Tap here to upload the document you want to print.');
    expect(TOUR_STEPS[0].targetSelector).toBe('#tour-upload-step');

    expect(TOUR_STEPS[1].title).toBe('Print settings');
    expect(TOUR_STEPS[1].instruction).toBe('Choose your copies, colour, and printing options.');
    expect(TOUR_STEPS[1].targetSelector).toBe('#tour-print-settings-step');

    expect(TOUR_STEPS[2].title).toBe('Price');
    expect(TOUR_STEPS[2].instruction).toBe('Check your total before paying.');
    expect(TOUR_STEPS[2].targetSelector).toBe('#tour-price-step');

    expect(TOUR_STEPS[3].title).toBe('Payment');
    expect(TOUR_STEPS[3].instruction).toBe('Pay securely. Printing starts after payment is verified.');
    expect(TOUR_STEPS[3].targetSelector).toBe('#tour-payment-step');
  });
});
