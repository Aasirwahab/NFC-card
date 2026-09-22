import 'server-only';
import { decideAudience } from '@/lib/domain/audience';
import { viewForSession, type ProspectView } from '@/lib/domain/render-state';
import type { ContactCard } from '@/lib/domain/vcard';
import { serviceClient } from './service';
import type { Row } from './types';

/**
 * Resolving `/c/[code]` (spec §8, §16).
 *
 * One URL is tapped by two different people for two different reasons — the rep,
 * before handing the card over, and the prospect, hours later — so one route
 * serves both audiences and this module decides which.
 *
 *   card not found ................. generic 404 (never "no such code")
 *   signed in AND owns this card ... REP VIEW (never counts as a tap)
 *   everyone else .................. PROSPECT VIEW
 *
 * Every read here uses the service role, server-side. No browser reaches the
 * sessions table, which is what keeps prospect names and personal notes off the
 * public internet (§9.2).
 */

/**
 * The prospect-facing projection. `memorable_info` is NOT in it, and is not
 * selected from the database at all.
 *
 * "Arsenal fan, two kids" exists only because a human was in the room — it is the
 * real moat (§5) and the sharp edge (§23.1). It shapes the pitch's tone during
 * enrichment; it is never printed on the page and never repeated by the chatbot.
 * Leaving it out of the query is the cheapest way to guarantee that: a template
 * cannot render a field the server never loaded.
 */
const PROSPECT_SESSION_COLUMNS = [
  'id',
  'user_id',
  'event_id',
  'prospect_name',
  'prospect_company',
  'problems',
  'custom_problems',
  'enrichment_status',
  'generated_pitch',
  'rep_pitch',
  'first_viewed_at',
  'chat_response_count',
].join(', ');

export type ProspectSession = Pick<
  Row<'sessions'>,
  | 'id'
  | 'user_id'
  | 'event_id'
  | 'prospect_name'
  | 'prospect_company'
  | 'problems'
  | 'custom_problems'
  | 'enrichment_status'
  | 'generated_pitch'
  | 'rep_pitch'
  | 'first_viewed_at'
  | 'chat_response_count'
>;

/** What the rep view needs: enough to say "Card 3 — Blue, Tom at BuildRite". */
const REP_SESSION_COLUMNS =
  'id, event_sequence_number, colour_tag, prospect_name, prospect_company, ' +
  'registered_at, details_completed_at, enrichment_status, first_viewed_at';

export type RepSession = Pick<
  Row<'sessions'>,
  | 'id'
  | 'event_sequence_number'
  | 'colour_tag'
  | 'prospect_name'
  | 'prospect_company'
  | 'registered_at'
  | 'details_completed_at'
  | 'enrichment_status'
  | 'first_viewed_at'
>;

export type RepProfile = {
  fullName: string;
  title: string | null;
  photoUrl: string | null;
};

export type BusinessProfile = {
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  services: string[];
};

export type Resolved =
  | { audience: 'missing' }
  /**
   * The database could not be reached. Distinct from 'missing' on purpose: a
   * genuine miss tells the visitor the card is not active, and saying that
   * during an outage tells someone holding a perfectly good card to throw it
   * away. §16's rule is "never show a raw error", not "never tell the truth".
   *
   * This does not weaken the enumeration guarantee in §22.2. It is reachable
   * only by an infrastructure failure, never by guessing a code, so a real miss
   * and a known-card-with-no-session remain byte-identical.
   */
  | { audience: 'unavailable' }
  | {
      audience: 'rep';
      code: string;
      cardStatus: Row<'cards'>['status'];
      session: RepSession | null;
    }
  | {
      audience: 'prospect';
      code: string;
      session: ProspectSession;
      view: ProspectView;
      rep: RepProfile;
      business: BusinessProfile | null;
      eventName: string | null;
    };

export type { ProspectView };

/**
 * @param code    the normalised 8-character code from the URL
 * @param repId   the signed-in rep's user id, or null for an anonymous visitor
 */
export async function resolveCode(code: string, repId: string | null): Promise<Resolved> {
  const db = serviceClient();

  const { data: card, error: cardError } = await db
    .from('cards')
    .select('id, user_id, status')
    .eq('code', code)
    .maybeSingle();

  if (cardError) {
    // A query failure is not a missing card. Telling the difference is the
    // whole point of this branch.
    console.error(JSON.stringify({ event: 'resolve_code_unavailable', error: cardError.message }));
    return { audience: 'unavailable' };
  }

  // The audience is decided before the session is read, so each audience costs
  // exactly one query and the prospect's query never names memorable_info.
  //
  // A card is bound to exactly one session for its entire existence (§10.1), so
  // both reads below are a lookup rather than "the most recent session for this
  // card" — the query that used to show one prospect another prospect's details.
  const audience = decideAudience(card, repId);

  // `decideAudience` returns 'missing' exactly when there is no card, but the
  // compiler cannot see that through the function boundary — and an explicit
  // check here is cheaper than a non-null assertion that could outlive the rule.
  if (audience === 'missing' || !card) return { audience: 'missing' };

  // ------------------------------------------------------------- the rep
  if (audience === 'rep') {
    const { data: repSession } = await db
      .from('sessions')
      .select(REP_SESSION_COLUMNS)
      .eq('card_id', card.id)
      .eq('status', 'active')
      .maybeSingle<RepSession>();

    return { audience: 'rep', code, cardStatus: card.status, session: repSession ?? null };
  }

  // -------------------------------------------------------- the prospect
  const { data: session } = await db
    .from('sessions')
    .select(PROSPECT_SESSION_COLUMNS)
    .eq('card_id', card.id)
    .eq('status', 'active')
    .maybeSingle<ProspectSession>();

  // A known card with no live session returns the SAME generic 404 as an unknown
  // code. Nothing in the response distinguishes the two (§22.2).
  if (!session) return { audience: 'missing' };

  return prospectView(code, session);
}

type ProspectResolved = Extract<Resolved, { audience: 'prospect' }>;

/**
 * Everything around the session that the prospect page shows. Shared by the real
 * tap and the rep's preview (§14.5), so the preview cannot drift from the page.
 */
async function prospectView(
  code: string,
  session: ProspectSession,
): Promise<ProspectResolved | { audience: 'missing' }> {
  const db = serviceClient();

  const [{ data: profile }, { data: business }, { data: event }] = await Promise.all([
    db.from('profiles').select('full_name, title, photo_url').eq('id', session.user_id).single(),
    db
      .from('business_profiles')
      .select('company_name, tagline, logo_url, services')
      .eq('user_id', session.user_id)
      .maybeSingle(),
    db.from('events').select('name').eq('id', session.event_id).maybeSingle(),
  ]);

  // Without a profile there is no rep name to sign the page with. Rather than
  // render something broken, treat it as a miss.
  if (!profile) return { audience: 'missing' };

  return {
    audience: 'prospect',
    code,
    session,
    view: viewForSession(session),
    rep: {
      fullName: profile.full_name,
      title: profile.title,
      photoUrl: profile.photo_url,
    },
    business: business
      ? {
          companyName: business.company_name,
          tagline: business.tagline,
          logoUrl: business.logo_url,
          services: business.services,
        }
      : null,
    eventName: event?.name ?? null,
  };
}

/**
 * The prospect page for one of the rep's own sessions — "Preview as the prospect"
 * (§14.5). Scoped by user_id, so a rep can only ever preview their own. Null when
 * the session is not theirs, not active, or cannot be rendered.
 *
 * Reading this is not a tap: nothing here records a view (§10.4).
 */
export async function previewForRep(
  userId: string,
  sessionId: string,
): Promise<ProspectResolved | null> {
  const db = serviceClient();

  const { data: session } = await db
    .from('sessions')
    .select(`${PROSPECT_SESSION_COLUMNS}, card_id`)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle<ProspectSession & { card_id: string }>();

  if (!session) return null;

  const { data: card } = await db
    .from('cards')
    .select('code')
    .eq('id', session.card_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!card) return null;

  const resolved = await prospectView(card.code, session);
  return resolved.audience === 'prospect' ? resolved : null;
}

/**
 * The rep behind a card, for "Save the rep's contact". Only the REP's own details
 * are read — the vCard route never touches the prospect's (§ Phase 5).
 *
 * Same visibility as the page: a card with no live session is a miss.
 */
export async function contactForCode(code: string): Promise<ContactCard | null> {
  const db = serviceClient();

  const { data: card } = await db.from('cards').select('id').eq('code', code).maybeSingle();
  if (!card) return null;

  const { data: session } = await db
    .from('sessions')
    .select('user_id, event_id')
    .eq('card_id', card.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!session) return null;

  const [{ data: profile }, { data: business }, { data: event }] = await Promise.all([
    db
      .from('profiles')
      .select('full_name, title, phone, contact_email, linkedin_url')
      .eq('id', session.user_id)
      .maybeSingle(),
    db
      .from('business_profiles')
      .select('company_name, website')
      .eq('user_id', session.user_id)
      .maybeSingle(),
    db.from('events').select('name').eq('id', session.event_id).maybeSingle(),
  ]);
  if (!profile) return null;

  return {
    fullName: profile.full_name,
    title: profile.title,
    company: business?.company_name ?? null,
    phone: profile.phone,
    email: profile.contact_email,
    linkedinUrl: profile.linkedin_url,
    website: business?.website ?? null,
    note: event?.name ? `Met at ${event.name}` : null,
  };
}
