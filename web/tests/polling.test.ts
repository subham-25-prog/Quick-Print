import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from '@/lib/polling';

afterEach(() => vi.useRealTimers());

describe('status polling', () => {
  it('coalesces a burst of refreshes while a request is in flight', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const poll = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const polling = startPolling({ poll, intervalMs: 1000, onError: vi.fn() });
    for (let i = 0; i < 20; i++) polling.refresh();
    expect(poll).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(2);
    polling.stop();
    finish();
    await vi.advanceTimersByTimeAsync(10000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('uses the latest result to choose the next interval and stops on terminal results', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValueOnce(4000).mockResolvedValue(false);
    const polling = startPolling({ poll, intervalMs: 1000, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(3999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    polling.refresh();
    await vi.advanceTimersByTimeAsync(10000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('times out a stuck fetch, reports the failure, and backs off before retrying', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const poll = vi.fn((signal: AbortSignal) => new Promise<void>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const polling = startPolling({ poll, intervalMs: 1000, timeoutMs: 500, onError });
    await vi.advanceTimersByTimeAsync(500);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('timed out') }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    polling.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('aborts navigation cleanup without reporting a failure or restarting', async () => {
    vi.useFakeTimers();
    let requestSignal!: AbortSignal;
    const onError = vi.fn();
    const poll = vi.fn((signal: AbortSignal) => new Promise<void>((_, reject) => {
      requestSignal = signal;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const polling = startPolling({ poll, intervalMs: 1000, onError });
    polling.stop();
    expect(requestSignal.aborted).toBe(true);
    polling.refresh();
    await vi.advanceTimersByTimeAsync(30000);
    expect(onError).not.toHaveBeenCalled();
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
