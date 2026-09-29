import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

const bodySchema = z.object({ event_id: z.string().uuid() });

/**
 * POST /api/sessions/[id]/event: file a lead under a different event. The event's
 * own counter gives the new sequence number and colour.
 */
export const POST = withRep(async (rep, request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return fail('invalid_request', 400);
  }

  const { data: session, error } = await serviceClient().rpc('move_session_to_event', {
    p_session_id: id,
    p_event_id: parsed.data.event_id,
    p_user_id: rep.userId,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('session_not_found') || message.includes('event_not_found')) {
      return fail('not_found', 404);
    }
    throw new Error(`move_session_to_event failed: ${message}`);
  }

  return json({ session });
});
