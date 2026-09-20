import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

/**
 * POST /api/sessions/[id]/void (spec §15.2, §10.1).
 *
 * The rep registered the wrong card. The session is VOIDED, not deleted — the
 * audit trail stays — and the card is voided too, because it may already be in
 * someone's pocket and a card can never be reassigned.
 *
 * Voiding is a deliberate, confirmed action in the UI.
 */
export const POST = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const { data: session, error } = await serviceClient().rpc('void_session', {
    p_session_id: id,
    p_user_id: rep.userId,
  });

  if (error) {
    if ((error.message ?? '').includes('session_not_found')) {
      return fail('session_not_found', 404);
    }
    throw new Error(`void_session failed: ${error.message}`);
  }

  return json({ session });
});
