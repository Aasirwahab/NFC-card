import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { pitchRatingSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/sessions/[id]/pitch/rating — thumbs up or down (spec §14.5).
 *
 * Always rates the pitch the MODEL wrote, recorded with its model and prompt
 * version, so the ratings say which prompt changes help. Rating the same pitch
 * again replaces the earlier judgement.
 *
 *   200 { rating }
 *   404 { error: "session_not_found" }
 *   409 { error: "nothing_to_rate" }   no generated pitch yet, or research failed
 */
export const POST = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const parsed = pitchRatingSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { data, error } = await serviceClient().rpc('rate_pitch', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_rating: parsed.data.rating,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found')) return fail('session_not_found', 404);
    if (message.includes('nothing_to_rate')) return fail('nothing_to_rate', 409);
    throw new Error(`rate_pitch failed: ${message}`);
  }

  return json({ rating: { rating: data.rating, reason: data.reason } });
});
