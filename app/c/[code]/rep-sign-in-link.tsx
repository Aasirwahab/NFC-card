'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * "Handed out this card?" — for a rep whose session expired, tapping a blank card
 * at the booth. Signing in brings them straight back to the card to register it.
 *
 * Built from the URL alone, so it is identical for a real card and an unknown
 * code: the not-found page stays useless for enumeration (§22.2).
 */
export function RepSignInLink() {
  const pathname = usePathname();

  return (
    <Link
      href={`/sign-in?next=${encodeURIComponent(pathname)}`}
      className="hover:text-ink-2 underline underline-offset-2"
    >
      Handed out this card? Sign in
    </Link>
  );
}
