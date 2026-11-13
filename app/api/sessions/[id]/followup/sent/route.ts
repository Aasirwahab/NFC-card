import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { z } from 'zod';

/**
 * POST /api/sessions/[id]/followup/sent: the rep sent the follow-up by hand (§19.3).
 * Idempotent: the first call records it, later calls change nothing.
 */
export const POST = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  if (!id.success) return fail('followup_not_found', 404);

  const { data, error } = await serviceClient().rpc('mark_followup_sent', {
    p_session_id: id.data,
    p_user_id: rep.userId,
  });
  if (error) throw new Error(`mark_followup_sent failed: ${error.message}`);
  if (!data) return fail('followup_not_found', 404);
  return json({ ok: true });
});
