import Link from 'next/link';
import { TapMark } from '@/components/brand';

/**
 * Shown when the database could not be reached (§16, §24.3).
 *
 * Deliberately NOT the generic 404. "This card is not active" is the right thing
 * to say to someone holding a code that does not exist, and exactly the wrong
 * thing to say to someone holding a perfectly good card during an outage —
 * they would throw it away, and the card is the product.
 *
 * Still no raw error, no status code, no stack trace. Just the honest version.
 *
 * Phase 6 makes this rarer: the service worker serves a cached branded page when
 * Supabase is unreachable (§24.3). This is what is behind that.
 */
export function Unavailable() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col justify-center px-5 py-10">
      <TapMark className="text-accent h-8 w-8" />

      <h1 className="font-display text-ink mt-5 text-2xl font-bold tracking-tight">
        We can&rsquo;t load this right now
      </h1>

      <p className="text-ink-2 mt-2.5 text-[17px] leading-relaxed">
        Your card is fine — this is on us. Give it a minute and tap again, or open the link later.
      </p>

      <div className="border-line-soft text-ink-3 mt-8 border-t pt-5 text-[13px]">
        <div className="flex gap-4">
          <Link href="/how-it-works" className="hover:text-ink-2 underline underline-offset-2">
            How it works
          </Link>
          <Link href="/privacy" className="hover:text-ink-2 underline underline-offset-2">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
