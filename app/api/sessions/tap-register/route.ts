import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { tapRegisterRequestSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/sessions/tap-register: the first tap on an unused card, by the rep.
 *
 *   200 { session, already_registered }
 *   409 { error: "card_already_assigned", session }   the card is already someone's lead
 *   404 { error: "card_not_found" }
 *
 * The claim, the event choice and the idempotency all live in tap_register_card
 * (which wraps register_card, §12.1); this validates and translates.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = tapRegisterRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const body = parsed.data;
  const db = serviceClient();

  const { data: existing } = await db
    .from('sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', rep.userId)
    .maybeSingle();

  const { data: session, error } = await db.rpc('tap_register_card', {
    p_session_id: body.session_id,
    p_code: body.code,
    p_user_id: rep.userId,
    p_registered_by: body.registered_by,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('card_not_found')) return fail('card_not_found', 404);

    if (message.includes('card_already_assigned')) {
      // Usually a prospect tapped first, or the rep is checking a card: hand back
      // the lead they meant instead of an error to decode.
      const { data: card } = await db
        .from('cards')
        .select('id')
        .eq('code', body.code)
        .eq('user_id', rep.userId)
        .maybeSingle();
      const { data: taken } = card
        ? await db
            .from('sessions')
            .select('id, event_sequence_number, colour_tag, prospect_name, registered_at')
            .eq('card_id', card.id)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null };
      return fail('card_already_assigned', 409, { session: taken });
    }

    throw new Error(`tap_register_card failed: ${message}`);
  }

  return json({ session, already_registered: existing !== null });
});
