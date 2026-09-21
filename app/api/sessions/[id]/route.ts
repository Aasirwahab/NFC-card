import { after } from 'next/server';
import { fail, json, readJson, withRep } from '@/lib/api';
import { kickWorkers } from '@/lib/jobs/kick';
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

  // The fast path (§13): start a worker once the response has gone back to the
  // rep, so the save never waits on it. The minute-by-minute cron is the safety
  // net if this is missed — a missed kick costs at most sixty seconds.
  after(async () => {
    try {
      await kickWorkers();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'kick_failed',
          sessionId: id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  return json({ session });
});
