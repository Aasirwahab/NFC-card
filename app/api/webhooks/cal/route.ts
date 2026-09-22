import { fail, json } from '@/lib/api';
import { readCalWebhook } from '@/lib/booking/cal';
import { verifyCalSignature } from '@/lib/booking/signature';
import { serviceClient } from '@/lib/db/service';
import { env } from '@/lib/env';

/**
 * POST /api/webhooks/cal — Cal.com booking webhook (spec §19.1).
 *
 *   - The signature is verified before anything else, against the RAW body.
 *   - Idempotent on (provider, provider_event_id): a replayed delivery updates
 *     rather than duplicates (record_booking).
 *   - Cancellations and reschedules update status rather than deleting the row.
 *   - Returns 200 quickly. Events this product does not track are acknowledged
 *     and ignored, so Cal.com does not keep retrying them.
 *
 * No confirmation email is sent from here: Cal.com already confirms the booking
 * to both sides, and a second copy from us would read as a mistake.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!env.CAL_WEBHOOK_SECRET) return fail('webhook_not_configured', 503);

  const rawBody = await request.text();
  if (
    !verifyCalSignature(rawBody, request.headers.get('x-cal-signature-256'), env.CAL_WEBHOOK_SECRET)
  ) {
    return fail('invalid_signature', 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return fail('invalid_body', 400);
  }

  const change = readCalWebhook(body);
  if (!change) return json({ ignored: true });

  const { data: outcome, error } = await serviceClient().rpc('record_booking', {
    p_uid: change.uid,
    p_status: change.status,
    p_session_id: change.sessionId,
    p_starts_at: change.startsAt,
    p_email: change.email,
    p_name: change.name,
    p_rescheduled_from: change.rescheduledFrom,
  });

  if (error) {
    // A 500 makes Cal.com retry, which is what we want for a database blip.
    console.error(JSON.stringify({ event: 'booking_record_failed', error: error.message }));
    return fail('internal_error', 500);
  }

  console.log(
    JSON.stringify({
      event: 'booking_webhook',
      outcome,
      status: change.status,
      linked: change.sessionId !== null,
    }),
  );
  return json({ outcome });
}
