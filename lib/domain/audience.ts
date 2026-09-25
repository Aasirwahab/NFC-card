import { isNonHumanAgent } from './bots';

/**
 * Who is asking, and does this render count as a tap? (spec §8, §10.4)
 *
 * PURE, and separated from the route on purpose. The spec says of the
 * rep-self-tap exclusion:
 *
 *   "If the rep's own pre-handover self-tap marked the session as tapped, every
 *    no-tap follow-up would be suppressed for every prospect — the feature would
 *    silently never fire, and nothing would error. Make this a test, not a
 *    comment."
 *
 * A rule whose failure mode is silence has to be asserted somewhere a test can
 * reach. That is what this file is for.
 */

export type Audience = 'missing' | 'rep' | 'prospect';

/**
 * Remembers "this browser belongs to rep X" after the Supabase session expires.
 * Set by proxy.ts whenever a rep is signed in. It only ever suppresses view
 * counting — a forged value can hide a visitor's own view and nothing more, so it
 * is deliberately not an authentication cookie.
 */
export const REP_DEVICE_COOKIE = 'taplead_rep_device';

/**
 * The §8 branch. `repId` is the signed-in rep, or null for anyone else —
 * including a rep signed in to a DIFFERENT account, who is just a visitor here.
 */
export function decideAudience(card: { user_id: string } | null, repId: string | null): Audience {
  if (!card) return 'missing';
  if (repId !== null && card.user_id === repId) return 'rep';
  return 'prospect';
}

export type TapContext = {
  audience: Audience;
  userAgent: string | null;
  /** False when this IP already viewed this session inside the dedupe window. */
  firstInWindow: boolean;
  /**
   * True when the browser carries the rep-device cookie of the card's owner.
   * Outlives the Supabase session, so a rep whose sign-in has expired still does
   * not count as their own prospect.
   */
  ownerDevice?: boolean;
};

/**
 * True only for a genuine prospect view. This is the single gate in front of
 * `record_prospect_view`, and therefore in front of `first_viewed_at`.
 */
export function shouldRecordTap({
  audience,
  userAgent,
  firstInWindow,
  ownerDevice = false,
}: TapContext): boolean {
  // The rep tapping their own card before handover is not a tap. Neither is a
  // miss, which has no session to record against.
  if (audience !== 'prospect') return false;

  // The owner's phone, signed out. The prospect view renders (they cannot be
  // shown the rep controls without a session), but it is still a self-tap.
  if (ownerDevice) return false;

  // Crawlers and link unfurlers are not people. Counting a Slack preview would
  // mark the session viewed when nobody has looked at it.
  if (isNonHumanAgent(userAgent)) return false;

  // A second view from the same IP within 60 seconds is the same look.
  return firstInWindow;
}

/**
 * Which sticker opened the card. The printed QR encodes `?src=qr`; everything
 * else — the NFC tag, a typed or forwarded link — counts as 'nfc'. Only the exact
 * value `qr` is trusted: the parameter is attacker-controlled and ends up in an
 * analytics column, so anything else collapses to the default.
 */
export type ViewSource = 'nfc' | 'qr';

export function viewSource(src: string | string[] | undefined): ViewSource {
  const value = Array.isArray(src) ? src[0] : src;
  return value === 'qr' ? 'qr' : 'nfc';
}
