import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

/** POST /api/sessions/[id]/followup/sent — the rep sent the draft by hand (§19.3). */
export const POST = withRep(async (rep, _request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { data, error } = await serviceClient().rpc('mark_followup_sent', {
    p_session_id: id,
    p_user_id: rep.userId,
  });
  if (error) throw new Error(`mark_followup_sent failed: ${error.message}`);
  if (!data) return fail('followup_not_found', 404);
  return json({ ok: true });
});
