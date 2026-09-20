import { json, withRep } from '@/lib/api';
import { listSessions } from '@/lib/db/rep';

/**
 * GET /api/sessions — the dashboard list (spec §15.2).
 *
 * Filter by event, enrichment status, and tapped / not tapped. The last one is
 * what surfaces the prospects who never came back, which is the input to the
 * no-tap follow-up (§19.3).
 */
export const GET = withRep(async (rep, request) => {
  const params = new URL(request.url).searchParams;
  const tapped = params.get('tapped');

  const sessions = await listSessions(rep.userId, {
    eventId: params.get('event') ?? undefined,
    tapped: tapped === 'true' ? true : tapped === 'false' ? false : undefined,
  });

  return json({ sessions });
});
