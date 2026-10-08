import { headers } from 'next/headers';
import { fail, json } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { isValidCode, normaliseCode } from '@/lib/domain/codes';
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit';

/**
 * POST /api/landing/[code]/remove: "Remove my details", from the prospect page.
 *
 * A prospect who never signed up can delete the record the rep made about them
 * without emailing anyone. It runs the same deletion a rep gets (`delete_session`):
 * the session, the chat, the booking record and the queued jobs go, and the card is
 * voided so it cannot be re-used for the same person.
 *
 * The answer is the same whether or not there was a record, so this reveals nothing
 * about which codes exist. Limited to 5 an hour per IP.
 *
 *   200 { ok: true }    404 not_found (malformed code)    429 rate_limited
 */
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ code: string }> }) {
  const code = normaliseCode((await context.params).code);
  if (!isValidCode(code)) return fail('not_found', 404);

  const limit = await checkRateLimit('landingRemove', clientIp(await headers()));
  if (!limit.allowed) return fail('rate_limited', 429);

  const db = serviceClient();
  const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();

  if (card) {
    const { data: session } = await db
      .from('sessions')
      .select('id, user_id')
      .eq('card_id', card.id)
      .eq('status', 'active')
      .maybeSingle();

    if (session) {
      const { error } = await db.rpc('delete_session', {
        p_session_id: session.id,
        p_user_id: session.user_id,
      });
      if (error) {
        console.error(JSON.stringify({ event: 'prospect_remove_failed', error: error.message }));
        return fail('internal_error', 500);
      }
      // No personal data in the log: only that a prospect used the control.
      console.error(JSON.stringify({ event: 'prospect_removed_own_record' }));
    }
  }

  return json({ ok: true });
}
