import { composeFollowupDraft, type FollowupChannel } from './draft';

/**
 * Who to follow up with, worked out from what is already recorded (spec §19.3).
 * PURE: no cron and no stored draft is needed. The rep's list on Today is derived
 * from their sessions, the session events and the bookings each time it loads.
 *
 * One display state per lead, in strict precedence:
 *
 *   dropped / replied  the rep closed it
 *   booked             a confirmed or rescheduled booking
 *   sent               the rep confirmed they followed up
 *   review             a question or button press, but no booking
 *   opened-no-action   opened, no booking, no recorded action
 *   due-no-tap         a day to 30 days on and never opened
 *
 * The first, second and third stay out of the actionable queue (a "History" list).
 */
export type FollowupState =
  'dropped' | 'replied' | 'booked' | 'sent' | 'review' | 'opened-no-action' | 'due-no-tap';

export type FollowupSession = {
  id: string;
  status: string;
  details_completed_at: string | null;
  registered_at: string;
  first_viewed_at: string | null;
  followup_sent_at: string | null;
  followup_outcome: string | null;
  /** The problems the rep ticked. The free-text field is deliberately not here. */
  problems: string[];
  prospect_submitted_email: string | null;
  prospect_submitted_phone: string | null;
};

export type FollowupEvent = { session_id: string; type: string };
export type FollowupBooking = { session_id: string | null; status: string };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A card must be this old before a "no tap" note makes sense. */
const DUE_AFTER = DAY;
/** Sessions older than this predate the feature or have gone cold. */
export const FOLLOWUP_WINDOW = 30 * DAY;

export function followupState(
  session: FollowupSession,
  events: FollowupEvent[],
  bookings: FollowupBooking[],
  now: number,
): FollowupState | null {
  if (session.status !== 'active' || !session.details_completed_at) return null;

  if (session.followup_outcome === 'dropped') return 'dropped';
  if (session.followup_outcome === 'replied') return 'replied';

  if (
    bookings.some(
      (b) =>
        b.session_id === session.id && (b.status === 'confirmed' || b.status === 'rescheduled'),
    )
  ) {
    return 'booked';
  }

  if (session.followup_sent_at) return 'sent';

  const contactEvents = events.filter((e) => e.session_id === session.id);
  const emailed = contactEvents.some((e) => e.type === 'prospect_note_emailed');
  if (
    contactEvents.some((e) =>
      ['linkedin_opened', 'booking_opened', 'chat_turn'].includes(e.type),
    ) ||
    // Automatic delivery also records one page_emailed event.
    contactEvents.filter((e) => e.type === 'page_emailed').length > (emailed ? 1 : 0) ||
    ((session.prospect_submitted_email || session.prospect_submitted_phone) && !emailed)
  )
    return 'review';
  if (session.first_viewed_at) return 'opened-no-action';

  const age = now - Date.parse(session.registered_at);
  return age >= DUE_AFTER && age <= FOLLOWUP_WINDOW ? 'due-no-tap' : null;
}

/** The queue the rep works through. Everything else is History. */
export function isActionable(state: FollowupState): boolean {
  return state === 'due-no-tap' || state === 'opened-no-action' || state === 'review';
}

export type FollowupIdentity = {
  channel: FollowupChannel;
  prospectName: string | null;
  repFullName: string;
  businessName: string | null;
};

/**
 * The draft for one lead, or null when there should not be one: closed and sent contacts
 * never get another message.
 * Uses only the problem the rep ticked and an optional quoted prospect question.
 */
export function followupDraft(
  session: FollowupSession,
  state: FollowupState,
  identity: FollowupIdentity,
  _now: number,
  question?: string | null,
): string | null {
  if (state === 'dropped' || state === 'replied' || state === 'sent') return null;

  return composeFollowupDraft({
    ...identity,
    problem: session.problems.find((p) => p.trim().length > 0) ?? null,
    state:
      question && (state === 'review' || state === 'opened-no-action' || state === 'due-no-tap')
        ? 'asked-question'
        : state === 'review'
          ? 'opened-no-action'
          : state,
    question,
  });
}

function met(registeredAt: string, now: number): string {
  const days = Math.floor((now - Date.parse(registeredAt)) / DAY);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The one line under a name: why this lead is on the list. */
export function followupReason(state: FollowupState, session: FollowupSession, now: number) {
  const when = met(session.registered_at, now);
  switch (state) {
    case 'due-no-tap':
      return `Not opened yet, met ${when}`;
    case 'opened-no-action':
      return `Opened their card, no meeting booked, met ${when}`;
    case 'review':
      return `No meeting booked, met ${when}`;
    case 'booked':
      return 'Meeting booked';
    case 'sent':
      return `You followed up ${session.followup_sent_at ? met(session.followup_sent_at, now) : ''}`.trim();
    case 'replied':
      return 'They replied';
    case 'dropped':
      return 'Dropped';
  }
}
