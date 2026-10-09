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
 *
 * A card's session starts on its first tap. When the PROSPECT taps first, the
 * session starts with their view, so "time to open" is zero and says nothing
 * about coming back later. Those cards are counted on their own (prospectFirst),
 * and the "opened later" numbers use only cards the rep registered first.
 */

/** registered_by for a session the prospect's own first tap created. */
export const PROSPECT_TAP = 'prospect_tap';

const DAY_MS = 24 * 3_600_000;

export type ScorecardSession = ResultSession & { user_id: string; registered_by: string };

export type Scorecard = EventResults & {
  /** Live cards the rep registered before the prospect opened them. */
  repFirst: number;
  /** Of those, opened by the prospect afterwards. */
  repFirstOpened: number;
  /** Of those, opened within 24 hours of the rep registering the card. */
  repFirstOpenedWithin24h: number;
  /** Live cards whose session the prospect's own tap created. */
  prospectFirst: number;
};

export type ScorecardRow = { userId: string; results: Scorecard };

/** Meetings booked per 10 cards opened, to one decimal, or null with nothing opened. */
export function bookedPer10Opened(r: Pick<EventResults, 'booked' | 'opened'>): number | null {
  return r.opened > 0 ? Math.round((r.booked / r.opened) * 100) / 10 : null;
}

function score(
  sessions: ScorecardSession[],
  events: ResultEvent[],
  bookings: ResultBooking[],
): Scorecard {
  const active = sessions.filter((s) => s.status === 'active');
  const repFirst = active.filter((s) => s.registered_by !== PROSPECT_TAP);
  const repFirstOpened = repFirst.filter((s) => s.first_viewed_at);

  return {
    ...eventResults({ sessions, events, bookings, ratings: [] }),
    repFirst: repFirst.length,
    repFirstOpened: repFirstOpened.length,
    repFirstOpenedWithin24h: repFirstOpened.filter(
      (s) => Date.parse(s.first_viewed_at!) - Date.parse(s.registered_at) <= DAY_MS,
    ).length,
    prospectFirst: active.length - repFirst.length,
  };
}

export function pilotScorecard(input: {
  sessions: ScorecardSession[];
  events: ResultEvent[];
  bookings: ResultBooking[];
}): { total: Scorecard; reps: ScorecardRow[] } {
  const owner = new Map(input.sessions.map((s) => [s.id, s.user_id]));
  const byUser = new Map<string, ScorecardSession[]>();
  for (const s of input.sessions) {
    const list = byUser.get(s.user_id);
    if (list) list.push(s);
    else byUser.set(s.user_id, [s]);
  }

  const reps = [...byUser.entries()].map(([userId, sessions]) => ({
    userId,
    results: score(
      sessions,
      input.events.filter((e) => owner.get(e.session_id) === userId),
      input.bookings.filter((b) => b.session_id && owner.get(b.session_id) === userId),
    ),
  }));

  return {
    total: score(input.sessions, input.events, input.bookings),
    reps: reps.sort((a, b) => b.results.registered - a.results.registered),
  };
}
