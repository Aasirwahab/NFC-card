'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Refreshes the page while it is open, so a verifying tap shows up without a reload. */
export function Refresher({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
