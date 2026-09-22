import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { fail, json, readJson } from '@/lib/api';
import { resolveCode, shownPitch } from '@/lib/db/landing';
import { getRep } from '@/lib/db/server';
import { serviceClient } from '@/lib/db/service';
import { REP_DEVICE_COOKIE } from '@/lib/domain/audience';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { emailConfigured, sendEmail } from '@/lib/email/mailer';
import { pitchEmail } from '@/lib/email/pitch-email';
import { env } from '@/lib/env';
import { checkRateLimit, clientIp, peekRateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/landing/[code]/email — "Email me this page" (spec §19.2).
 *
 * The one transactional path to a prospect in v1: they type THEIR OWN address and
 * ask for the page. That explicit request is what keeps it clean — there is no
 * other outbound email to prospects (§19.2).
 *
 * Two limits, because a card is a bearer token: 3 an hour per IP (§22.2), and 3 a
 * day per card, so nobody holding a card can use it to send our email to a list
 * of strangers.
 *
 * The address is saved to the session only when the rep has none — the form says
 * so — and a reply goes to the rep, not to a no-reply address.
 *
 *   200 { sent: true }      404 not_found     403 owner_preview
 *   429 rate_limited        503 email_unavailable
 */
export const dynamic = 'force-dynamic';

const PER_CARD_PER_DAY = 3;

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  if (!emailConfigured()) return fail('email_unavailable', 503);

  const parsed = requestSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_email', 400);

  const { code: raw } = await context.params;
  const code = normaliseCode(raw);
  const ip = clientIp(await headers());
  const miss = async () => {
    await checkRateLimit('landingMiss', ip);
    return fail('not_found', 404);
  };

  if (!isValidCode(code)) return miss();

  const [limit, missesLeft] = await Promise.all([
    checkRateLimit('landingEmail', ip),
    peekRateLimit('landingMiss', ip),
  ]);
  if (!limit.allowed || !missesLeft) return fail('rate_limited', 429);

  // As an anonymous visitor: the owner must not reach the prospect branch.
  const resolved = await resolveCode(code, null);
  if (resolved.audience === 'unavailable') return fail('email_unavailable', 503);
  if (resolved.audience !== 'prospect') return miss();

  const { session } = resolved;

  // The rep's own tap or preview would save the rep's address as the prospect's.
  const [rep, cookieStore] = await Promise.all([getRep(), cookies()]);
  if (
    rep?.userId === session.user_id ||
    cookieStore.get(REP_DEVICE_COOKIE)?.value === session.user_id
  ) {
    return fail('owner_preview', 403);
  }

  const db = serviceClient();
  const { count } = await db
    .from('session_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('type', 'page_emailed')
    .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= PER_CARD_PER_DAY) return fail('rate_limited', 429);

  const { data: profile } = await db
    .from('profiles')
    .select('contact_email')
    .eq('id', session.user_id)
    .maybeSingle();

  const email = pitchEmail({
    prospectName: session.prospect_name,
    repFullName: resolved.rep.fullName,
    repTitle: resolved.rep.title,
    businessName: resolved.business?.companyName ?? null,
    pitch: shownPitch(resolved),
    pageUrl: new URL(`/c/${code}`, env.NEXT_PUBLIC_APP_URL).toString(),
  });

  try {
    await sendEmail({
      to: parsed.data.email,
      ...email,
      replyTo: profile?.contact_email ?? undefined,
      idempotencyKey: `page_email:${session.id}:${parsed.data.email}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'page_email_failed',
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return fail('email_unavailable', 503);
  }

  // Only after a successful send. The rep gets the address only if they had none.
  await Promise.all([
    db
      .from('sessions')
      .update({ prospect_email: parsed.data.email })
      .eq('id', session.id)
      .is('prospect_email', null),
    db.from('session_events').insert({ session_id: session.id, type: 'page_emailed' }),
  ]);

  return json({ sent: true });
}
