import { after } from 'next/server';
import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { kickWorkers } from '@/lib/jobs/kick';

/**
 * POST /api/sessions/[id]/re-enrich — manual retry (spec §15.2).
 *
 * For a session whose enrichment failed, or to regenerate after the rep changed
 * their business profile. requeue_enrichment bumps the details revision, so a
 * run already in flight commits `stale` and restarts rather than overwriting the
 * newer request.
 */
export const POST = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const { data: session, error } = await serviceClient().rpc('requeue_enrichment', {
    p_session_id: id,
    p_user_id: rep.userId,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found')) return fail('session_not_found', 404);
    if (message.includes('details_missing')) return fail('details_missing', 409);
    throw new Error(`requeue_enrichment failed: ${message}`);
  }

  after(async () => {
    try {
      await kickWorkers();
    } catch (kickError) {
      console.error(
        JSON.stringify({
          event: 'kick_failed',
          sessionId: id,
          error: kickError instanceof Error ? kickError.message : String(kickError),
        }),
      );
    }
  });

  return json({ session });
});
