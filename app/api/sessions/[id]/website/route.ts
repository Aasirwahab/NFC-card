import { after } from 'next/server';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { kickWorkers } from '@/lib/jobs/kick';
import { confirmWebsiteSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/sessions/[id]/website — "yes, that's their site" (2026-09-25 review).
 *
 * A guessed domain is only a suggestion: every "ABC Services" site names "ABC
 * Services". Its facts stay off the prospect's page until the rep confirms it
 * from the preview. Confirming records the site as the rep's own evidence and
 * re-enriches in one transaction, like a details save.
 */
export const POST = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;

  const parsed = confirmWebsiteSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const { data: session, error } = await serviceClient().rpc('confirm_prospect_website', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_website: parsed.data.website,
  });

  if (error) {
    if ((error.message ?? '').includes('session_not_found')) return fail('session_not_found', 404);
    throw new Error(`confirm_prospect_website failed: ${error.message}`);
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
