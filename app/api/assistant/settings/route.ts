import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { blockedTopicsSchema } from '@/lib/chat/settings';
import { serviceClient } from '@/lib/db/service';
import { checkRateLimit } from '@/lib/security/rate-limit';

const schema = z.object({ blockedTopics: blockedTopicsSchema });

export const POST = withRep(async (rep, request) => {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400, { issues: parsed.error.issues });

  const limit = await checkRateLimit('lookup', `assistant-settings:${rep.userId}`);
  if (!limit.allowed) return fail('rate_limited', 429);

  const { data, error } = await serviceClient()
    .from('profiles')
    .update({ assistant_blocked_topics: parsed.data.blockedTopics })
    .eq('id', rep.userId)
    .select('id')
    .maybeSingle();
  if (error) return fail('save_failed', 500);
  if (!data) return fail('not_found', 404);
  return json({ saved: true });
});
