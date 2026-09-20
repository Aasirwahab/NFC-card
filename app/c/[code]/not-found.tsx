import Link from 'next/link';
import { TapMark } from '@/components/brand';

/**
 * The generic 404 (spec §8, §22.2).
 *
 * Shown for an unknown code, a malformed code, a card with no live session, and a
 * rate-limited request. All four are BYTE-IDENTICAL: nothing in this response
 * distinguishes "no such card" from "card exists but has no session", which is
 * what makes walking the code space useless.
 *
 * It is also, deliberately, not an error page. Someone holding a real card in a
 * hotel lobby should see something branded and calm, not a stack trace.
 */
export default function CardNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col justify-center px-5 py-10">
      <TapMark className="text-accent h-8 w-8" />

      <h1 className="font-display text-ink mt-5 text-2xl font-bold tracking-tight">
        This card is not active
      </h1>

      <p className="text-ink-2 mt-2.5 text-[17px] leading-relaxed">
        Check the code printed on the front of the card, or ask the person who gave it to you to
        send the link again.
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
