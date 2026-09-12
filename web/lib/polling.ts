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

  async function run() {
    if (stopped) return;
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
        timer = setTimeout(run, pending && failures === 0 ? 0 : delay);
        pending = false;
      }
    }
  }

  void run();
  return {
    refresh: () => { void run(); },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
