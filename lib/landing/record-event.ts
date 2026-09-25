import 'server-only';
import { cookies, headers } from 'next/headers';
import { fail, json } from '@/lib/api';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isNonHumanAgent } from '@/lib/domain/bots';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { claimOnce } from '@/lib/security/once';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/** Prospect-page clicks worth counting (spec §27 "basic counts"). */
export type LandingEventType = 'booking_opened' | 'linkedin_opened';

const DEDUPE_SECONDS = 60;

/**
 * Record one prospect-page click as a session event.
 *
 * Same exclusions as a tap (§10.4): the card's owner, bots, and a repeat from the
 * same IP within a minute are not counted. The answer is the same whether or not
 * anything was recorded, so it tells a caller nothing about the code.
 */
export async function recordLandingEvent(raw: string, type: LandingEventType): Promise<Response> {
  const code = normaliseCode(raw);
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const done = () => json({ ok: true });

  if (!isValidCode(code)) {
    await checkRateLimit('landingMiss', ip);
    return done();
  }

  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('landing', ip),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!limit.allowed || !missesLeft) return fail('rate_limited', 429);

  if (isNonHumanAgent(requestHeaders.get('user-agent'))) return done();

  const db = serviceClient();
  const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();
  const { data: session } = card
    ? await db
        .from('sessions')
        .select('id, user_id')
        .eq('card_id', card.id)
        .eq('status', 'active')
        .maybeSingle()
    : { data: null };

  if (!session) {
    await checkRateLimit('landingMiss', ip);
    return done();
  }

  const [rep, cookieStore] = await Promise.all([getRep(), cookies()]);
  if (
    rep?.userId === session.user_id ||
    cookieStore.get(REP_DEVICE_COOKIE)?.value === session.user_id
  ) {
    return done();
  }

  // The key keeps its original "booking-opened" spelling so a deploy does not
  // reset in-flight dedupe windows.
  const dedupeKey = `${type.replace('_', '-')}:${session.id}:${ip}`;
  if (!(await claimOnce(dedupeKey, DEDUPE_SECONDS))) return done();

  const { error } = await db.from('session_events').insert({ session_id: session.id, type });
  if (error) {
    console.error(
      JSON.stringify({ event: `${type}_failed`, sessionId: session.id, error: error.message }),
    );
  }

  return done();
}
