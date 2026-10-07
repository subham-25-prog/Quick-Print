type PollingOptions = {
  poll: (signal: AbortSignal) => Promise<number | false | void>;
  intervalMs: number;
  timeoutMs?: number;
  onError: (error: unknown) => void;
};

/** Serialize refreshes, bound network waits, and cancel work when a page leaves. */
export function startPolling({ poll, intervalMs, timeoutMs = 15000, onError }: PollingOptions) {
  let stopped = false;
  let pending = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  // Status pages are often left open on a shared kiosk while the customer
  // pays or collects a print. Do not keep a network timer (and its React
  // updates) alive in a background tab. Visibility is restored immediately
  // when the customer returns, so this does not delay a visible status.
  const isHidden = () => typeof document !== 'undefined' && document.hidden;

  async function run() {
    if (stopped) return;
    if (isHidden()) {
      pending = true;
      return;
    }
    if (controller) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), timeoutMs);
    let delay = intervalMs;
    try {
      const next = await poll(request.signal);
      if (request.signal.aborted) throw new Error('Connection timed out. Retrying automatically.');
      failures = 0;
      if (next === false) stopped = true;
      else if (typeof next === 'number') delay = next;
    } catch (error) {
      if (!stopped) {
        failures++;
        delay = Math.min(intervalMs * 2 ** Math.min(failures, 5), 30000);
        onError(request.signal.aborted ? new Error('Connection timed out. Retrying automatically.') : error);
      }
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      if (!stopped) {
        if (isHidden()) {
          pending = true;
        } else {
          timer = setTimeout(run, pending && failures === 0 ? 0 : delay);
          pending = false;
        }
      }
    }
  }

  const handleVisibilityChange = () => {
    if (stopped || isHidden()) return;
    // A refresh requested while hidden is deliberately coalesced into this
    // one request. Abort nothing: an in-flight visible request still owns its
    // timeout and will schedule the next poll safely.
    clearTimeout(timer);
    if (controller) {
      pending = true;
      return;
    }
    pending = false;
    void run();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  void run();
  return {
    refresh: () => {
      if (isHidden()) {
        pending = true;
        return;
      }
      void run();
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    },
  };
}
