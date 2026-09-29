'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/http/client';

/**
 * The `queued` / `processing` render state (spec §16).
 *
 * The note is shown straight away, and a small "finishing touches" line polls and
 * resolves in place. It reads as deliberate care rather than a loading failure
 * (§5.4), and the prospect never faces a blank wait: the AI version can take 20 to
 * 60 seconds, and a card is often tapped while the rep is still standing there.
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

  // The note is readable at once (the deterministic one, which already names the
  // problem they raised); a sharper version replaces it in place when ready. The
  // prospect never sits in front of a spinner.
  return (
    <div className="mt-3" aria-live="polite">
      <div className="text-ink-2 space-y-3.5 text-[17px] leading-relaxed">
        <p>{fallbackPitch}</p>
      </div>

      <div className="text-ink-3 mt-4 flex items-center gap-2 text-[13px]">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="bg-accent/45 h-1.5 w-1.5 rounded-full"
              style={{
                animation: 'insignar-pulse 1.4s ease-in-out infinite',
                animationDelay: `${index * 0.18}s`,
              }}
            />
          ))}
        </span>
        Adding the finishing touches for you
      </div>

      <style>{`
        @keyframes insignar-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
