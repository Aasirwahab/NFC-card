import 'server-only';
import { serviceClient } from './service';
import { followupState } from '@/lib/followup/state';
import type { RequestChannel, RequestKind, BestTime } from '@/lib/domain/prospect-requests';

export type RepRequest = {
  id: string;
  sessionId: string;
  kind: RequestKind;
  channel: RequestChannel;
  contact: string;
  bestTime: BestTime | null;
  prospectName: string | null;
  repFullName: string;
  businessName: string | null;
  eventName: string | null;
  pagePath: string;
};

/** Scope the parent before loading any recipient, even with the service role. */
export async function listProspectRequests(
  userId: string,
  sessionId?: string,
): Promise<RepRequest[]> {
  const db = serviceClient();
  let query = db
    .from('sessions')
    .select(
      'id, status, details_completed_at, registered_at, first_viewed_at, followup_sent_at, followup_outcome, problems, prospect_submitted_email, prospect_submitted_phone, prospect_name, cards(code), events(name), bookings(session_id, status), prospect_requests!inner(id, kind, channel, contact_value, best_time, status, created_at, done_at)',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('prospect_requests.status', 'open');
  if (sessionId) query = query.eq('id', sessionId);
  const { data: sessions } = await query.throwOnError();
  const active = (sessions ?? []).filter(
    (s) => followupState(s, [], s.bookings, Date.now()) === 'request-open',
  );
  if (!active.length) return [];
  const [{ data: profile }, { data: business }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', userId).maybeSingle().throwOnError(),
    db
      .from('business_profiles')
      .select('company_name')
      .eq('user_id', userId)
      .maybeSingle()
      .throwOnError(),
  ]);
  return active.flatMap((s) =>
    s.prospect_requests.flatMap((r): RepRequest[] => {
      if (r.status !== 'open' || !s.cards) return [];
      return [
        {
          id: r.id,
          sessionId: s.id,
          kind: r.kind as RequestKind,
          channel: r.channel as RequestChannel,
          contact: r.contact_value,
          bestTime: r.best_time as BestTime | null,
          prospectName: s.prospect_name,
          repFullName: profile?.full_name?.trim() || 'the team',
          businessName: business?.company_name ?? null,
          eventName: s.events?.name ?? null,
          pagePath: `/c/${encodeURIComponent(s.cards.code)}`,
        },
      ];
    }),
  );
}
