import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { modelFor } from '@/lib/ai/models';
import { extractNote } from '@/lib/capture/note';
import { pitchUsesMock } from '@/lib/ai/models';
import { checkRateLimit } from '@/lib/security/rate-limit';

const bodySchema = z.object({
  line: z.string().trim().min(3).max(600),
  niches: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        problems: z.array(z.string().trim().min(1).max(200)).max(30),
      }),
    )
    .max(20),
});

/**
 * POST /api/capture/note: one dictated or typed line -> proposed form fields. Saves
 * nothing. The private-note field is never involved; the line goes to the chat
 * model only (zero-retention routing), and only fields present in the line or
 * the event's own list come back.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);
  if (pitchUsesMock()) return fail('model_not_configured', 501);

  const limit = await checkRateLimit('lookup', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const fill = await extractNote({
    model: modelFor('chat').model,
    line: parsed.data.line,
    niches: parsed.data.niches,
  });
  return json(fill);
});
