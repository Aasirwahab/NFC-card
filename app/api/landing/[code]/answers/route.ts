import { cookies, headers } from 'next/headers';
import { fail, json, readJson } from '@/lib/api';
import { getStaff } from '@/lib/auth/staff';
import { getProspectProblems } from '@/lib/capture/prospect-problems';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import type { Update } from '@/lib/db/types';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import {
  isProspectHolding,
  normaliseProspectContact,
  prospectAnswersSchema,
} from '@/lib/domain/prospect-answers';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** A card is a bearer link; only fixed chips and a consented delivery address may be written. */
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const parsed = prospectAnswersSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const code = normaliseCode((await context.params).code);
  const ip = clientIp(await headers());
  const miss = async () => {
    await checkRateLimit('landingMiss', ip);
    return fail('not_found', 404);
  };
  if (!isValidCode(code)) return miss();
  const [ipLimit, cardLimit, missesLeft] = await Promise.all([
    checkRateLimit('prospectAnswers', `ip:${ip}`),
    checkRateLimit('prospectAnswers', `card:${code}`),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!ipLimit.allowed || !cardLimit.allowed || !missesLeft) return fail('rate_limited', 429);

  const db = serviceClient();
  const { data: card, error: cardError } = await db
    .from('cards')
    .select('id, user_id')
    .eq('code', code)
    .maybeSingle();
  if (cardError) return fail('unavailable', 503);
  if (!card) return miss();
  const [rep, cookieStore] = await Promise.all([getRep(), cookies()]);
  if (
    rep?.userId === card.user_id ||
    cookieStore.get(REP_DEVICE_COOKIE)?.value === card.user_id ||
    (rep && (await getStaff()))
  ) {
    return fail('owner_preview', 403);
  }

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, user_id, event_id, details_completed_at, first_viewed_at')
    .eq('card_id', card.id)
    .eq('user_id', card.user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (sessionError) return fail('unavailable', 503);
  if (!session) return miss();
  if (!isProspectHolding(session.details_completed_at, session.first_viewed_at))
    return fail('not_ready', 409);

  const answers = parsed.data;
  if (answers.problems) {
    const allowed = await getProspectProblems(session.user_id, session.event_id);
    if (answers.problems.some((choice) => !allowed.includes(choice)))
      return fail('invalid_problems', 400);
  }
  const update: Update<'sessions'> = {};
  if (answers.problems !== undefined) update.prospect_picked_problems = answers.problems;
  if (answers.contact !== undefined) {
    const contact = normaliseProspectContact(answers.contact)!;
    update.prospect_submitted_email = contact.email;
    update.prospect_submitted_phone = contact.phone;
    update.prospect_consent_at = new Date().toISOString();
  }
  const { data: saved, error } = await db
    .from('sessions')
    .update(update)
    .eq('id', session.id)
    .eq('user_id', session.user_id)
    .eq('status', 'active')
    .eq('event_id', session.event_id)
    .is('details_completed_at', null)
    .select('id')
    .maybeSingle();
  if (error) return fail('unavailable', 503);
  if (!saved) return fail('not_ready', 409);
  return json({ saved: true }, { headers: { 'cache-control': 'no-store' } });
}
