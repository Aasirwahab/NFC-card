import { z } from 'zod';
import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';

const bodySchema = z.object({ timezone: z.string().trim().min(1).max(64) });

function known(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/profile/timezone: the phone tells us its time zone the first time the rep
 * opens the app. Only ever fills the default ('UTC'); a zone the rep chose is left alone.
 */
export const POST = withRep(async (rep, request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success || !known(parsed.data.timezone)) return fail('invalid_request', 400);

  const { error } = await serviceClient()
    .from('profiles')
    .update({ timezone: parsed.data.timezone })
    .eq('id', rep.userId)
    .eq('timezone', 'UTC');
  if (error) throw new Error(`timezone update failed: ${error.message}`);

  return json({ ok: true });
});
