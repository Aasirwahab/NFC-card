import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { registerRequestSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/sessions/register — the contract written out exactly in §15.4.
 *
 *   200 { session, already_registered: false }
 *   409 { error: "card_already_assigned", session: { ... } }
 *   404 { error: "card_not_found" }
 *
 * All the concurrency lives in register_card (§12.1), which survives a double
 * tap, an offline retry arriving twice, and two reps racing for the same card.
 * This handler validates, calls it, and translates its error codes.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = registerRequestSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const body = parsed.data;
  const db = serviceClient();

  // Purely so the response can say WHICH of the two 200 cases this is. The RPC
  // is still the guard: it re-checks under a row lock, so nothing here is a
  // check-then-insert (§9.3). A race between this read and the RPC produces a
  // mislabelled `already_registered`, never a duplicate session.
  const { data: existing } = await db
    .from('sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', rep.userId)
    .maybeSingle();

  const { data: session, error } = await db.rpc('register_card', {
    p_session_id: body.session_id,
    p_code: body.code,
    p_event_id: body.event_id,
    p_user_id: rep.userId,
    p_registered_by: body.registered_by,
    p_first_name: body.first_name ?? null,
  });

  if (error) {
    const message = error.message ?? '';

    if (message.includes('card_not_found') || message.includes('event_not_found')) {
      // One response for both: a rep who mistypes a code and a rep whose event
      // was deleted get the same "that card is not yours" outcome.
      return fail('card_not_found', 404);
    }

    if (message.includes('card_already_assigned')) {
      // Nearly always a rep checking which card this is, so hand back the
      // session they actually meant rather than an error to decode (§12.1).
      const { data: card } = await db
        .from('cards')
        .select('id')
        .eq('code', body.code)
        .eq('user_id', rep.userId)
        .maybeSingle();

      const { data: taken } = card
        ? await db
            .from('sessions')
            .select(
              'id, event_sequence_number, colour_tag, prospect_name, prospect_company, registered_at',
            )
            .eq('card_id', card.id)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null };

      return fail('card_already_assigned', 409, { session: taken });
    }

    throw new Error(`register_card failed: ${message}`);
  }

  return json({ session, already_registered: existing !== null });
});
