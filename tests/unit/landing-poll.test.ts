import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollLandingStatus } from '@/lib/browser/landing-poll';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/http/client', () => ({ apiGet }));

describe('visible prospect status polling', () => {
  let visibility: string;
  let target: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset().mockResolvedValue({ status: 'holding' });
    visibility = 'visible';
    target = new EventTarget();
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pauses while hidden, stops at ten minutes, and checks again on return', async () => {
    const onStatus = vi.fn(() => false);
    const onTimeout = vi.fn();
    const stop = pollLandingStatus('ABCD2345', {
      intervalMs: 4000,
      timeoutMs: 600000,
      onStatus,
      onTimeout,
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(apiGet).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(596000);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledOnce();
    visibility = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(2);
    stop();
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('stops after a terminal status, including visibility checks', async () => {
    apiGet.mockResolvedValue({ status: 'completed' });
    const onStatus = vi.fn(() => true);
    const onTimeout = vi.fn();
    const stop = pollLandingStatus('ABCD2345', {
      intervalMs: 3000,
      timeoutMs: 90000,
      onStatus,
      onTimeout,
    });
    await vi.advanceTimersByTimeAsync(3000);
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100000);
    expect(apiGet).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
    stop();
  });

  it('does not overlap requests or deliver a response after cleanup', async () => {
    let finish!: (value: { status: string }) => void;
    apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onStatus = vi.fn(() => false);
    const stop = pollLandingStatus('ABCD2345', {
      intervalMs: 4000,
      timeoutMs: 600000,
      onStatus,
      onTimeout: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(12000);
    expect(apiGet).toHaveBeenCalledOnce();
    stop();
    finish({ status: 'completed' });
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).not.toHaveBeenCalled();
  });
});
