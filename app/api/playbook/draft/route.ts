import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { modelFor, pitchUsesMock } from '@/lib/ai/models';
import { serviceClient } from '@/lib/db/service';
import { draftPlaybook } from '@/lib/playbook/draft';
import { checkRateLimit } from '@/lib/security/rate-limit';

const bodySchema = z.object({ problem: z.string().trim().min(2).max(200) });

/** POST /api/playbook/draft: a first version of one entry from the rep's own notes. Saves nothing. */
export const POST = withRep(async (rep, request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);
  if (pitchUsesMock()) return fail('model_not_configured', 501);

  const limit = await checkRateLimit('lookup', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const db = serviceClient();
  const [{ data: business }, { data: knowledge }] = await Promise.all([
    db
      .from('business_profiles')
      .select('company_name, tagline, services')
      .eq('user_id', rep.userId)
      .maybeSingle(),
    db.from('knowledge_base').select('topic, content').eq('user_id', rep.userId),
  ]);
  const notes = [
    business
      ? `Business: ${business.company_name}. ${business.tagline ?? ''} Services: ${business.services.join('; ')}`
      : '',
    ...(knowledge ?? [])
      .filter((k) => k.topic !== 'pricing')
      .map((k) => `${k.topic}: ${k.content}`),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6_000);

  return json(
    await draftPlaybook({ model: modelFor('chat').model, problem: parsed.data.problem, notes }),
  );
});
