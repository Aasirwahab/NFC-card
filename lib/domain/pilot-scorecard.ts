import {
  eventResults,
  type EventResults,
  type ResultBooking,
  type ResultEvent,
  type ResultSession,
} from './event-results';

/**
 * The pilot scorecard for staff: the same counts as a rep's event results, across
 * every event, per rep and in total. It answers the pilot's one open question: do
 * prospects open a card after the rep has walked away, and does that turn into
 * meetings? PURE. Counts only, no prospect names.
 */

export type ScorecardSession = ResultSession & { user_id: string };

export type ScorecardRow = { userId: string; results: EventResults };

/** Meetings booked per 10 cards opened, to one decimal, or null with nothing opened. */
export function bookedPer10Opened(r: Pick<EventResults, 'booked' | 'opened'>): number | null {
  return r.opened > 0 ? Math.round((r.booked / r.opened) * 100) / 10 : null;
}

export function pilotScorecard(input: {
  sessions: ScorecardSession[];
  events: ResultEvent[];
  bookings: ResultBooking[];
}): { total: EventResults; reps: ScorecardRow[] } {
  const owner = new Map(input.sessions.map((s) => [s.id, s.user_id]));
  const byUser = new Map<string, ScorecardSession[]>();
  for (const s of input.sessions) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  const reps = [...byUser.entries()].map(([userId, sessions]) => ({
    userId,
    results: eventResults({
      sessions,
      events: input.events.filter((e) => owner.get(e.session_id) === userId),
      bookings: input.bookings.filter((b) => b.session_id && owner.get(b.session_id) === userId),
      ratings: [],
    }),
  }));

  return {
    total: eventResults({ ...input, ratings: [] }),
    reps: reps.sort((a, b) => b.results.registered - a.results.registered),
  };
}
