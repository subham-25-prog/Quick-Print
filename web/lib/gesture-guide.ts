export const GESTURE_GUIDE_VISITS_KEY = 'quickprint:gesture-guide:visits';
export const GESTURE_GUIDE_SESSION_KEY = 'quickprint:gesture-guide:counted';
export const MAX_GESTURE_GUIDE_VISITS = 2;

/**
 * Starts the pointer guide at most once per browser session and for only the
 * first two sessions on this device. sessionStorage survives a page refresh,
 * while localStorage keeps the visit total between sessions.
 */
export function startGestureGuideVisit(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (window.sessionStorage.getItem(GESTURE_GUIDE_SESSION_KEY) === '1') return false;

    window.sessionStorage.setItem(GESTURE_GUIDE_SESSION_KEY, '1');
    const saved = Number.parseInt(window.localStorage.getItem(GESTURE_GUIDE_VISITS_KEY) ?? '0', 10);
    const visits = Number.isFinite(saved) && saved > 0 ? saved : 0;

    if (visits >= MAX_GESTURE_GUIDE_VISITS) return false;

    window.localStorage.setItem(GESTURE_GUIDE_VISITS_KEY, String(visits + 1));
    return true;
  } catch {
    // If browser storage is unavailable, avoid a guide that would repeat on
    // every refresh because the requested visit limit cannot be honored.
    return false;
  }
}
