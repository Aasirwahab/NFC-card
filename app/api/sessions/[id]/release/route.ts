import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

/**
 * POST /api/sessions/[id]/release — give back a pre-activated card that was
 * never handed out, so it can be registered to another event (2026-09-25 review).
 *
 * Refused (409) once there is any sign the card left the rep's hand: details
 * added, or a prospect opened it. See the release_card migration for why.
 */
export const POST = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const { data: session, error } = await serviceClient().rpc('release_card', {
    p_session_id: id,
    p_user_id: rep.userId,
  });

  if (error) {
    if ((error.message ?? '').includes('card_not_releasable')) {
      return fail('card_not_releasable', 409);
    }
    throw new Error(`release_card failed: ${error.message}`);
  }

  return json({ session });
});
