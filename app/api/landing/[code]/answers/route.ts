import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { alert } from '@/lib/alert';
import { kickWorkers } from '@/lib/jobs/kick';
import { cookies, headers } from 'next/headers';
import { fail, json, readJson } from '@/lib/api';
import { getStaff } from '@/lib/auth/staff';
import { getProspectProblems } from '@/lib/capture/prospect-problems';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import type { Update } from '@/lib/db/types';
import { parseContactForm, validateContactFormAnswers } from '@/lib/domain/contact-form';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import {
  isProspectHolding,
  maskContact,
  normaliseProspectContact,
  prospectAnswersSchema,
} from '@/lib/domain/prospect-answers';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ code: string }> };

export const GET = (request: Request, context: Context) => answers(request, context, false);
export const POST = (request: Request, context: Context) => answers(request, context, true);

/** Only the first answering browser can edit; contact is returned only as a masked hint. */
async function answers(request: Request, context: Context, write: boolean) {
  const parsed = write ? prospectAnswersSchema.safeParse(await readJson(request)) : null;
  if (parsed && !parsed.success) return fail('invalid_request', 400);

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
    .select(
      'id, user_id, event_id, details_completed_at, first_viewed_at, prospect_answer_token_hash, prospect_picked_problems, prospect_submitted_email, prospect_submitted_phone, prospect_form_answers',
    )
    .eq('card_id', card.id)
    .eq('user_id', card.user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (sessionError) return fail('unavailable', 503);
  if (!session) return miss();
  if (!isProspectHolding(session.details_completed_at, session.first_viewed_at))
    return fail(
      session.details_completed_at || !session.first_viewed_at ? 'not_ready' : 'holding_expired',
      409,
    );

  const cookie = cookieStore.get('prospect_answers')?.value;
  const hash = cookie ? createHash('sha256').update(cookie).digest('hex') : null;
  const readOnly = Boolean(
    session.prospect_answer_token_hash && session.prospect_answer_token_hash !== hash,
  );
  if (!write) {
    // Only the answering browser can read the snapshots. Contact stays masked.
    const mine = Boolean(hash && hash === session.prospect_answer_token_hash);
    return json(
      {
        picked: mine ? (session.prospect_picked_problems ?? []) : [],
        contact: mine
          ? maskContact(session.prospect_submitted_email, session.prospect_submitted_phone)
          : null,
        answers: mine ? (session.prospect_form_answers ?? null) : null,
        readOnly,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  if (readOnly) return fail('answers_given', 409);
  if (!parsed?.success) return fail('invalid_request', 400);

  const answers = parsed.data;
  if (answers.problems) {
    const allowed = await getProspectProblems(session.user_id);
    if (answers.problems.some((choice) => !allowed.includes(choice)))
      return fail('invalid_problems', 400);
  }
  const token = session.prospect_answer_token_hash ? null : randomBytes(32).toString('hex');
  const update: Update<'sessions'> = {};
  if (token) update.prospect_answer_token_hash = createHash('sha256').update(token).digest('hex');
  if (answers.problems !== undefined) update.prospect_picked_problems = answers.problems;
  if (answers.contact !== undefined) {
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('full_name, contact_form')
      .eq('id', card.user_id)
      .maybeSingle();
    if (profileError || !profile) return fail('unavailable', 503);
    const first = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;
    const validated = validateContactFormAnswers(
      parseContactForm(profile.contact_form),
      answers.answers ?? {},
      first,
    );
    if (!validated.success) return fail('invalid_request', 400);
    const contact = normaliseProspectContact(answers.contact)!;
    update.prospect_submitted_email = contact.email;
    update.prospect_submitted_phone = contact.phone;
    update.prospect_form_answers = validated.answers.length ? validated.answers : null;
    update.prospect_consent_at = new Date().toISOString();
  }
  let query = db
    .from('sessions')
    .update(update)
    .eq('id', session.id)
    .eq('user_id', session.user_id)
    .eq('status', 'active')
    .eq('event_id', session.event_id)
    .is('details_completed_at', null);
  query = session.prospect_answer_token_hash
    ? query.eq('prospect_answer_token_hash', hash!)
    : query.is('prospect_answer_token_hash', null);
  const { data: saved, error } = await query.select('id').maybeSingle();
  if (error) return fail('unavailable', 503);
  if (!saved) return fail('not_ready', 409);
  if (token)
    cookieStore.set('prospect_answers', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: `/api/landing/${code}/answers`,
      maxAge: 86400,
    });
  if (answers.contact !== undefined) {
    const { error: enqueueError } = await db.from('jobs').insert({
      type: 'notify_contact',
      session_id: session.id,
      user_id: session.user_id,
    });
    // The partial live-job index cannot be an upsert target. Ignore its duplicate
    // violation, leaving the queued/running job to read the latest saved details.
    const alreadyLive =
      enqueueError?.code === '23505' && enqueueError.message.includes('jobs_one_live_per_session');
    if (enqueueError && !alreadyLive) {
      // The details are saved and the rep sees them on the contact page; a missed
      // alert must not tell the prospect their details failed. Page the team instead.
      alert('contact_alert_enqueue_failed', { sessionId: session.id, code: enqueueError.code });
    }
    after(async () => {
      try {
        await kickWorkers();
      } catch {
        console.error(JSON.stringify({ event: 'kick_failed', sessionId: session.id }));
      }
    });
  }
  return json({ saved: true }, { headers: { 'cache-control': 'no-store' } });
}
