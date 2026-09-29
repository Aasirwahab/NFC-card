import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { jevClient } from '@/lib/jev/server';
import { findCompanySite } from '@/lib/lookup/company';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { searchClient } from '@/lib/search/server';

const bodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  place: z.string().trim().max(80).optional(),
});

/**
 * POST /api/lookup/company: likely official websites for a company name. Suggests
 * only; the rep taps the right one. 501 when no search provider is configured.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('invalid_request', 400);

  const search = searchClient();
  if (!search) return fail('search_not_configured', 501);

  const limit = await checkRateLimit('lookup', rep.userId);
  if (!limit.allowed) return fail('rate_limited', 429);

  const lookup = await findCompanySite({
    search,
    jev: jevClient(),
    name: parsed.data.name,
    place: parsed.data.place ?? null,
  });
  return json(lookup);
});
