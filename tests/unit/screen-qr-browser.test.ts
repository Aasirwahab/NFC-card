import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepScreenAwake, pollScreenQr } from '@/lib/browser/screen-qr';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/http/client', () => ({ apiGet }));

let visibility: string;
let target: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  visibility = 'visible';
  target = new EventTarget();
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
  apiGet.mockReset().mockResolvedValue({ status: 'waiting' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('screen QR polling', () => {
  const options = () => ({
    expiresAt: Date.now() + 30 * 60_000,
    onScanned: vi.fn(),
    onExpired: vi.fn(),
  });
  it('pauses hidden polling, checks on return, and stops after the scan', async () => {
    const callbacks = options();
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenLastCalledWith('/api/cards/screen/ABCDEFGH');
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(12_000);
    expect(apiGet).toHaveBeenCalledTimes(1);
    apiGet.mockResolvedValue({ status: 'scanned', sessionId: 'contact-1' });
    visibility = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(callbacks.onScanned).toHaveBeenCalledExactlyOnceWith('contact-1');
    expect(apiGet).toHaveBeenCalledTimes(2);
    stop();
  });
  it('expires locally while hidden, but still recovers a scan made just before the deadline', async () => {
    const callbacks = options();
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(0);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(callbacks.onExpired).toHaveBeenCalledOnce();
    apiGet.mockResolvedValue({ status: 'scanned', sessionId: 'contact-1' });
    visibility = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onScanned).toHaveBeenCalledWith('contact-1');
    stop();
  });
  it('stops polling sixty seconds after expiry, including visibility recovery', async () => {
    const callbacks = { ...options(), expiresAt: Date.now() + 1000 };
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(callbacks.onExpired).toHaveBeenCalledOnce();
    const calls = apiGet.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(apiGet).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
  it('expires on return after the grace period even if hidden timers were suspended', async () => {
    const callbacks = options();
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(callbacks.expiresAt + 61_000);
    target.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.onExpired).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(apiGet).toHaveBeenCalledTimes(1);
    stop();
  });
  it('never overlaps requests and ignores results after closing', async () => {
    let finish!: (value: unknown) => void;
    apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const callbacks = options();
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(apiGet).toHaveBeenCalledTimes(1);
    stop();
    finish({ status: 'scanned', sessionId: 'contact-1' });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(callbacks.onScanned).not.toHaveBeenCalled();
    expect(callbacks.onExpired).not.toHaveBeenCalled();
  });
  it('recovers a committed scan during the expiry grace period', async () => {
    apiGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'expired' });
    const callbacks = options();
    const stop = pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(callbacks.onExpired).toHaveBeenCalledOnce();
    expect(apiGet).toHaveBeenCalledTimes(3);
    apiGet.mockResolvedValue({ status: 'scanned', sessionId: 'contact-1' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(callbacks.onScanned).toHaveBeenCalledExactlyOnceWith('contact-1');
    stop();
  });
  it('stops polling about 10 s after the server says expired, before the local deadline', async () => {
    apiGet.mockResolvedValue({ status: 'expired' });
    const callbacks = options();
    pollScreenQr('ABCDEFGH', callbacks);
    await vi.advanceTimersByTimeAsync(12_000);
    const calls = apiGet.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet.mock.calls.length).toBe(calls);
    expect(callbacks.onExpired).toHaveBeenCalledOnce();
  });
});

describe('screen wake lock', () => {
  it('does nothing when unsupported or refused', async () => {
    vi.stubGlobal('navigator', {});
    const stop = keepScreenAwake();
    stop();
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const refused = keepScreenAwake();
    await vi.advanceTimersByTimeAsync(0);
    refused();
  });
  it('releases on hide, reacquires on return, and releases on close', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release, released: false });
    vi.stubGlobal('navigator', { wakeLock: { request } });
    const stop = keepScreenAwake();
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledExactlyOnceWith('screen');
    visibility = 'hidden';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('releases a lock that arrives after the screen closes', async () => {
    let finish!: (value: unknown) => void;
    const release = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      wakeLock: {
        request: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
    });
    const stop = keepScreenAwake();
    stop();
    finish({ release });
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce();
  });
});
