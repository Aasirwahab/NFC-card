import 'server-only';
import { serviceClient } from './service';
import {
  FOLLOWUP_WINDOW,
  followupDraft,
  followupReason,
  followupState,
  isActionable,
  type FollowupState,
} from '@/lib/followup/state';
import { followupChannel, type FollowupChannel } from '@/lib/followup/draft';
import type { Row } from './types';

/**
 * Reads for the authenticated rep app.
 *
 * Every query here is scoped by `user_id` in the query itself. The service role
 * bypasses RLS, so RLS is not a check on this path at all — it is the backstop
 * for a future where something else queries the database (§22.6).
 */

export type EventSummary = Pick<
  Row<'events'>,
  'id' | 'name' | 'event_date' | 'location' | 'next_card_sequence' | 'target_cards'
>;

export async function listEvents(userId: string): Promise<EventSummary[]> {
  const { data } = await serviceClient()
    .from('events')
    .select('id, name, event_date, location, next_card_sequence, target_cards')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data ?? [];
}

/** The problems the rep has written a playbook entry for, oldest first, up to the 20 that Setup lists (the capture form's fallback chips). */
export async function listPlaybookProblems(userId: string): Promise<string[]> {
  const { data } = await serviceClient()
    .from('playbook_entries')
    .select('problem')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(20);
  return [...new Set((data ?? []).map((e) => e.problem.trim()).filter(Boolean))];
}

/** The niches and quick-select problem sets configured for one event (§3). */
export type Niche = { name: string; problems: string[] };

export async function getEvent(
  userId: string,
  eventId: string,
): Promise<(EventSummary & { niches: Niche[] }) | null> {
  const { data } = await serviceClient()
    .from('events')
    .select('id, name, event_date, location, next_card_sequence, target_cards, niches')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();

  if (!data) return null;

  return { ...data, niches: parseNiches(data.niches) };
}

/**
 * `events.niches` is jsonb, so it is whatever was written to it. Anything that
 * does not match the shape is dropped rather than rendered — a malformed niche
 * must not take the capture form down at an event.
 */
export function parseNiches(value: unknown): Niche[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): Niche[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const name = (entry as { name?: unknown }).name;
    const problems = (entry as { problems?: unknown }).problems;
    if (typeof name !== 'string' || name.trim() === '') return [];

    return [
      {
        name,
        problems: Array.isArray(problems)
          ? problems.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
          : [],
      },
    ];
  });
}

export type SessionListItem = Pick<
  Row<'sessions'>,
  | 'id'
  | 'event_id'
  | 'event_sequence_number'
  | 'colour_tag'
  | 'prospect_name'
  | 'prospect_company'
  | 'registered_at'
  | 'details_completed_at'
  | 'enrichment_status'
  | 'first_viewed_at'
  | 'linkedin_url'
  | 'prospect_email'
> & {
  /** The card this lead belongs to: its printed code is the handle for the lead. */
  cards: { code: string } | null;
};

const SESSION_LIST_COLUMNS =
  'id, event_id, event_sequence_number, colour_tag, prospect_name, prospect_company, ' +
  'registered_at, details_completed_at, enrichment_status, first_viewed_at, ' +
  'linkedin_url, prospect_email, cards(code)';

export type SessionFilter = {
  eventId?: string;
  /** "tapped" / "not tapped" — the dashboard's most-used split (§15.2). */
  tapped?: boolean;
  enrichmentStatus?: Row<'sessions'>['enrichment_status'];
};

export async function listSessions(
  userId: string,
  filter: SessionFilter = {},
): Promise<SessionListItem[]> {
  let query = serviceClient()
    .from('sessions')
    .select(SESSION_LIST_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('registered_at', { ascending: false });

  if (filter.eventId) query = query.eq('event_id', filter.eventId);
  if (filter.enrichmentStatus) query = query.eq('enrichment_status', filter.enrichmentStatus);
  if (filter.tapped === true) query = query.not('first_viewed_at', 'is', null);
  if (filter.tapped === false) query = query.is('first_viewed_at', null);

  const { data } = await query.returns<SessionListItem[]>();
  return data ?? [];
}

/**
 * One session, for the add-details form. This is the ONE read that includes
 * `memorable_info`: the rep wrote it and needs to edit it (§10.2). It never
 * leaves the authenticated app.
 */
export async function getSessionForRep(
  userId: string,
  sessionId: string,
): Promise<Row<'sessions'> | null> {
  const { data } = await serviceClient()
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle();

  return data;
}

export async function getProfile(userId: string): Promise<Row<'profiles'> | null> {
  const { data } = await serviceClient()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export async function getBusinessProfile(userId: string): Promise<Row<'business_profiles'> | null> {
  const { data } = await serviceClient()
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** One lead on the "Follow up today" list (§19.3). */
export type FollowupRow = {
  sessionId: string;
  state: FollowupState;
  /** Why they are on the list, in plain words. */
  reason: string;
  /** The message to send, or null when there is nothing to send. */
  draft: string | null;
  channel: FollowupChannel;
  prospectName: string | null;
  prospectCompany: string | null;
  linkedinUrl: string | null;
  prospectEmail: string | null;
  sequence: number;
  colour: string;
};

/** Work first: they clicked, then opened, then never opened. */
const ACTION_ORDER: FollowupState[] = ['review', 'opened-no-action', 'due-no-tap'];

/**
 * The rep's follow-ups, worked out now from their sessions, events and bookings
 * (no cron needed). `actionable` is the queue; `history` is everything already
 * sent, booked or closed. Both cover the last 30 days.
 */
export async function listFollowups(
  userId: string,
  now = Date.now(),
): Promise<{ actionable: FollowupRow[]; history: FollowupRow[] }> {
  const db = serviceClient();
  const { data: sessions } = await db
    .from('sessions')
    .select(
      'id, status, details_completed_at, registered_at, first_viewed_at, followup_sent_at, followup_outcome, problems, prospect_name, prospect_company, linkedin_url, prospect_email, event_sequence_number, colour_tag',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('details_completed_at', 'is', null)
    .gte('registered_at', new Date(now - FOLLOWUP_WINDOW).toISOString())
    .order('registered_at', { ascending: false });
  if (!sessions?.length) return { actionable: [], history: [] };

  const ids = sessions.map((s) => s.id);
  const [{ data: events }, { data: bookings }, { data: profile }, { data: business }] =
    await Promise.all([
      db
        .from('session_events')
        .select('session_id, type')
        .in('session_id', ids)
        .eq('type', 'linkedin_opened'),
      db.from('bookings').select('session_id, status').in('session_id', ids),
      db.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      db.from('business_profiles').select('company_name').eq('user_id', userId).maybeSingle(),
    ]);

  const rows: FollowupRow[] = sessions.flatMap((s) => {
    const state = followupState(s, events ?? [], bookings ?? [], now);
    if (!state) return [];
    const channel = followupChannel(s);
    return [
      {
        sessionId: s.id,
        state,
        reason: followupReason(state, s, now),
        draft: followupDraft(
          s,
          state,
          {
            channel,
            prospectName: s.prospect_name,
            repFullName: profile?.full_name?.trim() || 'the team',
            businessName: business?.company_name ?? null,
          },
          now,
        ),
        channel,
        prospectName: s.prospect_name,
        prospectCompany: s.prospect_company,
        linkedinUrl: s.linkedin_url,
        prospectEmail: s.prospect_email,
        sequence: s.event_sequence_number,
        colour: s.colour_tag,
      },
    ];
  });

  const actionable = rows
    .filter((r) => isActionable(r.state))
    .sort((a, b) => ACTION_ORDER.indexOf(a.state) - ACTION_ORDER.indexOf(b.state));
  return { actionable, history: rows.filter((r) => !isActionable(r.state)) };
}

export type SetupProgress = {
  photo: boolean;
  business: boolean;
  booking: boolean;
  playbook: boolean;
  tapTested: boolean;
};

/** What the rep has done to get ready: drives the first-run checklist on Today. */
export async function getSetupProgress(userId: string): Promise<SetupProgress> {
  const db = serviceClient();
  const [{ data: profile }, { data: business }, { count: playbook }, { count: tapped }] =
    await Promise.all([
      db.from('profiles').select('photo_url, booking_url').eq('id', userId).maybeSingle(),
      db.from('business_profiles').select('services').eq('user_id', userId).maybeSingle(),
      db
        .from('playbook_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      // Their own tap on a card registers it under their name (a prospect's tap is 'prospect_tap').
      db
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('registered_by', 'prospect_tap'),
    ]);
  return {
    photo: Boolean(profile?.photo_url),
    business: Boolean(business && business.services.length > 0),
    booking: Boolean(profile?.booking_url),
    playbook: (playbook ?? 0) > 0,
    tapTested: (tapped ?? 0) > 0,
  };
}
