import 'server-only';
import { serviceClient } from '@/lib/db/service';
import { pilotScorecard, type ScorecardSession } from '@/lib/domain/pilot-scorecard';
import { listReps } from './data';

/**
 * Loads the pilot scorecard for /ops. A pilot is a few reps and tens of cards, so
 * it reads everything in one pass; the row cap keeps a mistake from reading a
 * whole table later.
 */
const ROW_CAP = 5_000;

export async function loadScorecard() {
  const db = serviceClient();

  // A failed read must fail the page, not show an empty pilot.
  const [reps, { data: rows }, { data: events }, { data: bookings }] = await Promise.all([
    listReps(),
    db
      .from('sessions')
      .select(
        'id, user_id, status, registered_at, details_completed_at, first_viewed_at, first_view_source, chat_response_count',
      )
      .limit(ROW_CAP)
      .throwOnError(),
    db
      .from('session_events')
      .select('session_id, type')
      .in('type', ['booking_opened', 'linkedin_opened', 'released'])
      .limit(ROW_CAP)
      .throwOnError(),
    db.from('bookings').select('session_id, status').limit(ROW_CAP).throwOnError(),
  ]);

  const sessions: ScorecardSession[] = (rows ?? []).map((s) => ({
    ...s,
    domain_source: null,
    has_research: false,
  }));

  const scorecard = pilotScorecard({
    sessions,
    events: events ?? [],
    bookings: bookings ?? [],
  });
  const names = new Map(reps.map((r) => [r.id, r.name ?? r.email]));

  return {
    total: scorecard.total,
    reps: scorecard.reps.map((row) => ({ ...row, name: names.get(row.userId) ?? 'Unknown' })),
  };
}
