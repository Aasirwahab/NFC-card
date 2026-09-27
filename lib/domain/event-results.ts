/**
 * Pilot results for one event (spec §27, Phase 5b).
 *
 * The field pilot builds nothing; it answers four questions (§26 Phase 5b): do
 * people tap and when, how bad is venue signal, are the pitches good, and where
 * do prospects stop. Everything needed is already recorded — this turns the
 * rows into the numbers, so the pilot's written answers and the first case study
 * come from the product rather than from a spreadsheet.
 *
 * PURE. Counts only, inside §6's "basic counts". No prospect names in the output.
 */

export type ResultSession = {
  id: string;
  status: string;
  registered_at: string;
  details_completed_at: string | null;
  first_viewed_at: string | null;
  first_view_source: string | null;
  chat_response_count: number;
  /** sessions.research.domainSource: how the company site was found, if at all. */
  domain_source: 'website' | 'email' | 'guess' | null;
  has_research: boolean;
};

export type ResultEvent = { session_id: string; type: string };
export type ResultBooking = { session_id: string | null; status: string };
export type ResultRating = { session_id: string; rating: number };

export type EventResults = {
  registered: number;
  released: number;
  voided: number;
  detailsAdded: number;
  opened: number;
  openedByNfc: number;
  openedByQr: number;
  clickedBook: number;
  booked: number;
  linkedinClicks: number;
  chatUsed: number;
  ratedUp: number;
  ratedDown: number;
  research: { website: number; email: number; guess: number; none: number };
  /** Median hours from registration to first view, among opened cards. */
  medianHoursToOpen: number | null;
  /** Median hours from registration to details added, among detailed cards. */
  medianHoursToDetails: number | null;
};

const HOUR = 3_600_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function hoursBetween(from: string, to: string): number {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / HOUR);
}

/** Share of `part` in `whole`, as a whole percentage, or null when there is no base. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function eventResults(input: {
  sessions: ResultSession[];
  events: ResultEvent[];
  bookings: ResultBooking[];
  ratings: ResultRating[];
}): EventResults {
  const releasedIds = new Set(
    input.events.filter((e) => e.type === 'released').map((e) => e.session_id),
  );
  const active = input.sessions.filter((s) => s.status === 'active');
  const activeIds = new Set(active.map((s) => s.id));

  // Clicks and bookings count each prospect once, and only live sessions: a
  // voided card's history is not part of how the event went.
  const distinct = (type: string) =>
    new Set(
      input.events
        .filter((e) => e.type === type && activeIds.has(e.session_id))
        .map((e) => e.session_id),
    ).size;

  const opened = active.filter((s) => s.first_viewed_at);
  const detailed = active.filter((s) => s.details_completed_at);

  const research = { website: 0, email: 0, guess: 0, none: 0 };
  for (const s of detailed) {
    if (!s.has_research) continue;
    research[s.domain_source ?? 'none'] += 1;
  }

  return {
    registered: active.length,
    released: input.sessions.filter((s) => releasedIds.has(s.id)).length,
    voided: input.sessions.filter((s) => s.status === 'voided' && !releasedIds.has(s.id)).length,
    detailsAdded: detailed.length,
    opened: opened.length,
    openedByNfc: opened.filter((s) => s.first_view_source !== 'qr').length,
    openedByQr: opened.filter((s) => s.first_view_source === 'qr').length,
    clickedBook: distinct('booking_opened'),
    booked: new Set(
      input.bookings
        .filter((b) => b.status === 'confirmed' && b.session_id && activeIds.has(b.session_id))
        .map((b) => b.session_id),
    ).size,
    linkedinClicks: distinct('linkedin_opened'),
    chatUsed: active.filter((s) => s.chat_response_count > 0).length,
    ratedUp: input.ratings.filter((r) => r.rating > 0 && activeIds.has(r.session_id)).length,
    ratedDown: input.ratings.filter((r) => r.rating < 0 && activeIds.has(r.session_id)).length,
    research,
    medianHoursToOpen: median(opened.map((s) => hoursBetween(s.registered_at, s.first_viewed_at!))),
    medianHoursToDetails: median(
      detailed.map((s) => hoursBetween(s.registered_at, s.details_completed_at!)),
    ),
  };
}
