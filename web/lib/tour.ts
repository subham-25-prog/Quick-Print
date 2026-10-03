export const TOUR_STORAGE_KEY_AUTO_SHOW_COUNT = 'quickprint:tour:autoShowCount';
export const TOUR_STORAGE_KEY_SESSION_SEEN = 'quickprint:tour:sessionSeen';
export const MAX_AUTO_SHOW_COUNT = 2;

// In-memory fallback if localStorage / sessionStorage are restricted or throw
const memoryFallback = new Map<string, string>();

function safeGetStorage(type: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = type === 'local' ? window.localStorage : window.sessionStorage;
    const testKey = '__qp_test__';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

export function getAutoShowCount(): number {
  try {
    const storage = safeGetStorage('local');
    const raw = storage ? storage.getItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT) : memoryFallback.get(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT);
    if (raw === null || raw === undefined) return 0;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

export function incrementAutoShowCount(): number {
  try {
    const current = getAutoShowCount();
    const next = current + 1;
    const storage = safeGetStorage('local');
    if (storage) {
      storage.setItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, String(next));
    }
    memoryFallback.set(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT, String(next));
    return next;
  } catch {
    const current = getAutoShowCount();
    return current + 1;
  }
}

export function hasSessionSeenTour(): boolean {
  try {
    const storage = safeGetStorage('session');
    const raw = storage ? storage.getItem(TOUR_STORAGE_KEY_SESSION_SEEN) : memoryFallback.get(TOUR_STORAGE_KEY_SESSION_SEEN);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export function markSessionSeen(): void {
  try {
    const storage = safeGetStorage('session');
    if (storage) {
      storage.setItem(TOUR_STORAGE_KEY_SESSION_SEEN, '1');
    }
    memoryFallback.set(TOUR_STORAGE_KEY_SESSION_SEEN, '1');
  } catch {
    // Graceful no-op
  }
}

export function shouldAutoShowTour(): boolean {
  if (hasSessionSeenTour()) {
    return false;
  }
  return getAutoShowCount() < MAX_AUTO_SHOW_COUNT;
}

export function resetTourStorage(): void {
  try {
    const local = safeGetStorage('local');
    if (local) local.removeItem(TOUR_STORAGE_KEY_AUTO_SHOW_COUNT);
    const session = safeGetStorage('session');
    if (session) session.removeItem(TOUR_STORAGE_KEY_SESSION_SEEN);
  } catch {
    // Graceful no-op
  }
  memoryFallback.clear();
}

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  instruction: string;
  detail?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'upload-document',
    targetSelector: '#tour-upload-step',
    title: 'Upload document',
    instruction: 'Tap here to upload the document you want to print.',
    detail: 'Supports PDF, JPG, and PNG files. You can drop files or tap to browse.',
  },
  {
    id: 'print-settings',
    targetSelector: '#tour-print-settings-step',
    title: 'Print settings',
    instruction: 'Choose your copies, colour, and printing options.',
    detail: 'Select paper size, black & white or colour, and single or double-sided printing.',
  },
  {
    id: 'price',
    targetSelector: '#tour-price-step',
    title: 'Price',
    instruction: 'Check your total before paying.',
    detail: 'Your order total updates automatically based on page counts and selected options.',
  },
  {
    id: 'payment',
    targetSelector: '#tour-payment-step',
    title: 'Payment',
    instruction: 'Pay securely. Printing starts after payment is verified.',
    detail: 'Tap Preview to review your document, then proceed to choose UPI, QR code, or Cash at the counter.',
  },
];
