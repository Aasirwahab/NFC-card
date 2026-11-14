'use client';

import { useEffect } from 'react';

/**
 * "Aleksandra Kowalczyk · INSIGNAR" in the prospect's tab instead of a bare
 * "INSIGNAR". Set in the browser, not in generateMetadata: metadata runs before the
 * landing rate limiter, so a title there would tell a code-guesser which codes are
 * real even after they were blocked.
 */
export function TabTitle({ name }: { name: string }) {
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed) document.title = `${trimmed} · INSIGNAR`;
  }, [name]);
  return null;
}
