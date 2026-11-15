import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { followupOutcomeSchema } from '@/lib/schemas/sessions';

/**
 * POST /api/sessions/[id]/followup/outcome { outcome: 'replied' | 'dropped' } (§19.3).
 *
 * The lead replied, or the rep is dropping it. Either way no draft is written for
 * it again. Setting the same outcome twice changes nothing. 'reopen' undoes it.
 */
export const POST = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const parsed = followupOutcomeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (!id.success) return fail('followup_not_found', 404);

  const { data, error } = await serviceClient()
    .from('sessions')
    .update({ followup_outcome: parsed.data.outcome === 'reopen' ? null : parsed.data.outcome })
    .eq('id', id.data)
    .eq('user_id', rep.userId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`followup outcome failed: ${error.message}`);
  if (!data) return fail('followup_not_found', 404);
  return json({ ok: true });
});
