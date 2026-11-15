import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { fail, json, readJson } from '@/lib/api';
import { getStaff } from '@/lib/auth/staff';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import type { Row } from '@/lib/db/types';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { isProspectHolding } from '@/lib/domain/prospect-answers';
import {
  normaliseRequestContact,
  prospectRequestSchema,
  REQUEST_CONSENT_VERSION,
} from '@/lib/domain/prospect-requests';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ code: string }> };
const cancelSchema = z.object({ requestId: z.uuid() }).strict();
const hash = (value: string | undefined) =>
  value && value.length <= 128 ? createHash('sha256').update(value).digest('hex') : null;
const noStore = { headers: { 'cache-control': 'no-store' } };

export const GET = (request: Request, context: Context) => handle(request, context, 'read');
export const POST = (request: Request, context: Context) => handle(request, context, 'write');
export const DELETE = (request: Request, context: Context) => handle(request, context, 'cancel');

function publicRequest(request: Row<'prospect_requests'> | null) {
  if (!request) return null;
  return {
    id: request.id,
    kind: request.kind,
    channel: request.channel,
    best_time: request.best_time,
    status: request.status,
  };
}

async function handle(request: Request, context: Context, action: 'read' | 'write' | 'cancel') {
  const body = action === 'read' ? null : await readJson(request);
  const parsed = action === 'write' ? prospectRequestSchema.safeParse(body) : null;
  const cancellation = action === 'cancel' ? cancelSchema.safeParse(body) : null;
  if ((parsed && !parsed.success) || (cancellation && !cancellation.success))
    return fail('invalid_request', 400);

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
  )
    return fail('owner_preview', 403);

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select(
      'id, user_id, details_completed_at, first_viewed_at, prospect_answer_token_hash, prospect_submitted_email, prospect_submitted_phone',
    )
    .eq('card_id', card.id)
    .eq('user_id', card.user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (sessionError) return fail('unavailable', 503);
  if (!session) return miss();
  if (
    action === 'write' &&
    !session.details_completed_at &&
    !isProspectHolding(session.details_completed_at, session.first_viewed_at)
  )
    return fail('not_ready', 409);

  // This nested path receives the existing holding-answer cookie without broadening it.
  const answerHash = hash(cookieStore.get('prospect_answers')?.value);
  const answerOwner = Boolean(answerHash && answerHash === session.prospect_answer_token_hash);
  const contact = answerOwner
    ? {
        email: session.prospect_submitted_email,
        phone: session.prospect_submitted_phone,
      }
    : null;
  const token = cookieStore.get('prospect_requests')?.value;
  const tokenHash = hash(token);

  if (action === 'write' && parsed?.success) {
    const newToken = tokenHash ? null : randomBytes(32).toString('hex');
    const { data: saved, error } = await db.rpc('replace_prospect_request', {
      p_session_id: session.id,
      p_kind: parsed.data.kind,
      p_channel: parsed.data.channel,
      p_contact_value: normaliseRequestContact(parsed.data.channel, parsed.data.contact)!,
      p_best_time: parsed.data.bestTime ?? null,
      p_consent_version: REQUEST_CONSENT_VERSION,
      p_requester_token_hash: tokenHash ?? hash(newToken!)!,
      p_answer_token_hash: answerHash,
    });
    if (error?.code === 'P0001' || error?.code === 'P0002') return fail(error.message, 409);
    if (error || !saved) return fail('unavailable', 503);
    if (newToken)
      cookieStore.set('prospect_requests', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: `/api/landing/${code}/answers/request`,
        maxAge: 60 * 60 * 24 * 30,
      });
    return json({ request: publicRequest(saved), contact }, noStore);
  }

  if (!answerOwner && !tokenHash) return json({ request: null, contact }, noStore);
  let query = db
    .from('prospect_requests')
    .select('*')
    .eq('session_id', session.id)
    .eq('status', 'open');
  if (!answerOwner) query = query.eq('requester_token_hash', tokenHash!);
  const { data: ownRequest, error } = await query.maybeSingle();
  if (error) return fail('unavailable', 503);
  if (action === 'cancel' && cancellation?.success) {
    if (!ownRequest || ownRequest.id !== cancellation.data.requestId)
      return fail('request_not_found', 404);
    const { data: cancelled, error: cancelError } = await db
      .from('prospect_requests')
      .update({ status: 'withdrawn' })
      .eq('id', ownRequest.id)
      .eq('session_id', session.id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (cancelError) return fail('unavailable', 503);
    if (!cancelled) return fail('request_changed', 409);
    return json({ request: null, contact }, noStore);
  }
  return json({ request: publicRequest(ownRequest), contact }, noStore);
}
