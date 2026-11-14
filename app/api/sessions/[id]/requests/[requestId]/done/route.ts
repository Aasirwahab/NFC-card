import { z } from 'zod';
import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

export const POST = withRep(
  async (
    rep,
    _request,
    context: {
      params: Promise<{ id: string; requestId: string }>;
    },
  ) => {
    const parsed = z.object({ id: z.uuid(), requestId: z.uuid() }).safeParse(await context.params);
    if (!parsed.success) return fail('request_not_found', 404);
    const { data, error } = await serviceClient().rpc('mark_prospect_request_done', {
      p_session_id: parsed.data.id,
      p_request_id: parsed.data.requestId,
      p_user_id: rep.userId,
    });
    if (error) throw new Error(`mark_prospect_request_done failed: ${error.message}`);
    if (!data) return fail('request_not_found', 404);
    return json({ ok: true });
  },
);
