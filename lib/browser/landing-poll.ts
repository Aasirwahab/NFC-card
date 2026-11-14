import { apiGet } from '@/lib/http/client';

/** Status only. A returning tab gets one last check even after the polling deadline. */
export function pollLandingStatus(
  code: string,
  options: {
    intervalMs: number;
    timeoutMs: number;
    onStatus: (status: string) => boolean;
    onTimeout: () => void;
  },
): () => void {
  let cancelled = false;
  let pending = false;
  const check = async () => {
    if (cancelled || pending || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const { status } = await apiGet<{ status: string }>(
        `/api/landing/${encodeURIComponent(code)}/status`,
      );
      if (!cancelled && options.onStatus(status)) stop();
    } catch {
      // Offline or refused: keep the readable page and check on the next visible tick.
    } finally {
      pending = false;
    }
  };
  const onVisible = () => {
    void check();
  };
  const interval = setInterval(() => {
    void check();
  }, options.intervalMs);
  const deadline = setTimeout(() => {
    clearInterval(interval);
    if (!cancelled) options.onTimeout();
  }, options.timeoutMs);
  function stop() {
    cancelled = true;
    clearInterval(interval);
    clearTimeout(deadline);
    document.removeEventListener('visibilitychange', onVisible);
  }
  document.addEventListener('visibilitychange', onVisible);
  return stop;
}
