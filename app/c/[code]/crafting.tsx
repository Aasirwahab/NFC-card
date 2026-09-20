'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/http/client';

/**
 * The `queued` / `processing` render state (spec §16).
 *
 * "Putting something together for you — one moment." It polls, and resolves in
 * place. This reads as deliberate care rather than a loading failure, and it is
 * the fourth item on the defensibility list (§5.4): a visible crafting state
 * counters the "lazy AI" read and reinforces the human-effort impression.
 *
 * It polls a STATUS-ONLY route every 3 seconds and GIVES UP AT 90 SECONDS,
 * rendering the template pitch it was handed at render time — so the give-up path
 * costs no network at all.
 *
 * Why not Supabase Realtime: subscribing the prospect's browser to the sessions
 * row needs an anon-key connection and an RLS policy on the one table holding
 * prospect names, employers and personal notes. A three-second poll of a
 * status-only route returns one string and no personal data (§16).
 */

const POLL_INTERVAL_MS = 3_000;
const GIVE_UP_MS = 90_000;

export function Crafting({ code, fallbackPitch }: { code: string; fallbackPitch: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = setInterval(async () => {
      if (cancelled) return;

      try {
        // Same-origin, status only: { status: "queued" | "completed" | ... }.
        // No prospect data crosses this wire.
        const { status } = await apiGet<{ status: string }>(
          `/api/landing/${encodeURIComponent(code)}/status`,
        );

        if (status === 'completed' || status === 'failed') {
          clearInterval(poll);
          // Re-render on the server, which reads the freshly committed pitch.
          router.refresh();
        }
      } catch {
        // Offline, or the poll was refused. Keep waiting; the give-up timer is
        // the backstop and the prospect sees no error either way.
      }
    }, POLL_INTERVAL_MS);

    // The give-up timer owns the deadline on its own — no elapsed-time maths in
    // the poll, and nothing impure during render.
    const giveUp = setTimeout(() => {
      clearInterval(poll);
      if (!cancelled) setGaveUp(true);
    }, GIVE_UP_MS);

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      clearInterval(poll);
    };
  }, [code, router]);

  if (gaveUp) {
    return (
      <div className="text-ink-2 mt-3 space-y-3.5 text-[17px] leading-relaxed">
        <p>{fallbackPitch}</p>
      </div>
    );
  }

  return (
    <div className="mt-3" aria-live="polite">
      <p className="text-ink-2 text-[17px] leading-relaxed">
        Putting something together for you — one moment.
      </p>

      <div className="mt-5 flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="bg-accent/45 h-2 w-2 rounded-full"
            style={{
              animation: 'taplead-pulse 1.4s ease-in-out infinite',
              animationDelay: `${index * 0.18}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes taplead-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
