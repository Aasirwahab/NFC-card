import { apiGet } from '@/lib/http/client';
import type { ScreenQrStatus } from '@/lib/cards/screen';

/** Same visibility, no-overlap and cleanup rules as the prospect landing poller. */
export function pollScreenQr(
  code: string,
  options: {
    expiresAt: number;
    onScanned: (sessionId: string) => void;
    onExpired: () => void;
  },
): () => void {
  let cancelled = false;
  let pending = false;
  let expired = false;
  const expire = () => {
    if (!expired) options.onExpired();
    expired = true;
  };
  const check = async () => {
    if (cancelled || pending || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const result = await apiGet<ScreenQrStatus>(`/api/cards/screen/${encodeURIComponent(code)}`);
      if (cancelled) return;
      if (result.status === 'scanned') {
        options.onScanned(result.sessionId);
        stop();
      } else if (result.status === 'expired') {
        expire();
      }
    } catch {
      // A lost connection must not discard the code or create another contact.
    } finally {
      pending = false;
    }
  };
  const onVisible = () => {
    void check();
  };
  const interval = setInterval(onVisible, 4000);
  const deadline = setTimeout(
    () => {
      if (!cancelled) {
        expire();
        // A scan just before the deadline may already be bound. Check once more,
        // including on return from a hidden tab. Keep light recovery polling
        // until close: a transaction that bound before expiry may commit later.
        void check();
      }
    },
    Math.max(0, options.expiresAt - Date.now()),
  );
  function stop() {
    cancelled = true;
    clearInterval(interval);
    clearTimeout(deadline);
    document.removeEventListener('visibilitychange', onVisible);
  }
  document.addEventListener('visibilitychange', onVisible);
  void check();
  return stop;
}

/** Best effort only: unsupported, denied and released wake locks are harmless. */
export function keepScreenAwake(): () => void {
  if (!('wakeLock' in navigator) || !navigator.wakeLock) return () => {};
  let cancelled = false;
  let pending = false;
  let lock: WakeLockSentinel | null = null;
  const isHidden = () => document.visibilityState === 'hidden';
  const release = () => {
    if (lock) void lock.release().catch(() => {});
    lock = null;
  };
  const request = async () => {
    if (cancelled || pending || isHidden() || (lock && !lock.released)) return;
    pending = true;
    try {
      const acquired = await navigator.wakeLock.request('screen');
      if (cancelled || isHidden()) await acquired.release();
      else lock = acquired;
    } catch {
      // Insecure contexts, battery saver and permissions can all refuse this.
    } finally {
      pending = false;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'hidden') release();
    else void request();
  };
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVisible);
    release();
  };
}
