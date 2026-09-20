import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { sessionDetailsSchema } from '@/lib/schemas/sessions';

/**
 * PATCH /api/sessions/[id] — add or edit details (spec §15.2).
 *
 * Transitions pending -> queued AND enqueues the enrichment job, in ONE
 * transaction inside save_session_details (§13). A job can never exist for a
 * session that was rolled back, and a saved session can never fail to enqueue.
 *
 * Editing an already-enriched session re-queues it: the lifecycle explicitly
 * allows edit -> regenerate (§10.2). There is no "locked after save".
 */
export const PATCH = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const parsed = sessionDetailsSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { data: session, error } = await serviceClient().rpc('save_session_details', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_details: parsed.data,
  });

  if (error) {
    if ((error.message ?? '').includes('session_not_found')) {
      // Also covers a voided session and another rep's session: the RPC scopes
      // by user_id, so there is nothing to distinguish for the caller.
      return fail('session_not_found', 404);
    }
    throw new Error(`save_session_details failed: ${error.message}`);
  }

  // TODO(phase 3): after() kick to /api/jobs/kick. Until the worker exists the
  // job simply waits in the queue, and the landing page renders the `crafting`
  // state and then falls back to the template at 90 seconds — which is one of
  // the four designed states, not a failure (§16).
  return json({ session });
});
