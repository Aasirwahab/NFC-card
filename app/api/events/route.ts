import { fail, json, readJson, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { listEvents } from '@/lib/db/rep';
import { eventSchema } from '@/lib/schemas/sessions';

/** GET /api/events — the rep's events, newest first. */
export const GET = withRep(async (rep) => {
  return json({ events: await listEvents(rep.userId) });
});

/**
 * POST /api/events
 *
 * The niches and their quick-select problem sets are not a UI convenience; they
 * are proprietary domain knowledge that a generic personalisation tool cannot
 * replicate without doing the same work (§3, §5.2).
 */
export const POST = withRep(async (rep, request) => {
  const parsed = eventSchema.safeParse(await readJson(request));

  if (!parsed.success) {
    return fail('invalid_request', 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { name, event_date, location, niches } = parsed.data;

  const { data: event, error } = await serviceClient()
    .from('events')
    .insert({
      user_id: rep.userId,
      name,
      event_date,
      location: location ?? null,
      niches,
    })
    .select('id, name, event_date, location, next_card_sequence')
    .single();

  if (error) throw new Error(`could not create event: ${error.message}`);

  return json({ event }, { status: 201 });
});
