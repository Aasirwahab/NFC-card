import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pollRequests } from '@/lib/browser/request-poll';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/http/client', () => ({ apiGet: get }));
let visibility: string;
let events: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  events = new EventTarget();
  get.mockReset().mockResolvedValue({ requests: [] });
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility;
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('checks within eight seconds, pauses when hidden, resumes immediately and cleans up', async () => {
  const apply = vi.fn();
  const stop = pollRequests('/api/requests', apply);
  await vi.advanceTimersByTimeAsync(8000);
  expect(get).toHaveBeenCalledTimes(2);
  visibility = 'hidden';
  await vi.advanceTimersByTimeAsync(80000);
  expect(get).toHaveBeenCalledTimes(2);
  visibility = 'visible';
  events.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(get).toHaveBeenCalledTimes(3);
  stop();
  events.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(get).toHaveBeenCalledTimes(3);
});
it('does not overlap or apply a late response after cleanup', async () => {
  let resolve!: (value: unknown) => void;
  get.mockImplementation(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  const apply = vi.fn();
  const stop = pollRequests('/api/requests', apply);
  await vi.advanceTimersByTimeAsync(24000);
  expect(get).toHaveBeenCalledOnce();
  stop();
  resolve({ requests: ['stale'] });
  await vi.advanceTimersByTimeAsync(0);
  expect(apply).not.toHaveBeenCalled();
});
it('keeps confirmed state offline and retries on the next visible tick', async () => {
  get.mockRejectedValueOnce(new Error('offline'));
  const apply = vi.fn();
  const stop = pollRequests('/api/requests', apply);
  await vi.advanceTimersByTimeAsync(0);
  expect(apply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(8000);
  expect(apply).toHaveBeenCalledWith({ requests: [] });
  stop();
});
