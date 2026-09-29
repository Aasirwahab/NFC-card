import { after } from 'next/server';
import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
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
const bodySchema = z.object({ guidance: z.string().trim().max(200).optional() });

export const POST = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  // Optional body: a short style request for the next draft. No body regenerates as before.
  const raw = await readJson(request);
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return fail('invalid_request', 400);

  const { data: session, error } = await serviceClient().rpc('requeue_enrichment', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_guidance: parsed.data.guidance ?? null,
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
