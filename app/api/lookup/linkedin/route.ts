import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { jevClient } from '@/lib/jev/server';
import { findLinkedInProfile } from '@/lib/lookup/linkedin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { searchClient } from '@/lib/search/server';

const bodySchema = z.object({
  name: z.string().trim().min(3).max(120),
  company: z.string().trim().max(160).optional(),
});

/**
 * POST /api/lookup/linkedin: candidate profiles for a name and company, from
 * search-result text only (LinkedIn is never fetched). Nothing returned here is
 * stored: the rep taps one and only that link is saved with the lead.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const search = searchClient();
  if (!search) return fail('search_not_configured', 501);

  const limit = await checkRateLimit('lookup', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const lookup = await findLinkedInProfile({
    search,
    jev: jevClient(),
    name: parsed.data.name,
    company: parsed.data.company ?? null,
  });
  return json(lookup);
});
