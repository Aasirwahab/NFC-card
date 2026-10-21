'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/http/client';

const POLL_INTERVAL_MS = 30_000;
const GIVE_UP_MS = 20 * 60_000;

/**
 * The page is on hold until the rep approves it. A prospect who keeps it open
 * sees the approved page appear without reloading. Renders nothing.
 */
export function HeldWatcher({ code }: { code: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const poll = setInterval(async () => {
      if (cancelled) return;
      try {
        // Status only: no prospect data crosses this wire.
        const { status } = await apiGet<{ status: string }>(
          `/api/landing/${encodeURIComponent(code)}/status`,
        );
        if (status !== 'held') {
          clearInterval(poll);
          router.refresh();
        }
      } catch {
        // Offline or refused: keep the holding page; nothing to show the prospect.
      }
    }, POLL_INTERVAL_MS);
    const giveUp = setTimeout(() => clearInterval(poll), GIVE_UP_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [code, router]);

  return null;
}
