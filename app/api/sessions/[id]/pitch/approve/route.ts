import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

/**
 * The rep approves (or withdraws approval of) the current pitch. Only matters
 * when the rep turned on "Review before it goes live" in Setup: until then a
 * prospect sees the warm pending page (lib/domain/render-state.ts).
 *
 *   POST { approved: boolean }  200 { approvedAt } | 404
 */

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ approved: z.boolean() });

export const POST = withRep(async (rep, request, context: Context) => {
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const { data, error } = await serviceClient().rpc('approve_pitch', {
    p_session_id: id,
    p_user_id: rep.userId,
    p_approved: parsed.data.approved,
  });
  if (error) {
    if ((error.message ?? '').includes('session_not_found')) return fail('session_not_found', 404);
    throw new Error(`approve_pitch failed: ${error.message}`);
  }

  return json({ approvedAt: data?.pitch_approved_at ?? null });
});
