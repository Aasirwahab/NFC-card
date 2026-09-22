import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { VIEW_DEDUPE_SECONDS, viewDedupeKey } from '@/lib/domain/bots';
import { REP_DEVICE_COOKIE, shouldRecordTap } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { resolveCode } from '@/lib/db/landing';
import { getRep } from '@/lib/db/server';
import { getProfile, listEvents } from '@/lib/db/rep';
import { serviceClient } from '@/lib/db/service';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';
import { claimOnce } from '@/lib/security/once';
import { kickWorkers } from '@/lib/jobs/kick';
import { ProspectView } from './prospect-view';
import { RepView } from './rep-view';
import { Unavailable } from './unavailable';

/**
 * The dual-audience route (spec §8).
 *
 * Web NFC does not exist on iPhone, so the tag can only hold a URL — and that one
 * URL is tapped by the rep before handover and by the prospect hours later. One
 * route serves both. This is not a workaround; it deletes a screen and makes
 * registration identical on iPhone and Android.
 *
 * The page must render well in under two seconds, on a phone, for a person who
 * may have entirely forgotten the conversation. The pitch is READ, never
 * generated here (§16) — that is what makes the budget achievable.
 */

// Prospect details must never be cached at the edge or shared between visitors.
export const dynamic = 'force-dynamic';

export const metadata = {
  // A private link handed to one person. Never index it, and never leak the code
  // in a referrer to the booking embed or anywhere else (§22.6).
  robots: { index: false, follow: false },
  referrer: 'strict-origin-when-cross-origin' as const,
};

export default async function CardPage({ params }: PageProps<'/c/[code]'>) {
  const { code: raw } = await params;
  const code = normaliseCode(raw);

  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);

  // A malformed code never reaches the database. It is still counted against the
  // miss limiter, because walking the code space produces exactly this shape.
  if (!isValidCode(code)) {
    await checkRateLimit('landingMiss', ip);
    notFound();
  }

  // An IP that has spent its miss budget is refused for EVERY code, real ones
  // included — otherwise the miss limiter only counts guesses and never stops them.
  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('landing', ip),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!limit.allowed || !missesLeft) {
    // Not a 429 and not the 404: the card may be perfectly good, and a shared
    // venue or carrier IP can trip this for a real prospect. "This card is not
    // active" would get it thrown away. Says nothing about whether the code
    // exists, so enumeration learns nothing from it.
    return <Unavailable />;
  }

  const rep = await getRep();
  const repId = rep?.userId ?? null;
  const resolved = await resolveCode(code, repId);

  if (resolved.audience === 'unavailable') {
    // Not a 404: the card may be perfectly good and the database merely
    // unreachable. Telling a prospect their card is dead would lose the lead
    // and the card with it.
    return <Unavailable />;
  }

  if (resolved.audience === 'missing') {
    // Byte-identical to an unknown code: nothing distinguishes "no such card"
    // from "card exists but has no session" (§22.2).
    await checkRateLimit('landingMiss', ip);
    notFound();
  }

  if (resolved.audience === 'rep') {
    // A rep self-tap is explicitly NOT a tap (§10.4). Nothing below runs.
    // `audience: 'rep'` is only returned for a signed-in owner, so repId is set.
    const ownerId = repId!;

    // The event list is only needed to register an unregistered card. Skipping it
    // otherwise keeps the common case — checking which card this is — to one read.
    const needsEvents = resolved.session === null && resolved.cardStatus === 'available';

    const [events, profile] = await Promise.all([
      needsEvents ? listEvents(ownerId) : Promise.resolve([]),
      getProfile(ownerId),
    ]);

    return (
      <RepView
        resolved={resolved}
        events={events}
        registeredBy={profile?.full_name ?? rep?.email ?? 'Unknown'}
      />
    );
  }

  // ---------------------------------------------------------- a real tap
  const userAgent = requestHeaders.get('user-agent');
  const sessionId = resolved.session.id;
  const ownerDevice = (await cookies()).get(REP_DEVICE_COOKIE)?.value === resolved.session.user_id;

  after(async () => {
    // A second view from the same IP within 60 seconds is the same look.
    const firstInWindow = await claimOnce(viewDedupeKey(sessionId, ip), VIEW_DEDUPE_SECONDS);

    // The single gate in front of first_viewed_at. Pure, and exhaustively tested
    // in tests/unit/audience.test.ts — a rule whose failure mode is silence has
    // to be asserted somewhere a test can reach (§10.4).
    if (!shouldRecordTap({ audience: 'prospect', userAgent, firstInWindow, ownerDevice })) return;

    const { data: wasFirst, error } = await serviceClient().rpc('record_prospect_view', {
      p_session_id: sessionId,
    });

    if (error) {
      console.error(
        JSON.stringify({ event: 'record_view_failed', sessionId, error: error.message }),
      );
      return;
    }

    // The first view queued the rep's tap alert. Start a worker now, so the
    // alert lands while the prospect is still reading; the cron sweep covers a
    // missed kick within a minute (§13).
    if (wasFirst) {
      try {
        await kickWorkers();
      } catch (kickError) {
        console.error(
          JSON.stringify({
            event: 'kick_failed',
            sessionId,
            error: kickError instanceof Error ? kickError.message : String(kickError),
          }),
        );
      }
    }
  });

  return <ProspectView resolved={resolved} />;
}
