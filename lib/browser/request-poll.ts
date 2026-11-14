import { apiGet } from '@/lib/http/client';

/** Eight-second, single-flight reads; hidden tabs spend no request budget. */
export function pollRequests<T>(path: string, onValue: (value: T) => void): () => void {
  let stopped = false;
  let pending = false;
  const check = async () => {
    if (stopped || pending || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const value = await apiGet<T>(path);
      if (!stopped) onValue(value);
    } catch {
      // Keep the last confirmed state when offline; retry on the next visible tick.
    } finally {
      pending = false;
    }
  };
  const onVisible = () => void check();
  const timer = setInterval(onVisible, 8000);
  document.addEventListener('visibilitychange', onVisible);
  void check();
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
