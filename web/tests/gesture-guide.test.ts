import { afterEach, describe, expect, it, vi } from 'vitest';
import { GESTURE_GUIDE_SESSION_KEY, GESTURE_GUIDE_VISITS_KEY, startGestureGuideVisit } from '@/lib/gesture-guide';

function createStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

afterEach(() => vi.unstubAllGlobals());

describe('gesture guide visit tracking', () => {
  it('counts one guided visit and does not count a refresh in the same browser session', () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    vi.stubGlobal('window', { localStorage, sessionStorage });
    expect(startGestureGuideVisit()).toBe(true);
    expect(localStorage.getItem(GESTURE_GUIDE_VISITS_KEY)).toBe('1');
    expect(sessionStorage.getItem(GESTURE_GUIDE_SESSION_KEY)).toBe('1');
    expect(startGestureGuideVisit()).toBe(false);
    expect(localStorage.getItem(GESTURE_GUIDE_VISITS_KEY)).toBe('1');
  });

  it('shows only on the first two browser sessions', () => {
    const localStorage = createStorage();
    vi.stubGlobal('window', { localStorage, sessionStorage: createStorage() });
    expect(startGestureGuideVisit()).toBe(true);
    vi.stubGlobal('window', { localStorage, sessionStorage: createStorage() });
    expect(startGestureGuideVisit()).toBe(true);
    vi.stubGlobal('window', { localStorage, sessionStorage: createStorage() });
    expect(startGestureGuideVisit()).toBe(false);
    expect(localStorage.getItem(GESTURE_GUIDE_VISITS_KEY)).toBe('2');
  });
});
