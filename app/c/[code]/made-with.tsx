'use client';

import { apiSend } from '@/lib/http/client';

export function MadeWith({ first, code }: { first: string; code?: string }) {
  return (
    <a
      href="/?ref=page"
      className="text-ink-3"
      onClick={() => {
        if (code)
          void apiSend(
            `/api/landing/${encodeURIComponent(code)}/made-with-opened`,
            'POST',
            undefined,
            { keepalive: true },
          ).catch(() => {});
      }}
    >
      {first} uses INSIGNAR
    </a>
  );
}
